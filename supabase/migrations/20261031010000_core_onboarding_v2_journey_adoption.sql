begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('public.users') is null
    or pg_catalog.to_regclass('public.user_onboarding_data') is null
    or pg_catalog.to_regclass('public.user_journeys') is null
    or pg_catalog.to_regclass('public.matchmaking_profiles') is null then
    raise exception 'Required core identity, onboarding, journey, or Matchmaking profile table is missing.';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.matchmaking_profiles'::pg_catalog.regclass
      and constraint_row.conname = 'matchmaking_profiles_marital_status_check'
      and constraint_row.contype = 'c'
  ) then
    raise exception 'The current Matchmaking profile marital-status constraint is missing.';
  end if;
  if pg_catalog.to_regprocedure('public.activate_user_journey(text,boolean)') is null
    or pg_catalog.to_regprocedure('public.set_user_journey_status(text,text)') is null then
    raise exception 'Wave 1 journey lifecycle RPCs are required.';
  end if;
  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
    or pg_catalog.to_regprocedure('public.submit_matchmaking_profile()') is null then
    raise exception 'Current Matchmaking eligibility and submission RPCs are required.';
  end if;
end;
$preconditions$;

alter table public.matchmaking_profiles
  drop constraint matchmaking_profiles_marital_status_check,
  add constraint matchmaking_profiles_marital_status_check
    check (marital_status is null or marital_status in (
      'never_married', 'divorced', 'widowed', 'separated', 'annulled'
    ));

-- Adopt only unambiguous legacy intentions. Core civil/relationship fields are never inferred.
insert into public.user_journeys (user_id, journey_type, status, is_primary)
select
  profile.id,
  case profile.marriage_intention
    when 'seeking_marriage' then 'matchmaking'
    when 'preparing_for_marriage' then 'marriage_preparation'
    when 'strengthening_marriage' then 'marriage_support'
  end,
  'active',
  not exists (
    select 1
    from public.user_journeys as current_journey
    where current_journey.user_id = profile.id
      and current_journey.is_primary
  )
from public.users as profile
where profile.onboarding_completed is true
  and profile.primary_reason_for_joining is null
  and profile.marriage_intention in (
    'seeking_marriage', 'preparing_for_marriage', 'strengthening_marriage'
  )
  and not exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = profile.id
      and role_row.role = 'admin'
  )
on conflict (user_id, journey_type) do nothing;

update public.users as profile
set primary_reason_for_joining = case profile.marriage_intention
  when 'seeking_marriage' then 'matchmaking'
  when 'preparing_for_marriage' then 'marriage_preparation'
  when 'strengthening_marriage' then 'marriage_support'
end
where profile.onboarding_completed is true
  and profile.primary_reason_for_joining is null
  and profile.marriage_intention in (
    'seeking_marriage', 'preparing_for_marriage', 'strengthening_marriage'
  )
  and not exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = profile.id
      and role_row.role = 'admin'
  );

create or replace function public.activate_user_journey(
  p_journey_type text,
  p_make_primary boolean default false
)
returns setof public.user_journeys
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_journey public.user_journeys%rowtype;
  v_exists boolean := false;
  v_make_primary boolean := coalesce(p_make_primary, false);
  v_account_status text;
  v_onboarding_completed boolean;
  v_legal_status text;
  v_relationship_situation text;
