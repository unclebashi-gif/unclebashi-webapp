begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_journeys') is null
     or pg_catalog.to_regclass('public.user_roles') is null
     or pg_catalog.to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Precondition failed: required identity, journey, role, or updated-at dependencies are missing.';
  end if;
end;
$preconditions$;

create table public.counselling_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_version smallint not null default 1,
  support_type text,
  preferred_contact_method text,
  contact_phone text,
  preferred_time_notes text,
  country_code text,
  brief_reason text,
  partner_participation text,
  urgency_self_description text,
  consent_to_contact boolean not null default false,
  status text not null default 'draft',
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint counselling_support_type_check check (
    support_type is null or support_type in (
      'couples_counselling', 'family_counselling', 'relationship_counselling',
      'individual_relationship_support', 'crisis_support', 'not_sure'
    )
  ),
  constraint counselling_contact_method_check check (
    preferred_contact_method is null or preferred_contact_method in ('email', 'phone', 'either')
  ),
  constraint counselling_contact_phone_check check (
    contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ()-]{5,23}$'
  ),
  constraint counselling_country_code_check check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint counselling_partner_participation_check check (
    partner_participation is null or partner_participation in ('yes', 'no', 'not_applicable', 'not_sure')
  ),
  constraint counselling_urgency_check check (
    urgency_self_description is null or urgency_self_description in ('routine', 'soon', 'urgent', 'immediate_danger')
  ),
  constraint counselling_status_check check (
    status in ('draft', 'submitted', 'under_review', 'contacted', 'referred', 'closed', 'withdrawn')
  ),
  constraint counselling_reason_length_check check (
    brief_reason is null or pg_catalog.char_length(brief_reason) <= 1500
  ),
  constraint counselling_time_notes_length_check check (
    preferred_time_notes is null or pg_catalog.char_length(preferred_time_notes) <= 800
  ),
  constraint counselling_request_lifecycle_check check (
    (status = 'draft' and submitted_at is null and withdrawn_at is null)
    or (status in ('submitted', 'under_review', 'contacted', 'referred', 'closed')
        and submitted_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null)
  )
);

create unique index counselling_requests_one_open_per_user_uidx
  on public.counselling_requests (user_id)
  where status not in ('closed', 'withdrawn');
create index counselling_requests_queue_idx
  on public.counselling_requests (status, submitted_at desc, id desc)
  where status <> 'draft';

create trigger counselling_requests_set_updated_at
before update on public.counselling_requests
for each row execute function public.set_updated_at();

alter table public.counselling_requests enable row level security;
revoke all privileges on table public.counselling_requests from public, anon, authenticated, service_role;

