begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_journeys') is null
     or pg_catalog.to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Precondition failed: authentication, Core Profile, journey, or updated-at dependencies are missing.';
  end if;
  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null then
    raise exception 'Precondition failed: existing Matchmaking eligibility function is missing.';
  end if;
end;
$preconditions$;

create table public.marriage_support_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_version smallint not null default 1,
  intake_completed_at timestamptz,
  support_areas text[] not null default array[]::text[],
  primary_concern text,
  desired_outcomes text,
  partner_participation text,
  preferred_support_path text,
  timing_preference text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint marriage_support_areas_allowed_check check (support_areas <@ array[
    'communication', 'emotional_connection', 'conflict_patterns', 'trust_after_hurt',
    'intimacy_and_affection', 'parenting_teamwork', 'finances_and_roles',
    'in_law_boundaries', 'faith_and_values', 'household_partnership', 'other'
  ]::text[]),
  constraint marriage_support_partner_participation_check check (
    partner_participation is null or partner_participation in ('yes', 'maybe', 'not_now', 'unknown')
  ),
  constraint marriage_support_preferred_path_check check (
    preferred_support_path is null or preferred_support_path in (
      'self_guided', 'couple_support', 'individual_guidance', 'coaching', 'counselling', 'not_sure'
    )
  ),
  constraint marriage_support_timing_check check (
    timing_preference is null or timing_preference in ('now', 'next_few_weeks', 'exploring')
  ),
  constraint marriage_support_primary_concern_length_check check (
    primary_concern is null or pg_catalog.char_length(primary_concern) <= 1500
  ),
  constraint marriage_support_desired_outcomes_length_check check (
    desired_outcomes is null or pg_catalog.char_length(desired_outcomes) <= 1500
  )
);

create table public.coaching_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_version smallint not null default 1,
  intake_completed_at timestamptz,
  focus_areas text[] not null default array[]::text[],
  primary_goal text,
  desired_outcome text,
  preferred_format text,
  session_frequency text,
  coach_gender_preference text,
  availability_notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint coaching_focus_areas_allowed_check check (focus_areas <@ array[
    'communication_skills', 'marriage_preparation', 'relationship_skills',
    'confidence_and_boundaries', 'family_roles', 'personal_growth', 'accountability',
    'conflict_skills', 'relationship_decision_making', 'other'
  ]::text[]),
  constraint coaching_preferred_format_check check (
    preferred_format is null or preferred_format in ('individual', 'couple', 'group', 'not_sure')
  ),
  constraint coaching_session_frequency_check check (
    session_frequency is null or session_frequency in ('one_off', 'weekly', 'biweekly', 'flexible')
  ),
  constraint coaching_gender_preference_check check (
    coach_gender_preference is null or coach_gender_preference in ('male', 'female', 'no_preference')
  ),
  constraint coaching_primary_goal_length_check check (
    primary_goal is null or pg_catalog.char_length(primary_goal) <= 1200
  ),
  constraint coaching_desired_outcome_length_check check (
    desired_outcome is null or pg_catalog.char_length(desired_outcome) <= 1500
  ),
  constraint coaching_availability_notes_length_check check (
    availability_notes is null or pg_catalog.char_length(availability_notes) <= 800
  )
);

create trigger marriage_support_profiles_set_updated_at
before update on public.marriage_support_profiles
for each row execute function public.set_updated_at();

create trigger coaching_profiles_set_updated_at
before update on public.coaching_profiles
for each row execute function public.set_updated_at();

alter table public.marriage_support_profiles enable row level security;
alter table public.coaching_profiles enable row level security;
revoke all privileges on table public.marriage_support_profiles, public.coaching_profiles
  from public, anon, authenticated, service_role;

create function public._marriage_support_intake_is_complete(
  p_support_areas text[],
  p_primary_concern text,
  p_desired_outcomes text,
  p_partner_participation text,
  p_preferred_support_path text,
  p_timing_preference text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.cardinality(p_support_areas) > 0
    and nullif(pg_catalog.btrim(p_primary_concern), '') is not null
    and nullif(pg_catalog.btrim(p_desired_outcomes), '') is not null
    and p_partner_participation in ('yes', 'maybe', 'not_now', 'unknown')
    and p_preferred_support_path in (
      'self_guided', 'couple_support', 'individual_guidance', 'coaching', 'counselling', 'not_sure'
    )
    and p_timing_preference in ('now', 'next_few_weeks', 'exploring'),
    false
  );