begin
  if v_actor is null then
    raise exception 'Authentication is required to activate a journey.'
      using errcode = '42501';
  end if;

  if p_journey_type is null or p_journey_type not in (
    'marriage_education', 'marriage_preparation', 'matchmaking',
    'marriage_support', 'coaching', 'counselling'
  ) then
    raise exception 'Journey type is invalid.'
      using errcode = '22023';
  end if;

  select profile.account_status, profile.onboarding_completed,
         profile.legal_marital_status, profile.relationship_situation
    into v_account_status, v_onboarding_completed, v_legal_status, v_relationship_situation
  from public.users as profile
  where profile.id = v_actor
  for update;

  if not found then
    raise exception 'The authenticated account profile was not found.'
      using errcode = 'P0002';
  end if;
  if v_account_status is distinct from 'active' then
    raise exception 'An active account is required to activate a journey.'
      using errcode = '42501';
  end if;
  if v_onboarding_completed is not true then
    raise exception 'Complete Core Onboarding before activating a journey.'
      using errcode = '42501';
  end if;
  if p_journey_type = 'matchmaking'
    and not coalesce(
      v_legal_status in ('never_married', 'divorced', 'widowed', 'annulled')
      and v_relationship_situation = 'single',
      false
    ) then
    raise exception 'Marriage Matching requires an eligible single relationship status.'
      using errcode = '42501';
  end if;
  if p_journey_type = 'marriage_support'
    and not coalesce(
      v_legal_status in ('married', 'separated')
      or v_relationship_situation in ('married', 'separated'),
      false
    ) then
    raise exception 'Marriage Support requires a married or separated situation.'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text, 0)
  );

  select journey_row.*
    into v_journey
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor
    and journey_row.journey_type = p_journey_type
  for update;
  v_exists := found;

  if v_exists and v_journey.status = 'completed' then
    raise exception 'This journey is completed. Change its status before activating it again.'
      using errcode = '22023';
  end if;

  if v_make_primary then
    update public.user_journeys as journey_row
    set is_primary = false
    where journey_row.user_id = v_actor
      and journey_row.is_primary
      and journey_row.journey_type <> p_journey_type;
  end if;

  if v_exists then
    update public.user_journeys as journey_row
    set status = 'active',
        is_primary = case when v_make_primary then true else journey_row.is_primary end,
        completed_at = null,
        withdrawn_at = null
    where journey_row.user_id = v_actor
      and journey_row.journey_type = p_journey_type
    returning journey_row.* into v_journey;
  else
    insert into public.user_journeys (user_id, journey_type, status, is_primary)
    values (v_actor, p_journey_type, 'active', v_make_primary)
    returning * into v_journey;
  end if;

  return next v_journey;
end;
$function$;

