-- Initial identity and onboarding schema for Uncle Bashi.
-- Apply only through an explicitly approved Supabase migration workflow.

begin;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  profile_image_url text,

  onboarding_completed boolean not null default false,
  onboarding_step smallint not null default 0
    check (onboarding_step between 0 and 10),

  date_of_birth date,
  gender text,

  country_code text
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  city text,
  location text,
  location_category text
    check (location_category is null or location_category in ('local', 'diaspora', 'other')),

  marriage_intention text,
  marriage_timeline text,
  commitment_level text,
  values_assessment text[] not null default '{}'::text[],
  readiness_score integer not null default 0
    check (readiness_score between 0 and 100),
  partner_preferences text,

  matchmaking_unlocked boolean not null default false,

  bio text,
  occupation text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_lower_uidx
  on public.users (lower(email));

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    check (role in ('user', 'coach', 'moderator', 'admin')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_roles_user_id_role_key unique (user_id, role)
);

create index user_roles_role_user_id_idx
  on public.user_roles (role, user_id);

create table public.user_onboarding_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  onboarding_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger user_onboarding_data_set_updated_at
before update on public.user_onboarding_data
for each row execute function public.set_updated_at();

create function public.provision_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    profile_image_url
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      ''
    ),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    )
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.provision_auth_user();

create function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

revoke all on function public.sync_auth_user_email() from public, anon, authenticated;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_auth_user_email();