$function$;

create function public._coaching_intake_is_complete(
  p_focus_areas text[],
  p_primary_goal text,
  p_desired_outcome text,
  p_preferred_format text,
  p_session_frequency text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.cardinality(p_focus_areas) > 0
    and nullif(pg_catalog.btrim(p_primary_goal), '') is not null
    and nullif(pg_catalog.btrim(p_desired_outcome), '') is not null
    and p_preferred_format in ('individual', 'couple', 'group', 'not_sure')
    and p_session_frequency in ('one_off', 'weekly', 'biweekly', 'flexible'),
    false
  );
$function$;

create function public.get_my_marriage_support_profile()
returns setof public.marriage_support_profiles
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
  select profile_row.*
  from public.marriage_support_profiles as profile_row
  where profile_row.user_id = v_actor;
end;
$function$;

create function public.save_marriage_support_profile(p_profile jsonb)
returns public.marriage_support_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_journey_status text;
  v_existing public.marriage_support_profiles%rowtype;
  v_saved public.marriage_support_profiles%rowtype;
  v_support_areas text[];
  v_primary_concern text;
  v_desired_outcomes text;
  v_partner_participation text;
  v_preferred_support_path text;
  v_timing_preference text;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object'
     or (p_profile - array[
       'support_areas', 'primary_concern', 'desired_outcomes', 'partner_participation',
       'preferred_support_path', 'timing_preference'
     ]::text[]) <> '{}'::jsonb then
    raise exception 'Marriage Support intake data is invalid.' using errcode = '22023';
  end if;

  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to edit this intake.' using errcode = '42501';
  end if;
  select journey_row.status into v_journey_status
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'marriage_support'
  for update;
  if not found or v_journey_status is distinct from 'active' then
    raise exception 'Resume your Marriage Support journey before editing this intake.' using errcode = '42501';
  end if;

  select profile_row.* into v_existing
  from public.marriage_support_profiles as profile_row
  where profile_row.user_id = v_actor for update;

  if p_profile ? 'support_areas' then
    if pg_catalog.jsonb_typeof(p_profile->'support_areas') is distinct from 'array' then
      raise exception 'Choose Marriage Support areas from the available options.' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_profile->'support_areas') as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'string'
         or item.value #>> '{}' not in (
           'communication', 'emotional_connection', 'conflict_patterns', 'trust_after_hurt',
           'intimacy_and_affection', 'parenting_teamwork', 'finances_and_roles',
           'in_law_boundaries', 'faith_and_values', 'household_partnership', 'other'
         )
    ) then
      raise exception 'One or more Marriage Support areas are invalid.' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.array_agg(distinct item.value order by item.value), array[]::text[])
      into v_support_areas
    from pg_catalog.jsonb_array_elements_text(p_profile->'support_areas') as item(value);
  else
    v_support_areas := coalesce(v_existing.support_areas, array[]::text[]);
  end if;

  v_primary_concern := v_existing.primary_concern;
  if p_profile ? 'primary_concern' then
    if pg_catalog.jsonb_typeof(p_profile->'primary_concern') not in ('string', 'null') then
      raise exception 'Primary concern must be text.' using errcode = '22023';
    end if;
    v_primary_concern := nullif(pg_catalog.btrim(p_profile->>'primary_concern'), '');
  end if;
  v_desired_outcomes := v_existing.desired_outcomes;
  if p_profile ? 'desired_outcomes' then
    if pg_catalog.jsonb_typeof(p_profile->'desired_outcomes') not in ('string', 'null') then
      raise exception 'Desired outcomes must be text.' using errcode = '22023';
    end if;
    v_desired_outcomes := nullif(pg_catalog.btrim(p_profile->>'desired_outcomes'), '');
  end if;
  if pg_catalog.char_length(v_primary_concern) > 1500 or pg_catalog.char_length(v_desired_outcomes) > 1500 then
    raise exception 'Marriage Support text responses must be 1,500 characters or fewer.' using errcode = '22023';
  end if;

  v_partner_participation := v_existing.partner_participation;
  if p_profile ? 'partner_participation' then
    if pg_catalog.jsonb_typeof(p_profile->'partner_participation') not in ('string', 'null') then
      raise exception 'Partner participation selection is invalid.' using errcode = '22023';
    end if;
    v_partner_participation := nullif(pg_catalog.btrim(p_profile->>'partner_participation'), '');
  end if;
  if v_partner_participation is not null and v_partner_participation not in ('yes', 'maybe', 'not_now', 'unknown') then
    raise exception 'Partner participation selection is invalid.' using errcode = '22023';
  end if;

  v_preferred_support_path := v_existing.preferred_support_path;
  if p_profile ? 'preferred_support_path' then
    if pg_catalog.jsonb_typeof(p_profile->'preferred_support_path') not in ('string', 'null') then
      raise exception 'Preferred support path is invalid.' using errcode = '22023';
    end if;
    v_preferred_support_path := nullif(pg_catalog.btrim(p_profile->>'preferred_support_path'), '');
  end if;
  if v_preferred_support_path is not null and v_preferred_support_path not in (
    'self_guided', 'couple_support', 'individual_guidance', 'coaching', 'counselling', 'not_sure'
  ) then
    raise exception 'Preferred support path is invalid.' using errcode = '22023';
  end if;

  v_timing_preference := v_existing.timing_preference;
  if p_profile ? 'timing_preference' then
    if pg_catalog.jsonb_typeof(p_profile->'timing_preference') not in ('string', 'null') then
      raise exception 'Timing selection is invalid.' using errcode = '22023';
    end if;
    v_timing_preference := nullif(pg_catalog.btrim(p_profile->>'timing_preference'), '');
  end if;
  if v_timing_preference is not null and v_timing_preference not in ('now', 'next_few_weeks', 'exploring') then
    raise exception 'Timing selection is invalid.' using errcode = '22023';
  end if;

  insert into public.marriage_support_profiles as current_profile (
    user_id, support_areas, primary_concern, desired_outcomes, partner_participation,
    preferred_support_path, timing_preference, intake_completed_at
  ) values (
    v_actor, v_support_areas, v_primary_concern, v_desired_outcomes, v_partner_participation,
    v_preferred_support_path, v_timing_preference, null
  )
  on conflict (user_id) do update set
    support_areas = excluded.support_areas,
    primary_concern = excluded.primary_concern,
    desired_outcomes = excluded.desired_outcomes,
    partner_participation = excluded.partner_participation,
    preferred_support_path = excluded.preferred_support_path,
    timing_preference = excluded.timing_preference,
    intake_completed_at = case
      when current_profile.intake_completed_at is not null
       and public._marriage_support_intake_is_complete(
         excluded.support_areas, excluded.primary_concern, excluded.desired_outcomes,
         excluded.partner_participation, excluded.preferred_support_path, excluded.timing_preference
       ) then current_profile.intake_completed_at
      else null
    end
  returning * into v_saved;
  return v_saved;