create function public.complete_core_onboarding_v2(
  p_onboarding_data jsonb,
  p_display_name text,
  p_date_of_birth date,
  p_gender text,
  p_nationality_country_code text,
  p_country_of_origin_code text,
  p_country_code text,
  p_city text,
  p_primary_language text,
  p_other_languages text[],
  p_legal_marital_status text,
  p_relationship_situation text,
  p_primary_reason_for_joining text
)
returns table (
  id uuid,
  onboarding_completed boolean,
  onboarding_step smallint,
  display_name text,
  date_of_birth date,
  gender text,
  nationality_country_code text,
  country_of_origin_code text,
  country_code text,
  city text,
  primary_language text,
  other_languages text[],
  legal_marital_status text,
  relationship_situation text,
  primary_reason_for_joining text,
  journey_type text,
  journey_status text,
  journey_is_primary boolean,
  journey_started_at timestamptz,
  journey_created_at timestamptz,
  journey_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_onboarding_completed boolean;
  v_profile public.users%rowtype;
  v_journey public.user_journeys%rowtype;
  v_other_languages text[];
  v_snapshot jsonb;
  v_completed_at timestamptz := pg_catalog.now();
begin
  if v_actor is null then
    raise exception 'Authentication is required to complete setup.'
      using errcode = '42501';
  end if;
  if p_onboarding_data is null or pg_catalog.jsonb_typeof(p_onboarding_data) <> 'object' then
    raise exception 'Onboarding data must be a JSON object.'
      using errcode = '22023';
  end if;

  select profile.account_status, profile.onboarding_completed
    into v_account_status, v_onboarding_completed
  from public.users as profile
  where profile.id = v_actor
  for update;
  if not found then
    raise exception 'The authenticated account profile was not found.'
      using errcode = 'P0002';
  end if;
  if v_account_status is distinct from 'active' then
    raise exception 'An active account is required to complete setup.'
      using errcode = '42501';
  end if;
  if v_onboarding_completed is true then
    raise exception 'Core onboarding is already complete. Use profile and journey controls to make changes.'
      using errcode = '22023';
  end if;

  if nullif(pg_catalog.btrim(p_display_name), '') is null then
    raise exception 'Enter a display name.' using errcode = '22023';
  end if;
  if p_date_of_birth is null or p_date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'You must be at least 18 years old to use Uncle Bashi.' using errcode = '22023';
  end if;
  if p_gender is null or p_gender not in ('male', 'female') then
    raise exception 'Choose a valid gender to continue.' using errcode = '22023';
  end if;
  if coalesce(p_nationality_country_code, '') !~ '^[A-Z]{2}$'
    or coalesce(p_country_of_origin_code, '') !~ '^[A-Z]{2}$'
    or coalesce(p_country_code, '') !~ '^[A-Z]{2}$' then
    raise exception 'Nationality, country of origin and current country must use uppercase two-letter country codes.'
      using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_city), '') is null then
    raise exception 'Enter your current city or town.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_primary_language), '') is null then
    raise exception 'Enter your primary language.' using errcode = '22023';
  end if;
  if p_legal_marital_status is null or p_legal_marital_status not in (
    'never_married', 'married', 'divorced', 'widowed', 'separated', 'annulled', 'prefer_to_discuss'
  ) then
    raise exception 'Choose a valid legal marital status.' using errcode = '22023';
  end if;
  if p_relationship_situation is null or p_relationship_situation not in (
    'single', 'committed_relationship', 'engaged', 'married', 'separated', 'prefer_to_discuss'
  ) then
    raise exception 'Choose a valid current relationship situation.' using errcode = '22023';
  end if;
  if p_primary_reason_for_joining is null or p_primary_reason_for_joining not in (
    'marriage_education', 'marriage_preparation', 'matchmaking',
    'marriage_support', 'coaching', 'counselling'
  ) then
    raise exception 'Choose an initial primary journey.' using errcode = '22023';
  end if;
  if p_primary_reason_for_joining = 'matchmaking'
    and not coalesce(
      p_legal_marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
      and p_relationship_situation = 'single',
      false
    ) then
    raise exception 'Marriage Matching requires an eligible single relationship status.'
      using errcode = '22023';
  end if;
  if p_primary_reason_for_joining = 'marriage_support'
    and not coalesce(
      p_legal_marital_status in ('married', 'separated')
      or p_relationship_situation in ('married', 'separated'),
      false
    ) then
    raise exception 'Marriage Support requires a married or separated situation.'
      using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(pg_catalog.btrim(language_value)), array[]::text[])
    into v_other_languages
  from pg_catalog.unnest(coalesce(p_other_languages, array[]::text[])) as languages(language_value)
  where nullif(pg_catalog.btrim(language_value), '') is not null;

  v_snapshot := pg_catalog.jsonb_build_object(
    '_flowVersion', 'core_v2',
    '_currentStep', 6,
    '_completed', true,
    '_completedAt', v_completed_at,
    'displayName', pg_catalog.btrim(p_display_name),
    'dateOfBirth', p_date_of_birth,
    'gender', p_gender,
    'nationalityCountryCode', p_nationality_country_code,
    'countryOfOriginCode', p_country_of_origin_code,
    'countryCode', p_country_code,
    'city', pg_catalog.btrim(p_city),
    'primaryLanguage', pg_catalog.btrim(p_primary_language),
    'otherLanguages', v_other_languages,
    'legalMaritalStatus', p_legal_marital_status,
    'relationshipSituation', p_relationship_situation,
    'primaryReasonForJoining', p_primary_reason_for_joining
  );

  update public.users as profile
  set display_name = pg_catalog.btrim(p_display_name),
      date_of_birth = p_date_of_birth,
      gender = p_gender,
      nationality_country_code = p_nationality_country_code,
      country_of_origin_code = p_country_of_origin_code,
      country_code = p_country_code,
      city = pg_catalog.btrim(p_city),
      primary_language = pg_catalog.btrim(p_primary_language),
      other_languages = v_other_languages,
      legal_marital_status = p_legal_marital_status,
      relationship_situation = p_relationship_situation,
      primary_reason_for_joining = p_primary_reason_for_joining,
      onboarding_completed = true,
      onboarding_step = 10
  where profile.id = v_actor
  returning profile.* into v_profile;

  insert into public.user_onboarding_data (user_id, onboarding_data)
  values (v_actor, v_snapshot)
  on conflict (user_id) do update
    set onboarding_data = excluded.onboarding_data;

  select journey_row.*
    into v_journey
  from public.activate_user_journey(p_primary_reason_for_joining, true) as journey_row;

  return query
  select
    v_profile.id,
    v_profile.onboarding_completed,
    v_profile.onboarding_step,
    v_profile.display_name,
    v_profile.date_of_birth,
    v_profile.gender,
    v_profile.nationality_country_code,
    v_profile.country_of_origin_code,
    v_profile.country_code,
    v_profile.city,
    v_profile.primary_language,
    v_profile.other_languages,
    v_profile.legal_marital_status,
    v_profile.relationship_situation,
    v_profile.primary_reason_for_joining,
    v_journey.journey_type,
    v_journey.status,
    v_journey.is_primary,
    v_journey.started_at,
    v_journey.created_at,
    v_journey.updated_at;
