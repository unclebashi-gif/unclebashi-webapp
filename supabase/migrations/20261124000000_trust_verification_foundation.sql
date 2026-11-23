begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regprocedure('public.set_updated_at()') is null
     or pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_discovery(integer,timestamptz,uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null then
    raise exception 'Required Auth, profile, timestamp, or Matchmaking objects are missing.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'auth.users'::pg_catalog.regclass and attname = 'email_confirmed_at'
      and not attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'auth.users'::pg_catalog.regclass and attname = 'phone_confirmed_at'
      and not attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'auth.users'::pg_catalog.regclass and attname = 'phone'
      and not attisdropped
  ) then
    raise exception 'Auth must expose email and phone confirmation fields before verification projection can be created.';
  end if;

  if pg_catalog.to_regclass('public.user_verifications') is not null
     or pg_catalog.to_regprocedure('public.get_my_verification_status()') is not null then
    raise exception 'Unexpected pre-existing verification object; review before applying this migration.';
  end if;
end;
$preconditions$;

create table public.user_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identity_status text not null default 'not_submitted',
  identity_verified_at timestamptz,
  identity_provider text,
  identity_provider_reference text,
  identity_document_type text,
  identity_rejection_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint user_verifications_identity_status_check
    check (identity_status in ('not_submitted', 'pending', 'verified', 'rejected', 'expired')),
  constraint user_verifications_verified_timestamp_check
    check (identity_status <> 'verified' or identity_verified_at is not null),
  constraint user_verifications_provider_length_check
    check (identity_provider is null or pg_catalog.char_length(identity_provider) <= 100),
  constraint user_verifications_reference_length_check
    check (identity_provider_reference is null or pg_catalog.char_length(identity_provider_reference) <= 200),
  constraint user_verifications_document_type_length_check
    check (identity_document_type is null or pg_catalog.char_length(identity_document_type) <= 80),
  constraint user_verifications_rejection_reason_length_check
    check (identity_rejection_reason is null or pg_catalog.char_length(identity_rejection_reason) <= 500)
);

comment on table public.user_verifications is
  'Private verification metadata only. Does not store phone numbers, document numbers, document images, OCR, addresses, or biometric data.';
comment on column public.user_verifications.identity_provider_reference is
  'Opaque provider reference only; never a government document number or image URL.';

create trigger user_verifications_set_updated_at
before update on public.user_verifications
for each row execute function public.set_updated_at();

alter table public.user_verifications enable row level security;
revoke all privileges on table public.user_verifications from public, anon, authenticated, service_role;

