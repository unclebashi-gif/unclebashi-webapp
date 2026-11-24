begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_journeys') is null
     or pg_catalog.to_regclass('public.payments') is null
     or pg_catalog.to_regclass('public.course_enrollments') is null
     or pg_catalog.to_regclass('public.community_reports') is null
     or pg_catalog.to_regclass('public.coaching_bookings') is null
     or pg_catalog.to_regclass('public.coaches') is null
     or pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or pg_catalog.to_regclass('public.matchmaking_preferences') is null
     or pg_catalog.to_regclass('public.matchmaking_interests') is null
     or pg_catalog.to_regclass('public.matchmaking_blocks') is null
     or pg_catalog.to_regclass('public.matchmaking_reports') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null
     or pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null
     or pg_catalog.to_regclass('public.counselling_requests') is null
     or pg_catalog.to_regclass('public.user_verifications') is null then
    raise exception 'Precondition failed: one or more lifecycle dependency tables are missing.';
  end if;

  if pg_catalog.to_regprocedure('public.activate_user_journey(text,boolean)') is null
     or pg_catalog.to_regprocedure('public.set_user_journey_status(text,text)') is null
     or pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public._queue_matchmaking_photo_cleanup_after_delete()') is null then
    raise exception 'Precondition failed: journey, Matchmaking eligibility, or photo-cleanup functions are missing.';
  end if;
  if not exists(select 1 from pg_catalog.pg_attribute as attribute_row
      where attribute_row.attrelid = 'public.users'::pg_catalog.regclass
        and attribute_row.attname = 'account_status' and not attribute_row.attisdropped) then
    raise exception 'Precondition failed: public.users.account_status is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'payments'
      and constraint_row.conname = 'payments_user_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'r'
  ) then
    raise exception 'Precondition failed: payments.user_id must continue to restrict Auth-user deletion.';
  end if;
end;
$preconditions$;

-- Serialize journey mutations against account deactivation. Ownership always comes from auth.uid().
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
  v_account_status text;
  v_journey public.user_journeys%rowtype;
  v_exists boolean := false;
  v_make_primary boolean := coalesce(p_make_primary, false);
begin
  if v_actor is null then
    raise exception 'Authentication is required to activate a journey.' using errcode = '42501';
  end if;

  if p_journey_type is null or p_journey_type not in (
    'marriage_education', 'marriage_preparation', 'matchmaking',
    'marriage_support', 'coaching', 'counselling'
  ) then
    raise exception 'Journey type is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  select account_row.account_status into v_account_status
  from public.users as account_row
  where account_row.id = v_actor
  for update;
  if not found then
    raise exception 'The account profile is unavailable.' using errcode = '42501';
  end if;
  if v_account_status <> 'active' then
    raise exception 'Reactivate your account before changing journeys.' using errcode = '42501';
  end if;

  select journey_row.* into v_journey
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = p_journey_type
  for update;
  v_exists := found;

  if v_exists and v_journey.status = 'completed' then
    raise exception 'This journey is completed and cannot be restarted.' using errcode = '22023';
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
    where journey_row.user_id = v_actor and journey_row.journey_type = p_journey_type
    returning journey_row.* into v_journey;
  else
    insert into public.user_journeys (user_id, journey_type, status, is_primary)
    values (v_actor, p_journey_type, 'active', v_make_primary)
    returning * into v_journey;
  end if;

  return next v_journey;
end;
$function$;