create function public._counselling_request_is_submittable(
  p_support_type text,
  p_contact_method text,
  p_contact_phone text,
  p_country_code text,
  p_brief_reason text,
  p_urgency text,
  p_consent boolean
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(
    p_support_type in (
      'couples_counselling', 'family_counselling', 'relationship_counselling',
      'individual_relationship_support', 'crisis_support', 'not_sure'
    )
    and p_contact_method in ('email', 'phone', 'either')
    and p_urgency in ('routine', 'soon', 'urgent', 'immediate_danger')
    and p_consent is true
    and (p_contact_method not in ('phone', 'either') or nullif(pg_catalog.btrim(p_contact_phone), '') is not null)
    and (p_urgency = 'immediate_danger' or (
      nullif(pg_catalog.btrim(p_brief_reason), '') is not null
      and p_country_code ~ '^[A-Z]{2}$'
    )),
    false
  );
$function$;

create function public.get_my_counselling_request()
returns setof public.counselling_requests
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  return query
  select request_row.*
  from public.counselling_requests as request_row
  where request_row.user_id = v_actor
  order by request_row.created_at desc, request_row.id desc
  limit 1;
end;
$function$;

create function public.save_counselling_request(p_request jsonb)
returns public.counselling_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_journey_status text;
  v_existing public.counselling_requests%rowtype;
  v_saved public.counselling_requests%rowtype;
  v_support_type text;
  v_contact_method text;
  v_contact_phone text;
  v_preferred_time_notes text;
  v_country_code text;
  v_brief_reason text;
  v_partner_participation text;
  v_urgency text;
  v_consent boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_request is null or pg_catalog.jsonb_typeof(p_request) <> 'object'
     or (p_request - array[
       'support_type', 'preferred_contact_method', 'contact_phone', 'preferred_time_notes',
       'country_code', 'brief_reason', 'partner_participation',
       'urgency_self_description', 'consent_to_contact'
     ]::text[]) <> '{}'::jsonb then
    raise exception 'Counselling request data is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_each(p_request) as field(key, value)
    where field.key <> 'consent_to_contact'
      and pg_catalog.jsonb_typeof(field.value) not in ('string', 'null')
  ) then
    raise exception 'Counselling request fields must use the available text selections.' using errcode = '22023';
  end if;
  if p_request ? 'consent_to_contact'
     and pg_catalog.jsonb_typeof(p_request->'consent_to_contact') not in ('boolean', 'null') then
    raise exception 'Contact consent must be selected explicitly.' using errcode = '22023';
  end if;

  v_support_type := nullif(pg_catalog.btrim(p_request->>'support_type'), '');
  v_contact_method := nullif(pg_catalog.btrim(p_request->>'preferred_contact_method'), '');
  v_contact_phone := nullif(pg_catalog.btrim(p_request->>'contact_phone'), '');
  if v_contact_phone is not null then
    if v_contact_phone !~ '^\+?[0-9][0-9 ()-]{5,23}$' then
      raise exception 'Enter a valid contact phone number.' using errcode = '22023';
    end if;
    v_contact_phone := pg_catalog.regexp_replace(v_contact_phone, '[ ()-]', '', 'g');
  end if;
  v_preferred_time_notes := nullif(pg_catalog.btrim(p_request->>'preferred_time_notes'), '');
  v_country_code := nullif(pg_catalog.upper(pg_catalog.btrim(p_request->>'country_code')), '');
  v_brief_reason := nullif(pg_catalog.btrim(p_request->>'brief_reason'), '');
  v_partner_participation := nullif(pg_catalog.btrim(p_request->>'partner_participation'), '');
  v_urgency := nullif(pg_catalog.btrim(p_request->>'urgency_self_description'), '');
  if p_request ? 'consent_to_contact' then
    v_consent := coalesce((p_request->>'consent_to_contact')::boolean, false);
  end if;

  if v_support_type is not null and v_support_type not in (
    'couples_counselling', 'family_counselling', 'relationship_counselling',
    'individual_relationship_support', 'crisis_support', 'not_sure'
  ) then raise exception 'Choose an available support type.' using errcode = '22023'; end if;
  if v_contact_method is not null and v_contact_method not in ('email', 'phone', 'either') then
    raise exception 'Choose an available contact method.' using errcode = '22023';
  end if;
  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Enter a two-letter country code.' using errcode = '22023';
  end if;
  if v_partner_participation is not null and v_partner_participation not in ('yes', 'no', 'not_applicable', 'not_sure') then
    raise exception 'Choose an available partner participation option.' using errcode = '22023';
  end if;
  if v_urgency is not null and v_urgency not in ('routine', 'soon', 'urgent', 'immediate_danger') then
    raise exception 'Choose an available urgency description.' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_brief_reason) > 1500 or pg_catalog.char_length(v_preferred_time_notes) > 800 then
    raise exception 'Counselling request text exceeds the allowed length.' using errcode = '22023';
  end if;

  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to edit this request.' using errcode = '42501';
  end if;
  select journey_row.status into v_journey_status
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'counselling'
  for update;
  if not found or v_journey_status is distinct from 'active' then
    raise exception 'Resume your Counselling journey before editing this request.' using errcode = '42501';
  end if;

  select request_row.* into v_existing
  from public.counselling_requests as request_row
  where request_row.user_id = v_actor and request_row.status not in ('closed', 'withdrawn')
  order by request_row.created_at desc, request_row.id desc
  limit 1 for update;
  if found and v_existing.status <> 'draft' then
    raise exception 'An active counselling request already exists. Withdraw it or wait for it to close before starting another.' using errcode = '42501';
  end if;

  if found then
    update public.counselling_requests as request_row set
      support_type = v_support_type,
      preferred_contact_method = v_contact_method,
      contact_phone = v_contact_phone,
      preferred_time_notes = v_preferred_time_notes,
      country_code = v_country_code,
      brief_reason = v_brief_reason,
      partner_participation = v_partner_participation,
      urgency_self_description = v_urgency,
      consent_to_contact = v_consent
    where request_row.id = v_existing.id
    returning request_row.* into v_saved;
  else
    insert into public.counselling_requests (
      user_id, support_type, preferred_contact_method, contact_phone,
      preferred_time_notes, country_code, brief_reason, partner_participation,
      urgency_self_description, consent_to_contact
    ) values (
      v_actor, v_support_type, v_contact_method, v_contact_phone,
      v_preferred_time_notes, v_country_code, v_brief_reason, v_partner_participation,
      v_urgency, v_consent
    ) returning * into v_saved;
  end if;
  return v_saved;
end;
$function$;