end;
$function$;

create function public.complete_marriage_support_intake()
returns public.marriage_support_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_journey_status text;
  v_profile public.marriage_support_profiles%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to complete this intake.' using errcode = '42501';
  end if;
  select journey_row.status into v_journey_status
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'marriage_support'
  for update;
  if not found or v_journey_status is distinct from 'active' then
    raise exception 'Resume your Marriage Support journey before completing this intake.' using errcode = '42501';
  end if;
  select profile_row.* into v_profile
  from public.marriage_support_profiles as profile_row
  where profile_row.user_id = v_actor for update;
  if not found then
    raise exception 'Save a Marriage Support draft before completing it.' using errcode = '22023';
  end if;
  if not public._marriage_support_intake_is_complete(
    v_profile.support_areas, v_profile.primary_concern, v_profile.desired_outcomes,
    v_profile.partner_participation, v_profile.preferred_support_path, v_profile.timing_preference
  ) then
    raise exception 'Complete each required Marriage Support response before continuing.' using errcode = '22023';
  end if;
  update public.marriage_support_profiles as profile_row
  set intake_completed_at = pg_catalog.now()
  where profile_row.user_id = v_actor
  returning profile_row.* into v_profile;
  return v_profile;
end;
$function$;

create function public.get_my_coaching_profile()
returns setof public.coaching_profiles
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
  select profile_row.*
  from public.coaching_profiles as profile_row
  where profile_row.user_id = v_actor;
