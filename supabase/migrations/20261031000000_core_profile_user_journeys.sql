begin;

-- This migration extends the existing auth-backed identity without replacing legacy fields.
do $preconditions$
begin
  if pg_catalog.to_regclass('public.users') is null then
    raise exception 'Required table public.users is missing.';
  end if;
  if pg_catalog.to_regclass('public.user_roles') is null then
    raise exception 'Required table public.user_roles is missing.';
  end if;
  if pg_catalog.to_regclass('public.user_onboarding_data') is null then
    raise exception 'Required table public.user_onboarding_data is missing.';
  end if;
  if pg_catalog.to_regclass('auth.users') is null then
    raise exception 'Required table auth.users is missing.';
  end if;
  if pg_catalog.to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Required trigger function public.set_updated_at() is missing.';
  end if;
end;
$preconditions$;

alter table public.users
  add column display_name text,
  add column nationality_country_code text
    check (nationality_country_code is null or nationality_country_code ~ '^[A-Z]{2}$'),
  add column country_of_origin_code text
    check (country_of_origin_code is null or country_of_origin_code ~ '^[A-Z]{2}$'),
  add column primary_language text,
  add column other_languages text[] not null default array[]::text[],
  add column legal_marital_status text
    check (legal_marital_status is null or legal_marital_status in (
      'never_married', 'married', 'divorced', 'widowed', 'separated', 'annulled', 'prefer_to_discuss'
    )),
  add column relationship_situation text
    check (relationship_situation is null or relationship_situation in (
      'single', 'committed_relationship', 'engaged', 'married', 'separated', 'prefer_to_discuss'
    )),
  add column primary_reason_for_joining text
    check (primary_reason_for_joining is null or primary_reason_for_joining in (
      'marriage_education', 'marriage_preparation', 'matchmaking', 'marriage_support', 'coaching', 'counselling'
    )),
  add column account_status text not null default 'active'
    check (account_status in ('active', 'deactivated', 'deletion_pending'));

comment on column public.users.display_name is
  'Core profile display name; intentionally nullable until the user provides it.';
comment on column public.users.nationality_country_code is
  'User-declared nationality as an uppercase two-letter country code.';
comment on column public.users.country_of_origin_code is
  'User-declared country of origin as an uppercase two-letter country code.';
comment on column public.users.account_status is
  'User account lifecycle state; mutations are not granted to browser roles.';
comment on column public.users.primary_reason_for_joining is
  'Core onboarding reason for joining Uncle Bashi; informational once user journeys exist and not authoritative for the user''s current primary journey. The authoritative current primary journey is public.user_journeys.is_primary.';

-- Remove any broad table-level UPDATE path while retaining existing column-level profile grants.
revoke update on table public.users from public, anon, authenticated;
revoke update (account_status) on table public.users from public, anon, authenticated;

-- Grant only the newly added ordinary profile fields. Existing RLS limits writes to the caller's row.
grant update (
  display_name,
  nationality_country_code,
  country_of_origin_code,
  primary_language,
  other_languages,
  legal_marital_status,
  relationship_situation,
  primary_reason_for_joining
) on table public.users to authenticated;

create table public.user_journeys (
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_type text not null
    check (journey_type in (
      'marriage_education', 'marriage_preparation', 'matchmaking',
      'marriage_support', 'coaching', 'counselling'
    )),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'withdrawn')),
  is_primary boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_journeys_user_id_journey_type_key unique (user_id, journey_type),
  constraint user_journeys_primary_requires_active_check
    check (not is_primary or status = 'active'),
  constraint user_journeys_completed_after_started_check
    check (completed_at is null or completed_at >= started_at),
  constraint user_journeys_withdrawn_after_started_check
    check (withdrawn_at is null or withdrawn_at >= started_at),
  constraint user_journeys_terminal_timestamps_exclusive_check
    check (completed_at is null or withdrawn_at is null)
);

create unique index user_journeys_one_primary_per_user_uidx
  on public.user_journeys (user_id)
  where is_primary;

create index user_journeys_user_status_idx
  on public.user_journeys (user_id, status);

create trigger user_journeys_set_updated_at
before update on public.user_journeys
for each row execute function public.set_updated_at();

alter table public.user_journeys enable row level security;
revoke all privileges on table public.user_journeys from public, anon, authenticated;
grant select on table public.user_journeys to authenticated;

create policy user_journeys_select_own
on public.user_journeys
for select
to authenticated
using ((select auth.uid()) = user_id);

create function public.activate_user_journey(
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

  -- Serialize primary-journey changes for this user before clearing/setting the flag.
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

create function public.set_user_journey_status(
  p_journey_type text,
  p_status text
)
returns setof public.user_journeys
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_journey public.user_journeys%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required to change journey status.'
      using errcode = '42501';
  end if;

  if p_journey_type is null or p_journey_type not in (
    'marriage_education', 'marriage_preparation', 'matchmaking',
    'marriage_support', 'coaching', 'counselling'
  ) then
    raise exception 'Journey type is invalid.'
      using errcode = '22023';
  end if;

  if p_status = 'active' then
    raise exception 'Use activate_user_journey() to activate a journey.'
      using errcode = '22023';
  end if;

  if p_status is null or p_status not in ('paused', 'completed', 'withdrawn') then
    raise exception 'Journey status is invalid.'
      using errcode = '22023';
  end if;

  update public.user_journeys as journey_row
  set status = p_status,
      is_primary = false,
      completed_at = case
        when p_status = 'completed' then coalesce(journey_row.completed_at, pg_catalog.now())
        else null
      end,
      withdrawn_at = case
        when p_status = 'withdrawn' then coalesce(journey_row.withdrawn_at, pg_catalog.now())
        else null
      end
  where journey_row.user_id = v_actor
    and journey_row.journey_type = p_journey_type
  returning journey_row.* into v_journey;

  if not found then
    raise exception 'Journey not found for the authenticated user.'
      using errcode = 'P0002';
  end if;

  return next v_journey;
end;
$function$;

revoke all on function public.activate_user_journey(text, boolean)
  from public, anon, authenticated;
grant execute on function public.activate_user_journey(text, boolean)
  to authenticated;

revoke all on function public.set_user_journey_status(text, text)
  from public, anon, authenticated;
grant execute on function public.set_user_journey_status(text, text)
  to authenticated;

-- Fail closed if row ownership, browser grants, or RPC execute privileges drift.
do $postconditions$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public'
      and relation_row.relname = 'user_journeys'
      and relation_row.relrowsecurity
  ) then
    raise exception 'Postcondition failed: user_journeys RLS must be enabled.';
  end if;

  if not pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'SELECT')
    or pg_catalog.has_table_privilege('anon', 'public.user_journeys', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'DELETE')
    or pg_catalog.has_table_privilege('anon', 'public.user_journeys', 'INSERT')
    or pg_catalog.has_table_privilege('anon', 'public.user_journeys', 'UPDATE')
    or pg_catalog.has_table_privilege('anon', 'public.user_journeys', 'DELETE') then
    raise exception 'Postcondition failed: user_journeys browser privileges are not least-privilege.';
  end if;

  if pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_status', 'UPDATE')
    or pg_catalog.has_column_privilege('anon', 'public.users', 'account_status', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated callers must not update account_status.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.activate_user_journey(text,boolean)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.activate_user_journey(text,boolean)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.set_user_journey_status(text,text)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.set_user_journey_status(text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: journey RPC execute privileges are not correctly restricted.';
  end if;
end;
$postconditions$;

commit;