end;
$function$;

create or replace function public.is_matchmaking_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users as u
    join public.matchmaking_profiles as p on p.user_id = u.id
    join public.matchmaking_preferences as f on f.user_id = u.id
    where u.id = p_user_id
      and u.onboarding_completed is true
      and u.date_of_birth is not null
      and u.date_of_birth <= (current_date - interval '18 years')::date
      and u.gender in ('male', 'female')
      and nullif(btrim(u.country_code), '') is not null
      and u.account_status = 'active'
      and u.legal_marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
      and u.relationship_situation = 'single'
      and exists (
        select 1
        from public.user_journeys as journey_row
        where journey_row.user_id = u.id
          and journey_row.journey_type = 'matchmaking'
          and journey_row.status = 'active'
      )
      and p.completion_percentage = 100
      and p.status = 'approved'
      and p.marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
      and f.preferred_partner_gender in ('male', 'female')
      and f.age_min between 18 and 100
      and f.age_max between f.age_min and 100
      and not public.is_community_user_suspended(u.id)
  );
$function$;

create or replace function public.submit_matchmaking_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_completion integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_completion := public.recompute_matchmaking_completion(v_user);
  if v_completion <> 100 then
    raise exception 'Complete all required profile and spouse preference fields first' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.users as u
    where u.id = v_user
      and u.onboarding_completed is true
      and u.date_of_birth <= (current_date - interval '18 years')::date
      and u.gender in ('male', 'female')
      and nullif(btrim(u.country_code), '') is not null
      and u.account_status = 'active'
      and u.legal_marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
      and u.relationship_situation = 'single'
      and exists (
        select 1
        from public.user_journeys as journey_row
        where journey_row.user_id = u.id
          and journey_row.journey_type = 'matchmaking'
          and journey_row.status = 'active'
      )
  ) then
    raise exception 'Account profile does not meet matchmaking prerequisites' using errcode = '22023';
  end if;
  if public.is_community_user_suspended(v_user) then
    raise exception 'Suspended accounts cannot submit matchmaking profiles' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.matchmaking_profiles as p
    where p.user_id = v_user
      and p.marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
      and p.status <> 'hidden'
  ) then
    raise exception 'Select an eligible marital status or contact support if profile is hidden' using errcode = '22023';
  end if;
  update public.matchmaking_profiles
  set status = 'pending_review', submitted_at = now()
  where user_id = v_user;
  return (
    select public.matchmaking_profile_user_projection(profile_row)
    from public.matchmaking_profiles as profile_row
    where profile_row.user_id = v_user
  );
end;
$function$;

revoke all on function public.activate_user_journey(text, boolean) from public, anon, authenticated;
grant execute on function public.activate_user_journey(text, boolean) to authenticated;
revoke all on function public.complete_core_onboarding_v2(
  jsonb, text, date, text, text, text, text, text, text, text[], text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_core_onboarding_v2(
  jsonb, text, date, text, text, text, text, text, text, text[], text, text, text
) to authenticated;
revoke all on function public.is_matchmaking_eligible(uuid) from public, anon, authenticated;
revoke all on function public.submit_matchmaking_profile() from public, anon, authenticated;
grant execute on function public.submit_matchmaking_profile() to authenticated;

do $postconditions$
begin
  if not pg_catalog.has_function_privilege('authenticated', 'public.complete_core_onboarding_v2(jsonb,text,date,text,text,text,text,text,text,text[],text,text,text)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.complete_core_onboarding_v2(jsonb,text,date,text,text,text,text,text,text,text[],text,text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: Core Onboarding RPC privileges are not restricted to authenticated users.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', 'public.activate_user_journey(text,boolean)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.activate_user_journey(text,boolean)', 'EXECUTE') then
    raise exception 'Postcondition failed: journey activation RPC privileges changed unexpectedly.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', 'public.submit_matchmaking_profile()', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.submit_matchmaking_profile()', 'EXECUTE') then
    raise exception 'Postcondition failed: Matchmaking submission RPC privileges changed unexpectedly.';
  end if;
end;
$postconditions$;

commit;