create or replace function public.set_user_journey_status(
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
  v_account_status text;
  v_journey public.user_journeys%rowtype;
  v_intake_completed boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication is required to change journey status.' using errcode = '42501';
  end if;
  if p_journey_type is null or p_journey_type not in (
    'marriage_education', 'marriage_preparation', 'matchmaking',
    'marriage_support', 'coaching', 'counselling'
  ) then
    raise exception 'Journey type is invalid.' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('paused', 'completed', 'withdrawn') then
    raise exception 'Journey status is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  select account_row.account_status into v_account_status
  from public.users as account_row
  where account_row.id = v_actor
  for update;
  if not found then
    raise exception 'The account profile is unavailable.' using errcode = '42501';
  end if;
  if v_account_status <> 'active' then
    raise exception 'Reactivate your account before changing journeys.' using errcode = '42501';
  end if;

  select journey_row.* into v_journey
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = p_journey_type
  for update;
  if not found then
    raise exception 'Journey not found for the authenticated user.' using errcode = 'P0002';
  end if;

  if v_journey.status not in ('active', 'paused') then
    raise exception 'Only an active or paused journey can change status.' using errcode = '22023';
  end if;
  if p_status = 'paused' and v_journey.status <> 'active' then
    raise exception 'Only an active journey can be paused.' using errcode = '22023';
  end if;
  if p_status = 'withdrawn'
     and p_journey_type not in ('matchmaking', 'marriage_support', 'coaching', 'counselling') then
    raise exception 'This journey does not support withdrawal.' using errcode = '22023';
  end if;
  if p_status = 'completed' then
    if p_journey_type not in ('marriage_support', 'coaching') then
      raise exception 'This journey does not support manual completion.' using errcode = '22023';
    end if;
    if p_journey_type = 'marriage_support' then
      select profile_row.intake_completed_at is not null into v_intake_completed
      from public.marriage_support_profiles as profile_row
      where profile_row.user_id = v_actor;
    else
      select profile_row.intake_completed_at is not null into v_intake_completed
      from public.coaching_profiles as profile_row
      where profile_row.user_id = v_actor;
    end if;
    if not coalesce(v_intake_completed, false) then
      raise exception 'Complete the intake before completing this journey.' using errcode = '22023';
    end if;
  end if;

  update public.user_journeys as journey_row
  set status = p_status,
      is_primary = false,
      completed_at = case when p_status = 'completed' then pg_catalog.now() else null end,
      withdrawn_at = case when p_status = 'withdrawn' then pg_catalog.now() else null end
  where journey_row.user_id = v_actor and journey_row.journey_type = p_journey_type
  returning journey_row.* into v_journey;

  return next v_journey;
end;
$function$;

create function public.get_account_lifecycle_status()
returns table(account_status text, active_journey_count integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account_status text;
begin
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select account_row.account_status into v_account_status
  from public.users as account_row where account_row.id = v_actor;
  if not found then raise exception 'The account profile is unavailable.' using errcode = '42501'; end if;
  return query
  select account_row.account_status,
    (select pg_catalog.count(*)::integer from public.user_journeys as journey_row
      where journey_row.user_id = v_actor and journey_row.status = 'active')
  from public.users as account_row where account_row.id = v_actor;
end;
$function$;

create function public.deactivate_my_account()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select account_row.account_status into v_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found then raise exception 'The account profile is unavailable.' using errcode = '42501'; end if;
  if v_status = 'deletion_pending' then
    raise exception 'This account is already in a restricted lifecycle state.' using errcode = '22023';
  end if;
  if v_status = 'active' then
    update public.users as account_row set account_status = 'deactivated'
    where account_row.id = v_actor returning account_row.account_status into v_status;
  end if;
  return v_status;
end;
$function$;

create function public.reactivate_my_account()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select account_row.account_status into v_status
  from public.users as account_row where account_row.id = v_actor for update;
  if not found then raise exception 'The account profile is unavailable.' using errcode = '42501'; end if;
  if v_status = 'deletion_pending' then
    raise exception 'This account cannot be reactivated through this control.' using errcode = '22023';
  end if;
  if v_status = 'deactivated' then
    update public.users as account_row set account_status = 'active'
    where account_row.id = v_actor returning account_row.account_status into v_status;
  end if;
  return v_status;
end;
$function$;

create function public.get_account_deletion_readiness()
returns table(
  can_hard_delete boolean,
  has_payment_history boolean,
  has_retained_operational_records boolean,
  active_journey_count integer,
  retained_record_categories text[],
  blocking_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_has_payments boolean;
  v_has_operational boolean;
  v_active_journeys integer;
  v_categories text[] := array[]::text[];
  v_blockers text[] := array['hard_delete_feature_disabled']::text[];
begin
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if not exists(select 1 from public.users as account_row where account_row.id = v_actor) then
    raise exception 'The account profile is unavailable.' using errcode = '42501';
  end if;
  select exists(select 1 from public.payments as payment_row where payment_row.user_id = v_actor)
    into v_has_payments;
  select pg_catalog.count(*)::integer into v_active_journeys
  from public.user_journeys as journey_row where journey_row.user_id = v_actor and journey_row.status = 'active';

  v_has_operational :=
    exists(select 1 from public.matchmaking_reports as report_row
      where report_row.reporter_user_id = v_actor or report_row.reported_user_id = v_actor)
    or exists(select 1 from public.matchmaking_blocks as block_row
      where block_row.blocker_user_id = v_actor or block_row.blocked_user_id = v_actor)
    or exists(select 1 from public.community_reports as community_report
      where community_report.reporter_id = v_actor)
    or exists(select 1 from public.counselling_requests as counselling_row
      where counselling_row.user_id = v_actor)
    or exists(select 1 from public.coaching_bookings as booking_row
      where booking_row.client_user_id = v_actor)
    or exists(select 1 from public.coaching_bookings as booking_row
      join public.coaches as coach_row on coach_row.id = booking_row.coach_id
      where coach_row.user_id = v_actor)
    or exists(select 1 from public.user_verifications as verification_row
      where verification_row.user_id = v_actor);

  if v_has_payments then
    v_categories := pg_catalog.array_append(v_categories, 'payments');
    v_blockers := pg_catalog.array_append(v_blockers, 'payment_history');
  end if;
  if exists(select 1 from public.matchmaking_reports as report_row
      where report_row.reporter_user_id = v_actor or report_row.reported_user_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'matchmaking_reports');
  end if;
  if exists(select 1 from public.matchmaking_blocks as block_row
      where block_row.blocker_user_id = v_actor or block_row.blocked_user_id = v_actor)
     or exists(select 1 from public.matchmaking_reports as report_row
      where report_row.reporter_user_id = v_actor or report_row.reported_user_id = v_actor)
     or exists(select 1 from public.community_reports as community_report
      where community_report.reporter_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'safety_and_moderation_records');
  end if;
  if exists(select 1 from public.community_reports as community_report
      where community_report.reporter_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'community_reports');
  end if;
  if exists(select 1 from public.counselling_requests as counselling_row where counselling_row.user_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'counselling_requests');
  end if;
  if exists(select 1 from public.coaching_bookings as booking_row
      where booking_row.client_user_id = v_actor)
     or exists(select 1 from public.coaching_bookings as booking_row
      join public.coaches as coach_row on coach_row.id = booking_row.coach_id
      where coach_row.user_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'coaching_bookings');
  end if;
  if exists(select 1 from public.user_verifications as verification_row where verification_row.user_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'verification_status');
  end if;
  if exists(select 1 from public.course_enrollments as enrollment_row where enrollment_row.user_id = v_actor) then
    v_categories := pg_catalog.array_append(v_categories, 'course_enrollments');
  end if;
  if v_has_operational then
    v_blockers := pg_catalog.array_append(v_blockers, 'operational_audit_retention');
  end if;
  if exists(select 1 from public.counselling_requests as counselling_row
      where counselling_row.user_id = v_actor
        and counselling_row.status in ('submitted', 'under_review', 'contacted', 'referred')) then
    v_blockers := pg_catalog.array_append(v_blockers, 'active_counselling_request');
  end if;

  return query select false, v_has_payments, v_has_operational, v_active_journeys, v_categories, v_blockers;
end;
$function$;

create function public.delete_my_matchmaking_data()
returns table(profile_removed boolean, photos_removed integer, journey_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_photo_count integer := 0;
  v_profile_row_count integer := 0;
  v_profile_removed boolean := false;
  v_journey public.user_journeys%rowtype;
begin
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  perform 1 from public.users as account_row where account_row.id = v_actor for update;
  if not found then raise exception 'The account profile is unavailable.' using errcode = '42501'; end if;
  if exists (
    select 1 from public.matchmaking_photos as dependent_photo
    join public.matchmaking_photos as owned_photo on owned_photo.id = dependent_photo.replaces_photo_id
    where owned_photo.user_id = v_actor and dependent_photo.user_id <> v_actor
  ) then
    raise exception 'Matchmaking photos are referenced by another account and require support before removal.'
      using errcode = '23503';
  end if;

  update public.matchmaking_interests as interest_row
  set status = 'withdrawn', responded_at = pg_catalog.now()
  where interest_row.status in ('pending', 'accepted')
    and (interest_row.initiator_user_id = v_actor or interest_row.recipient_user_id = v_actor);

  delete from public.matchmaking_photos as photo_row where photo_row.user_id = v_actor;
  get diagnostics v_photo_count = row_count;

  delete from public.matchmaking_preferences as preferences_row where preferences_row.user_id = v_actor;
  delete from public.matchmaking_profiles as profile_row where profile_row.user_id = v_actor;
  get diagnostics v_profile_row_count = row_count;
  v_profile_removed := v_profile_row_count > 0;

  select journey_row.* into v_journey
  from public.user_journeys as journey_row
  where journey_row.user_id = v_actor and journey_row.journey_type = 'matchmaking'
  for update;
  if found and v_journey.status in ('active', 'paused') then
    update public.user_journeys as journey_row
    set status = 'withdrawn', is_primary = false, completed_at = null,
        withdrawn_at = coalesce(journey_row.withdrawn_at, pg_catalog.now())
    where journey_row.user_id = v_actor and journey_row.journey_type = 'matchmaking'
    returning journey_row.* into v_journey;
  end if;

  return query select v_profile_removed, v_photo_count,
    coalesce(v_journey.status, 'not_started');
end;
$function$;

revoke all on function public.activate_user_journey(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.activate_user_journey(text, boolean) to authenticated;
revoke all on function public.set_user_journey_status(text, text) from public, anon, authenticated, service_role;
grant execute on function public.set_user_journey_status(text, text) to authenticated;

revoke all on function public.get_account_lifecycle_status() from public, anon, authenticated, service_role;
grant execute on function public.get_account_lifecycle_status() to authenticated;
revoke all on function public.deactivate_my_account() from public, anon, authenticated, service_role;
grant execute on function public.deactivate_my_account() to authenticated;
revoke all on function public.reactivate_my_account() from public, anon, authenticated, service_role;
grant execute on function public.reactivate_my_account() to authenticated;
revoke all on function public.get_account_deletion_readiness() from public, anon, authenticated, service_role;
grant execute on function public.get_account_deletion_readiness() to authenticated;
revoke all on function public.delete_my_matchmaking_data() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_matchmaking_data() to authenticated;

do $postconditions$
declare
  v_function text;
  v_table text;
  v_config text[];
  v_result_shape text;
begin
  foreach v_function in array array[
    'public.activate_user_journey(text,boolean)',
    'public.set_user_journey_status(text,text)',
    'public.get_account_lifecycle_status()',
    'public.deactivate_my_account()',
    'public.reactivate_my_account()',
    'public.get_account_deletion_readiness()',
    'public.delete_my_matchmaking_data()'
  ] loop
    if pg_catalog.to_regprocedure(v_function) is null then
      raise exception 'Postcondition failed: required lifecycle RPC % is missing.', v_function;
    end if;
    if not (select procedure_row.prosecdef from pg_catalog.pg_proc as procedure_row
        where procedure_row.oid = pg_catalog.to_regprocedure(v_function)) then
      raise exception 'Postcondition failed: lifecycle RPC % must remain SECURITY DEFINER.', v_function;
    end if;
    if not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'Postcondition failed: lifecycle RPC % has unexpected execute privileges.', v_function;
    end if;
    select procedure_row.proconfig into v_config
    from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(v_function);
    if not exists (
      select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path='
    ) then
      raise exception 'Postcondition failed: lifecycle RPC % must use an empty search_path.', v_function;
    end if;
  end loop;

  if not (select procedure_row.prosecdef from pg_catalog.pg_proc as procedure_row
      where procedure_row.oid = 'public.delete_my_matchmaking_data()'::pg_catalog.regprocedure) then
    raise exception 'Postcondition failed: Matchmaking removal must remain SECURITY DEFINER.';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_profiles', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'DELETE') then
    raise exception 'Postcondition failed: browser roles must not have direct lifecycle DELETE privileges.';
  end if;
  foreach v_table in array array[
    'public.users', 'public.user_journeys', 'public.matchmaking_profiles',
    'public.matchmaking_preferences', 'public.matchmaking_interests', 'public.matchmaking_blocks',
    'public.matchmaking_reports', 'public.matchmaking_photos', 'public.payments',
    'public.marriage_support_profiles', 'public.coaching_profiles', 'public.counselling_requests'
  ] loop
    if pg_catalog.has_table_privilege('authenticated', v_table, 'DELETE')
       or pg_catalog.has_table_privilege('anon', v_table, 'DELETE') then
      raise exception 'Postcondition failed: browser role has direct DELETE on %.', v_table;
    end if;
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.users'::pg_catalog.regclass
      and constraint_row.conname = 'users_account_status_check'
  ) then
    raise exception 'Postcondition failed: account status constraint is missing.';
  end if;
  select pg_catalog.pg_get_function_result('public.get_account_deletion_readiness()'::pg_catalog.regprocedure)
    into v_result_shape;
  if pg_catalog.strpos(v_result_shape, 'can_hard_delete boolean') = 0
     or pg_catalog.strpos(v_result_shape, 'has_payment_history boolean') = 0
     or pg_catalog.strpos(v_result_shape, 'retained_record_categories text[]') = 0
     or pg_catalog.strpos(v_result_shape, 'blocking_reasons text[]') = 0
     or pg_catalog.strpos(v_result_shape, 'provider_reference') > 0
     or pg_catalog.strpos(v_result_shape, 'external_reference') > 0
     or pg_catalog.strpos(v_result_shape, 'amount') > 0
     or pg_catalog.strpos(v_result_shape, 'currency') > 0
     or pg_catalog.strpos(v_result_shape, 'contact_phone') > 0
     or pg_catalog.strpos(v_result_shape, 'brief_reason') > 0
     or pg_catalog.strpos(v_result_shape, 'user_id') > 0 then
    raise exception 'Postcondition failed: account deletion readiness projection is unsafe or has changed shape.';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_status', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.users', 'account_status', 'UPDATE') then
    raise exception 'Postcondition failed: browser roles must not update account_status directly.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.matchmaking_photos'::pg_catalog.regclass
      and trigger_row.tgname = 'matchmaking_photos_queue_storage_cleanup'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Postcondition failed: Matchmaking photo cleanup trigger is missing.';
  end if;
end;
$postconditions$;

commit;