end;
$function$;

create function public.save_coaching_profile(p_profile jsonb)
returns public.coaching_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_journey_status text;
  v_existing public.coaching_profiles%rowtype;
  v_saved public.coaching_profiles%rowtype;
  v_focus_areas text[];
  v_primary_goal text;
  v_desired_outcome text;
  v_preferred_format text;
  v_session_frequency text;
  v_coach_gender_preference text;
  v_availability_notes text;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object'
     or (p_profile - array[
       'focus_areas', 'primary_goal', 'desired_outcome', 'preferred_format',
       'session_frequency', 'coach_gender_preference', 'availability_notes'
     ]::text[]) <> '{}'::jsonb then
    raise exception 'Coaching intake data is invalid.' using errcode = '22023';
  end if;
  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to edit this intake.' using errcode = '42501';
  end if;
  select journey_row.status into v_journey_status
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'coaching'
  for update;
  if not found or v_journey_status is distinct from 'active' then
    raise exception 'Resume your Coaching journey before editing this intake.' using errcode = '42501';
  end if;
  select profile_row.* into v_existing
  from public.coaching_profiles as profile_row
  where profile_row.user_id = v_actor for update;

  if p_profile ? 'focus_areas' then
    if pg_catalog.jsonb_typeof(p_profile->'focus_areas') is distinct from 'array' then
      raise exception 'Choose coaching focus areas from the available options.' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_profile->'focus_areas') as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'string'
         or item.value #>> '{}' not in (
           'communication_skills', 'marriage_preparation', 'relationship_skills',
           'confidence_and_boundaries', 'family_roles', 'personal_growth', 'accountability',
           'conflict_skills', 'relationship_decision_making', 'other'
         )
    ) then
      raise exception 'One or more coaching focus areas are invalid.' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.array_agg(distinct item.value order by item.value), array[]::text[])
      into v_focus_areas
    from pg_catalog.jsonb_array_elements_text(p_profile->'focus_areas') as item(value);
  else
    v_focus_areas := coalesce(v_existing.focus_areas, array[]::text[]);
  end if;

  v_primary_goal := v_existing.primary_goal;
  if p_profile ? 'primary_goal' then
    if pg_catalog.jsonb_typeof(p_profile->'primary_goal') not in ('string', 'null') then
      raise exception 'Primary goal must be text.' using errcode = '22023';
    end if;
    v_primary_goal := nullif(pg_catalog.btrim(p_profile->>'primary_goal'), '');
  end if;
  v_desired_outcome := v_existing.desired_outcome;
  if p_profile ? 'desired_outcome' then
    if pg_catalog.jsonb_typeof(p_profile->'desired_outcome') not in ('string', 'null') then
      raise exception 'Desired outcome must be text.' using errcode = '22023';
    end if;
    v_desired_outcome := nullif(pg_catalog.btrim(p_profile->>'desired_outcome'), '');
  end if;
  v_availability_notes := v_existing.availability_notes;
  if p_profile ? 'availability_notes' then
    if pg_catalog.jsonb_typeof(p_profile->'availability_notes') not in ('string', 'null') then
      raise exception 'Availability notes must be text.' using errcode = '22023';
    end if;
    v_availability_notes := nullif(pg_catalog.btrim(p_profile->>'availability_notes'), '');
  end if;
  if pg_catalog.char_length(v_primary_goal) > 1200
     or pg_catalog.char_length(v_desired_outcome) > 1500
     or pg_catalog.char_length(v_availability_notes) > 800 then
    raise exception 'Coaching text responses exceed the allowed length.' using errcode = '22023';
  end if;

  v_preferred_format := v_existing.preferred_format;
  if p_profile ? 'preferred_format' then
    if pg_catalog.jsonb_typeof(p_profile->'preferred_format') not in ('string', 'null') then
      raise exception 'Preferred coaching format is invalid.' using errcode = '22023';
    end if;
    v_preferred_format := nullif(pg_catalog.btrim(p_profile->>'preferred_format'), '');
  end if;
  if v_preferred_format is not null and v_preferred_format not in ('individual', 'couple', 'group', 'not_sure') then
    raise exception 'Preferred coaching format is invalid.' using errcode = '22023';
  end if;
  v_session_frequency := v_existing.session_frequency;
  if p_profile ? 'session_frequency' then
    if pg_catalog.jsonb_typeof(p_profile->'session_frequency') not in ('string', 'null') then
      raise exception 'Session frequency is invalid.' using errcode = '22023';
    end if;
    v_session_frequency := nullif(pg_catalog.btrim(p_profile->>'session_frequency'), '');
  end if;
  if v_session_frequency is not null and v_session_frequency not in ('one_off', 'weekly', 'biweekly', 'flexible') then
    raise exception 'Session frequency is invalid.' using errcode = '22023';
  end if;
  v_coach_gender_preference := v_existing.coach_gender_preference;
  if p_profile ? 'coach_gender_preference' then
    if pg_catalog.jsonb_typeof(p_profile->'coach_gender_preference') not in ('string', 'null') then
      raise exception 'Coach gender preference is invalid.' using errcode = '22023';
    end if;
    v_coach_gender_preference := nullif(pg_catalog.btrim(p_profile->>'coach_gender_preference'), '');
  end if;
  if v_coach_gender_preference is not null and v_coach_gender_preference not in ('male', 'female', 'no_preference') then
    raise exception 'Coach gender preference is invalid.' using errcode = '22023';
  end if;

  insert into public.coaching_profiles as current_profile (
    user_id, focus_areas, primary_goal, desired_outcome, preferred_format,
    session_frequency, coach_gender_preference, availability_notes, intake_completed_at
  ) values (
    v_actor, v_focus_areas, v_primary_goal, v_desired_outcome, v_preferred_format,
    v_session_frequency, v_coach_gender_preference, v_availability_notes, null
  )
  on conflict (user_id) do update set
    focus_areas = excluded.focus_areas,
    primary_goal = excluded.primary_goal,
    desired_outcome = excluded.desired_outcome,
    preferred_format = excluded.preferred_format,
    session_frequency = excluded.session_frequency,
    coach_gender_preference = excluded.coach_gender_preference,
    availability_notes = excluded.availability_notes,
    intake_completed_at = case
      when current_profile.intake_completed_at is not null
       and public._coaching_intake_is_complete(
         excluded.focus_areas, excluded.primary_goal, excluded.desired_outcome,
         excluded.preferred_format, excluded.session_frequency
       ) then current_profile.intake_completed_at
      else null
    end
  returning * into v_saved;
  return v_saved;