create function public.submit_counselling_request()
returns public.counselling_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_journey_status text;
  v_request public.counselling_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to submit this request.' using errcode = '42501';
  end if;
  select journey_row.status into v_journey_status
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'counselling'
  for update;
  if not found or v_journey_status is distinct from 'active' then
    raise exception 'Resume your Counselling journey before submitting this request.' using errcode = '42501';
  end if;
  select request_row.* into v_request
  from public.counselling_requests as request_row
  where request_row.user_id = v_actor and request_row.status = 'draft'
  order by request_row.created_at desc, request_row.id desc
  limit 1 for update;
  if not found then
    raise exception 'Save a counselling request draft before submitting.' using errcode = '22023';
  end if;
  if not public._counselling_request_is_submittable(
    v_request.support_type, v_request.preferred_contact_method, v_request.contact_phone,
    v_request.country_code, v_request.brief_reason, v_request.urgency_self_description,
    v_request.consent_to_contact
  ) then
    raise exception 'Complete the required counselling request details before submitting.' using errcode = '22023';
  end if;
  update public.counselling_requests as request_row
  set status = 'submitted', submitted_at = pg_catalog.now()
  where request_row.id = v_request.id
  returning request_row.* into v_request;
  return v_request;
end;
$function$;

create function public.withdraw_counselling_request()
returns public.counselling_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_request public.counselling_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to withdraw this request.' using errcode = '42501';
  end if;
  select request_row.* into v_request
  from public.counselling_requests as request_row
  where request_row.user_id = v_actor and request_row.status in ('submitted', 'under_review', 'contacted')
  order by request_row.created_at desc, request_row.id desc
  limit 1 for update;
  if not found then
    raise exception 'This counselling request can no longer be withdrawn.' using errcode = '22023';
  end if;
  update public.counselling_requests as request_row
  set status = 'withdrawn', withdrawn_at = pg_catalog.now()
  where request_row.id = v_request.id
  returning request_row.* into v_request;
  return v_request;
end;
$function$;

create function public.get_counselling_request_queue(
  p_status text default null,
  p_limit integer default 50
)
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  contact_email text,
  contact_phone text,
  country_code text,
  support_type text,
  urgency_self_description text,
  preferred_contact_method text,
  submitted_at timestamptz,
  brief_reason text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = v_actor and role_row.role in ('admin', 'moderator')
  ) then
    raise exception 'You are not authorized to manage counselling requests.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Request queue limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in (
    'submitted', 'under_review', 'contacted', 'referred', 'closed', 'withdrawn'
  ) then
    raise exception 'The requested counselling queue filter is invalid.' using errcode = '22023';
  end if;
  return query
  select request_row.id, request_row.user_id, nullif(profile_row.full_name, ''),
         case when request_row.preferred_contact_method in ('email', 'either') then profile_row.email else null end,
         case when request_row.preferred_contact_method in ('phone', 'either') then request_row.contact_phone else null end,
         request_row.country_code, request_row.support_type,
         request_row.urgency_self_description, request_row.preferred_contact_method,
         request_row.submitted_at, request_row.brief_reason, request_row.status
  from public.counselling_requests as request_row
  left join public.users as profile_row on profile_row.id = request_row.user_id
  where (p_status is null and request_row.status in ('submitted', 'under_review', 'contacted', 'referred'))
     or request_row.status = p_status
  order by request_row.submitted_at desc nulls last, request_row.id desc
  limit p_limit;
end;
$function$;

create function public.update_counselling_request_status(
  p_request_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current_status text;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = v_actor and role_row.role in ('admin', 'moderator')
  ) then
    raise exception 'You are not authorized to manage counselling requests.' using errcode = '42501';
  end if;
  if p_request_id is null or p_status is null then
    raise exception 'A request and an operational status are required.' using errcode = '22023';
  end if;
  select request_row.status into v_current_status
  from public.counselling_requests as request_row
  where request_row.id = p_request_id for update;
  if not found then
    raise exception 'Counselling request not found.' using errcode = '22023';
  end if;
  if not (
    (v_current_status = 'submitted' and p_status in ('under_review', 'closed'))
    or (v_current_status = 'under_review' and p_status in ('contacted', 'closed'))
    or (v_current_status = 'contacted' and p_status in ('referred', 'closed'))
    or (v_current_status = 'referred' and p_status = 'closed')
  ) then
    raise exception 'This counselling request status transition is not allowed.' using errcode = '22023';
  end if;
  update public.counselling_requests as request_row
  set status = p_status
  where request_row.id = p_request_id;
  return p_status;
end;
$function$;

revoke all on function public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_counselling_request()
  from public, anon, authenticated, service_role;