create function public.get_my_verification_status()
returns table (
  email_verified boolean,
  phone_status text,
  masked_phone text,
  identity_status text,
  identity_rejection_reason text
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

  return query
  select
    auth_user.email_confirmed_at is not null,
    case when auth_user.phone_confirmed_at is not null then 'verified' else 'unverified' end,
    case
      when auth_user.phone_confirmed_at is not null and auth_user.phone is not null
        and pg_catalog.char_length(auth_user.phone) >= 4
        then '•••• ' || pg_catalog.right(auth_user.phone, 4)
      else null
    end,
    coalesce(verification_row.identity_status, 'not_submitted'),
    case when verification_row.identity_status = 'rejected'
      then verification_row.identity_rejection_reason
      else null
    end
  from auth.users as auth_user
  left join public.user_verifications as verification_row
    on verification_row.user_id = auth_user.id
  where auth_user.id = v_actor;
end;
$function$;

revoke all on function public.get_my_verification_status()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_verification_status() to authenticated;

do $postconditions$
declare
  v_oid oid;
  v_security_definer boolean;
  v_config text[];
  v_result text;
  v_definition text;
  v_privilege text;
  v_role text;
  v_column text;
  v_signature text;
begin
  if pg_catalog.to_regclass('public.user_verifications') is null then
    raise exception 'Postcondition failed: user_verifications is missing.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    where relation_row.oid = 'public.user_verifications'::pg_catalog.regclass
      and relation_row.relrowsecurity
  ) then
    raise exception 'Postcondition failed: user_verifications must have RLS enabled.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policy as policy_row
    where policy_row.polrelid = 'public.user_verifications'::pg_catalog.regclass
  ) then
    raise exception 'Postcondition failed: user_verifications must not have direct-access policies.';
  end if;

  -- PUBLIC grants also apply to anon, so anon denial proves no PUBLIC table/column privilege remains.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if pg_catalog.has_table_privilege(v_role, 'public.user_verifications', v_privilege) then
        raise exception 'Postcondition failed: role % has effective % access to user_verifications.', v_role, v_privilege;
      end if;
    end loop;
    foreach v_column in array array[
      'user_id', 'identity_status', 'identity_verified_at', 'identity_provider',
      'identity_provider_reference', 'identity_document_type', 'identity_rejection_reason',
      'created_at', 'updated_at'
    ] loop
      foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
        if pg_catalog.has_column_privilege(v_role, 'public.user_verifications', v_column, v_privilege) then
          raise exception 'Postcondition failed: role % has % on user_verifications column %.',
            v_role, v_privilege, v_column;
        end if;
      end loop;
    end loop;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.user_verifications'::pg_catalog.regclass
      and attribute_row.attnum > 0 and not attribute_row.attisdropped
  ) <> 9 or exists (
    select 1 from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.user_verifications'::pg_catalog.regclass
      and attribute_row.attnum > 0 and not attribute_row.attisdropped
      and attribute_row.attname not in (
        'created_at', 'identity_document_type', 'identity_provider',
        'identity_provider_reference', 'identity_rejection_reason',
        'identity_status', 'identity_verified_at', 'updated_at', 'user_id'
      )
  ) then
    raise exception 'Postcondition failed: user_verifications contains unexpected columns.';
  end if;

  foreach v_column in array array[
    'created_at', 'identity_document_type', 'identity_provider',
    'identity_provider_reference', 'identity_rejection_reason',
    'identity_status', 'identity_verified_at', 'updated_at', 'user_id'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_attribute as attribute_row
      where attribute_row.attrelid = 'public.user_verifications'::pg_catalog.regclass
        and attribute_row.attname = v_column
        and attribute_row.attnum > 0 and not attribute_row.attisdropped
    ) then
      raise exception 'Postcondition failed: required user_verifications column % is missing.', v_column;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.user_verifications'::pg_catalog.regclass
      and trigger_row.tgname = 'user_verifications_set_updated_at'
      and not trigger_row.tgisinternal
      and trigger_row.tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()')
  ) then
    raise exception 'Postcondition failed: user_verifications updated_at trigger is missing.';
  end if;

  v_oid := pg_catalog.to_regprocedure('public.get_my_verification_status()');
  if v_oid is null then
    raise exception 'Postcondition failed: get_my_verification_status() is missing.';
  end if;
  select procedure_row.prosecdef, procedure_row.proconfig,
         pg_catalog.pg_get_function_result(procedure_row.oid),
         pg_catalog.pg_get_functiondef(procedure_row.oid)
    into v_security_definer, v_config, v_result, v_definition
  from pg_catalog.pg_proc as procedure_row
  where procedure_row.oid = v_oid;

  if v_security_definer is not true or not exists (
    select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
    where pg_catalog.replace(config.setting, '"', '') = 'search_path='
  ) then
    raise exception 'Postcondition failed: owner status RPC must be SECURITY DEFINER with empty search_path.';
  end if;

  if pg_catalog.replace(v_result, ' ', '') <> 'TABLE(email_verifiedboolean,phone_statustext,masked_phonetext,identity_statustext,identity_rejection_reasontext)' then
    raise exception 'Postcondition failed: owner status RPC result shape is unexpected.';
  end if;

  -- Since PUBLIC privileges apply to anon, anon's denial also proves PUBLIC has no EXECUTE grant.
  if not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
     or pg_catalog.strpos(v_definition, 'auth.uid()') = 0
     or pg_catalog.strpos(v_definition, 'right(auth_user.phone, 4)') = 0
     or pg_catalog.strpos(v_definition, 'auth_user.id = v_actor') = 0 then
    raise exception 'Postcondition failed: owner RPC grants, owner scoping, or phone masking are incorrect.';
  end if;

  if pg_catalog.to_regprocedure('public.get_matchmaking_verification_badges(uuid)') is not null then
    raise exception 'Postcondition failed: no member-facing verification projection is approved in this wave.';
  end if;

  foreach v_signature in array array[
    'public.is_matchmaking_eligible(uuid)',
    'public.get_matchmaking_discovery(integer,timestamptz,uuid)',
    'public.get_matchmaking_profile(uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Postcondition failed: existing Matchmaking function % is missing.', v_signature;
    end if;
    select pg_catalog.pg_get_functiondef(v_oid) into v_definition
    from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
    if pg_catalog.strpos(v_definition, 'user_verifications') > 0
       or pg_catalog.strpos(v_definition, 'phone_confirmed_at') > 0 then
      raise exception 'Postcondition failed: Matchmaking eligibility/member projections must remain independent of verification.';
    end if;
  end loop;

  if pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null
     or pg_catalog.to_regclass('public.counselling_requests') is null then
    raise exception 'Postcondition failed: existing Matchmaking, Wave 4, Wave 5, or Wave 6 objects are missing.';
  end if;
end;
$postconditions$;

commit;