end;
$function$;

create function public.complete_coaching_intake()
returns public.coaching_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
  v_journey_status text;
  v_profile public.coaching_profiles%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found or v_account_status is distinct from 'active' then
    raise exception 'An active account is required to complete this intake.' using errcode = '42501';
  end if;
  select journey_row.status into v_journey_status
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'coaching'
  for update;
  if not found or v_journey_status is distinct from 'active' then
    raise exception 'Resume your Coaching journey before completing this intake.' using errcode = '42501';
  end if;
  select profile_row.* into v_profile
  from public.coaching_profiles as profile_row
  where profile_row.user_id = v_actor for update;
  if not found then
    raise exception 'Save a Coaching draft before completing it.' using errcode = '22023';
  end if;
  if not public._coaching_intake_is_complete(
    v_profile.focus_areas, v_profile.primary_goal, v_profile.desired_outcome,
    v_profile.preferred_format, v_profile.session_frequency
  ) then
    raise exception 'Complete each required Coaching response before continuing.' using errcode = '22023';
  end if;
  update public.coaching_profiles as profile_row
  set intake_completed_at = pg_catalog.now()
  where profile_row.user_id = v_actor
  returning profile_row.* into v_profile;
  return v_profile;
end;
$function$;

revoke all on function public._marriage_support_intake_is_complete(text[],text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public._coaching_intake_is_complete(text[],text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_marriage_support_profile()
  from public, anon, authenticated, service_role;
revoke all on function public.save_marriage_support_profile(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_marriage_support_intake()
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_coaching_profile()
  from public, anon, authenticated, service_role;
revoke all on function public.save_coaching_profile(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_coaching_intake()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_marriage_support_profile() to authenticated;
grant execute on function public.save_marriage_support_profile(jsonb) to authenticated;
grant execute on function public.complete_marriage_support_intake() to authenticated;
grant execute on function public.get_my_coaching_profile() to authenticated;
grant execute on function public.save_coaching_profile(jsonb) to authenticated;
grant execute on function public.complete_coaching_intake() to authenticated;

do $postconditions$
declare
  v_table text;
  v_role text;
  v_privilege text;
  v_signature text;
  v_oid oid;
  v_security_definer boolean;
  v_config text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public' and relation_row.relname = 'marriage_support_profiles'
      and relation_row.relrowsecurity
  ) or not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public' and relation_row.relname = 'coaching_profiles'
      and relation_row.relrowsecurity
  ) then
    raise exception 'Postcondition failed: both private intake tables must have RLS enabled.';
  end if;

  foreach v_table in array array['public.marriage_support_profiles', 'public.coaching_profiles'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if pg_catalog.has_table_privilege(v_role, v_table, v_privilege) then
          raise exception 'Postcondition failed: role % has direct % privilege on private intake table %.', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;
  end loop;

  foreach v_signature in array array[
    'public._marriage_support_intake_is_complete(text[],text,text,text,text,text)',
    'public._coaching_intake_is_complete(text[],text,text,text,text)',
    'public.get_my_marriage_support_profile()',
    'public.save_marriage_support_profile(jsonb)',
    'public.complete_marriage_support_intake()',
    'public.get_my_coaching_profile()',
    'public.save_coaching_profile(jsonb)',
    'public.complete_coaching_intake()'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Postcondition failed: expected intake function % is missing.', v_signature;
    end if;
    select procedure_row.prosecdef, procedure_row.proconfig
      into v_security_definer, v_config
    from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
    if v_security_definer is not true or not exists (
      select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path='
    ) then
      raise exception 'Postcondition failed: intake function % must be SECURITY DEFINER with empty search_path.', v_signature;
    end if;
  end loop;

  if not pg_catalog.has_function_privilege('authenticated', 'public.get_my_marriage_support_profile()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.save_marriage_support_profile(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.complete_marriage_support_intake()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_my_coaching_profile()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.save_coaching_profile(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.complete_coaching_intake()', 'EXECUTE') then
    raise exception 'Postcondition failed: authenticated owner intake RPC grants are incomplete.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.get_my_marriage_support_profile()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.save_marriage_support_profile(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.complete_marriage_support_intake()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.get_my_coaching_profile()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.save_coaching_profile(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.complete_coaching_intake()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_my_marriage_support_profile()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.save_marriage_support_profile(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.complete_marriage_support_intake()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_my_coaching_profile()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.save_coaching_profile(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.complete_coaching_intake()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._marriage_support_intake_is_complete(text[],text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._coaching_intake_is_complete(text[],text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._marriage_support_intake_is_complete(text[],text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._coaching_intake_is_complete(text[],text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public._marriage_support_intake_is_complete(text[],text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public._coaching_intake_is_complete(text[],text,text,text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: anonymous, service-role, or unexpected browser access to intake RPCs/helpers is too broad.';
  end if;

  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null then
    raise exception 'Postcondition failed: existing Matchmaking eligibility or Wave 4 photo objects are missing.';
  end if;
end;
$postconditions$;

commit;