revoke all on function public.save_counselling_request(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_counselling_request()
  from public, anon, authenticated, service_role;
revoke all on function public.withdraw_counselling_request()
  from public, anon, authenticated, service_role;
revoke all on function public.get_counselling_request_queue(text,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.update_counselling_request_status(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_counselling_request() to authenticated;
grant execute on function public.save_counselling_request(jsonb) to authenticated;
grant execute on function public.submit_counselling_request() to authenticated;
grant execute on function public.withdraw_counselling_request() to authenticated;
grant execute on function public.get_counselling_request_queue(text,integer) to authenticated;
grant execute on function public.update_counselling_request_status(uuid,text) to authenticated;

do $postconditions$
declare
  v_signature text;
  v_oid oid;
  v_security_definer boolean;
  v_config text[];
  v_definition text;
  v_role text;
  v_privilege text;
begin
  if pg_catalog.to_regclass('public.counselling_requests') is null then
    raise exception 'Postcondition failed: counselling_requests is missing.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public' and relation_row.relname = 'counselling_requests'
      and relation_row.relrowsecurity
  ) then raise exception 'Postcondition failed: counselling_requests must have RLS enabled.'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if pg_catalog.has_table_privilege(v_role, 'public.counselling_requests', v_privilege) then
        raise exception 'Postcondition failed: role % has direct % access to counselling_requests.', v_role, v_privilege;
      end if;
    end loop;
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_index as index_row
    join pg_catalog.pg_class as index_class on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'public.counselling_requests'::pg_catalog.regclass
      and index_class.relname = 'counselling_requests_one_open_per_user_uidx'
  ) then raise exception 'Postcondition failed: one-open-request-per-owner guard is missing.'; end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.counselling_requests'::pg_catalog.regclass
      and trigger_row.tgname = 'counselling_requests_set_updated_at'
      and not trigger_row.tgisinternal
      and trigger_row.tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()')
  ) then raise exception 'Postcondition failed: counselling updated_at trigger is missing.'; end if;

  foreach v_signature in array array[
    'public.get_my_counselling_request()',
    'public.save_counselling_request(jsonb)',
    'public.submit_counselling_request()',
    'public.withdraw_counselling_request()',
    'public.get_counselling_request_queue(text,integer)',
    'public.update_counselling_request_status(uuid,text)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then raise exception 'Postcondition failed: expected counselling RPC % is missing.', v_signature; end if;
    select procedure_row.prosecdef, procedure_row.proconfig
      into v_security_definer, v_config
    from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
    if v_security_definer is not true or not exists (
      select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path='
    ) then raise exception 'Postcondition failed: RPC % must be SECURITY DEFINER with empty search_path.', v_signature; end if;
    if not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'Postcondition failed: authenticated must be able to call guarded RPC %.', v_signature;
    end if;
    if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'Postcondition failed: anonymous or service role can execute %.', v_signature;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('authenticated', 'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'Postcondition failed: internal counselling validation helper is executable by browser/service roles.';
  end if;
  foreach v_signature in array array[
    'public.get_counselling_request_queue(text,integer)',
    'public.update_counselling_request_status(uuid,text)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.strpos(v_definition, 'user_roles') = 0
       or pg_catalog.strpos(v_definition, 'admin') = 0
       or pg_catalog.strpos(v_definition, 'moderator') = 0 then
      raise exception 'Postcondition failed: operational counselling RPC % is missing its admin/moderator role check.', v_signature;
    end if;
  end loop;
  foreach v_signature in array array[
    'public.save_counselling_request(jsonb)',
    'public.submit_counselling_request()'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.strpos(v_definition, 'user_journeys') = 0
       or pg_catalog.strpos(v_definition, 'journey_type = ''counselling''') = 0
       or pg_catalog.strpos(v_definition, 'status is distinct from ''active''') = 0 then
      raise exception 'Postcondition failed: owner mutation RPC % must require an active Counselling journey.', v_signature;
    end if;
  end loop;
  v_oid := pg_catalog.to_regprocedure('public.withdraw_counselling_request()');
  select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
  if pg_catalog.strpos(v_definition, 'auth.uid()') = 0
     or pg_catalog.strpos(v_definition, 'request_row.user_id = v_actor') = 0
     or pg_catalog.strpos(v_definition, 'status in (''submitted'', ''under_review'', ''contacted'')') = 0 then
    raise exception 'Postcondition failed: owner withdrawal must use auth.uid() and only submitted, under-review, or contacted requests.';
  end if;
  if pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null
     or pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null then
    raise exception 'Postcondition failed: existing Wave 4/5 or Matchmaking eligibility objects are missing.';
  end if;
end;
$postconditions$;

commit;