create function public.complete_onboarding(
  p_onboarding_data jsonb,
  p_marriage_intention text,
  p_commitment_level text,
  p_values_assessment text[],
  p_date_of_birth date,
  p_gender text,
  p_country_code text,
  p_city text,
  p_location text,
  p_location_category text,
  p_marriage_timeline text,
  p_partner_preferences text
)
returns table (
  id uuid,
  onboarding_completed boolean,
  onboarding_step smallint,
  readiness_score integer,
  marriage_intention text,
  commitment_level text,
  values_assessment text[],
  gender text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_readiness_answers jsonb;
  v_readiness_score integer;
  v_answer_count integer;
  v_total_score numeric;
  v_invalid_answer boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to complete onboarding.'
      using errcode = '42501';
  end if;

  if p_onboarding_data is null or jsonb_typeof(p_onboarding_data) is distinct from 'object' then
    raise exception 'Onboarding data must be a JSON object.'
      using errcode = '22023';
  end if;

  -- Keep the typed summary arguments consistent with the final JSON snapshot.
  if (p_onboarding_data ->> 'marriageIntention') is distinct from p_marriage_intention
    or (p_onboarding_data ->> 'commitmentLevel') is distinct from p_commitment_level
    or (p_onboarding_data ->> 'dateOfBirth')::date is distinct from p_date_of_birth
    or (p_onboarding_data ->> 'gender') is distinct from p_gender
    or (p_onboarding_data ->> 'countryCode') is distinct from p_country_code
    or (p_onboarding_data ->> 'city') is distinct from p_city
    or (p_onboarding_data ->> 'location') is distinct from p_location
    or (p_onboarding_data ->> 'locationCategory') is distinct from p_location_category
    or (p_onboarding_data ->> 'marriageTimeline') is distinct from p_marriage_timeline
    or (p_onboarding_data ->> 'partnerPreferences') is distinct from p_partner_preferences
    or to_jsonb(p_values_assessment) is distinct from p_onboarding_data -> 'selectedValues'
  then
    raise exception 'Onboarding summary values do not match the final onboarding data.'
      using errcode = '22023';
  end if;

  if p_country_code is not null and p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Country code must be a two-letter uppercase code.'
      using errcode = '22023';
  end if;

  if p_location_category is not null
    and p_location_category not in ('local', 'diaspora', 'other') then
    raise exception 'Location category is invalid.'
      using errcode = '22023';
  end if;

  if p_values_assessment is null
    or cardinality(p_values_assessment) < 3
    or cardinality(p_values_assessment) > 10 then
    raise exception 'Select between 3 and 10 values.'
      using errcode = '22023';
  end if;

  v_readiness_answers := p_onboarding_data -> 'readinessAnswers';
  if v_readiness_answers is null or jsonb_typeof(v_readiness_answers) is distinct from 'object' then
    raise exception 'All eight readiness answers are required.'
      using errcode = '22023';
  end if;

  if jsonb_object_length(v_readiness_answers) <> 8
    or not (v_readiness_answers ?& array[
      'emotional', 'financial', 'communication', 'conflict',
      'accountability', 'growth', 'expectations', 'support'
    ]) then
    raise exception 'All eight readiness answers are required.'
      using errcode = '22023';
  end if;

  select
    count(*)::integer,
    coalesce(bool_or(
      jsonb_typeof(answer.value) is distinct from 'number'
      or (answer.value #>> '{}')::numeric <> trunc((answer.value #>> '{}')::numeric)
      or (answer.value #>> '{}')::numeric < 1
      or (answer.value #>> '{}')::numeric > 5
    ), false),
    sum((answer.value #>> '{}')::numeric)
  into v_answer_count, v_invalid_answer, v_total_score
  from jsonb_each(v_readiness_answers) as answer(key, value);

  if v_answer_count <> 8 or v_invalid_answer then
    raise exception 'Each readiness answer must be an integer from 1 to 5.'
      using errcode = '22023';
  end if;

  -- Match the current eight-question frontend formula: round(sum / 40 * 100).
  v_readiness_score := round((v_total_score / 40) * 100)::integer;

  perform 1
  from public.users as profile
  where profile.id = v_user_id
  for update;

  if not found then
    raise exception 'The authenticated account has no provisioned profile.'
      using errcode = 'P0002';
  end if;

  insert into public.user_onboarding_data (user_id, onboarding_data)
  values (v_user_id, p_onboarding_data)
  on conflict (user_id) do update
    set onboarding_data = excluded.onboarding_data;

  return query
  update public.users as profile
  set
    marriage_intention = p_marriage_intention,
    commitment_level = p_commitment_level,
    values_assessment = p_values_assessment,
    readiness_score = v_readiness_score,
    date_of_birth = p_date_of_birth,
    gender = p_gender,
    country_code = p_country_code,
    city = p_city,
    location = p_location,
    location_category = p_location_category,
    marriage_timeline = p_marriage_timeline,
    partner_preferences = p_partner_preferences,
    onboarding_step = 10,
    onboarding_completed = true
  where profile.id = v_user_id
  returning
    profile.id,
    profile.onboarding_completed,
    profile.onboarding_step,
    profile.readiness_score,
    profile.marriage_intention,
    profile.commitment_level,
    profile.values_assessment,
    profile.gender;
end;
$$;

revoke all on function public.complete_onboarding(
  jsonb, text, text, text[], date, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_onboarding(
  jsonb, text, text, text[], date, text, text, text, text, text, text, text
) to authenticated;

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_onboarding_data enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.user_onboarding_data from anon, authenticated;

grant usage on schema public to authenticated;

grant select on table public.users to authenticated;
grant update (
  full_name,
  profile_image_url,
  date_of_birth,
  gender,
  country_code,
  city,
  location,
  location_category,
  marriage_intention,
  marriage_timeline,
  commitment_level,
  values_assessment,
  partner_preferences,
  bio,
  occupation
) on table public.users to authenticated;

grant select on table public.user_roles to authenticated;

grant select on table public.user_onboarding_data to authenticated;
grant insert (user_id, onboarding_data)
  on table public.user_onboarding_data to authenticated;
grant update (onboarding_data)
  on table public.user_onboarding_data to authenticated;

create policy users_select_own
on public.users
for select
to authenticated
using ((select auth.uid()) = id);

create policy users_update_own
on public.users
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy user_roles_select_own
on public.user_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_select_own
on public.user_onboarding_data
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_insert_own
on public.user_onboarding_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy onboarding_update_own
on public.user_onboarding_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

commit;
