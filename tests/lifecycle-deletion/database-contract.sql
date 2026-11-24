-- Read-only Wave 8 contract. Run with a trusted read-only database connection.
begin transaction read only;

do $contract$
declare
  v_function text;
  v_table text;
  v_config text[];
  v_payment_delete_action "char";
begin
  foreach v_function in array array[
    'public.get_account_lifecycle_status()',
    'public.deactivate_my_account()',
    'public.reactivate_my_account()',
    'public.get_account_deletion_readiness()',
    'public.delete_my_matchmaking_data()'
  ] loop
    if pg_catalog.to_regprocedure(v_function) is null then
      raise exception 'Missing owner lifecycle RPC: %', v_function;
    end if;
    if not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'Unexpected lifecycle RPC grants: %', v_function;
    end if;
    if not (select procedure_row.prosecdef from pg_catalog.pg_proc as procedure_row
      where procedure_row.oid = pg_catalog.to_regprocedure(v_function)) then
      raise exception 'Lifecycle RPC is not SECURITY DEFINER: %', v_function;
    end if;
    select procedure_row.proconfig into v_config from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(v_function);
    if not exists(select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path=') then
      raise exception 'Lifecycle RPC must have empty search_path: %', v_function;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.activate_user_journey(text,boolean)') is null
     or pg_catalog.to_regprocedure('public.set_user_journey_status(text,text)') is null then
    raise exception 'Canonical journey lifecycle RPC is missing.';
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.users'::pg_catalog.regclass
      and constraint_row.conname = 'users_account_status_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%active%deactivated%deletion_pending%') then
    raise exception 'Account-status constraint is missing.';
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.user_journeys'::pg_catalog.regclass
      and constraint_row.conname = 'user_journeys_primary_requires_active_check') then
    raise exception 'Journey primary-state constraint is missing.';
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.user_journeys'::pg_catalog.regclass
      and constraint_row.conname = 'user_journeys_status_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%active%paused%completed%withdrawn%') then
    raise exception 'Journey lifecycle status constraint changed.';
  end if;

  select constraint_row.confdeltype into v_payment_delete_action
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.payments'::pg_catalog.regclass
    and constraint_row.conname = 'payments_user_id_fkey'
    and constraint_row.contype = 'f';
  if v_payment_delete_action is distinct from 'r' then
    raise exception 'payments.user_id delete action changed from RESTRICT.';
  end if;

  foreach v_table in array array[
    'public.users', 'public.user_journeys', 'public.matchmaking_profiles',
    'public.matchmaking_preferences', 'public.matchmaking_interests',
    'public.matchmaking_blocks', 'public.matchmaking_reports', 'public.matchmaking_photos',
    'public.payments', 'public.course_enrollments', 'public.coaching_bookings',
    'public.community_posts', 'public.community_comments', 'public.community_reports',
    'public.user_verifications', 'public.user_roles', 'public.courses',
    'public.user_onboarding_data', 'public.marriage_support_profiles',
    'public.coaching_profiles', 'public.counselling_requests'
  ] loop
    if pg_catalog.has_table_privilege('anon', v_table, 'DELETE')
       or pg_catalog.has_table_privilege('authenticated', v_table, 'DELETE') then
      raise exception 'Browser direct DELETE privilege exists on %.', v_table;
    end if;
  end loop;

  if pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_status', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.users', 'account_status', 'UPDATE') then
    raise exception 'Browser can directly change account_status.';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.matchmaking_photos'::pg_catalog.regclass
      and trigger_row.tgname = 'matchmaking_photos_queue_storage_cleanup'
      and not trigger_row.tgisinternal) then
    raise exception 'Matchmaking photo cleanup trigger is missing.';
  end if;
  if pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null then
    raise exception 'Matchmaking photo cleanup queue is missing.';
  end if;
  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_discovery(integer,timestamptz,uuid)') is null then
    raise exception 'Existing Matchmaking eligibility/discovery RPC is missing.';
  end if;
  if pg_catalog.strpos(
      pg_catalog.pg_get_functiondef('public.is_matchmaking_eligible(uuid)'::pg_catalog.regprocedure),
      'user_verifications'
    ) > 0 then
    raise exception 'Trust-verification enforcement was unexpectedly added to Matchmaking eligibility.';
  end if;
  if pg_catalog.to_regclass('public.user_verifications') is null
     or pg_catalog.to_regprocedure('public.get_my_verification_status()') is null
     or pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null
     or pg_catalog.to_regclass('public.counselling_requests') is null then
    raise exception 'Wave 5/6/7 domain objects are missing.';
  end if;
  if pg_catalog.to_regprocedure('public.save_matchmaking_preferences(jsonb)') is null
     or pg_catalog.to_regprocedure('public.withdraw_counselling_request()') is null then
    raise exception 'Existing Matchmaking preference/Counselling RPC is missing.';
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.users'::pg_catalog.regclass
      and constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_row.contype = 'f' and constraint_row.confdeltype = 'c') then
    raise exception 'Core public.users Auth identity FK changed unexpectedly.';
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.matchmaking_photos'::pg_catalog.regclass
      and constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_row.contype = 'f' and constraint_row.confdeltype = 'c') then
    raise exception 'Matchmaking photo Auth FK changed unexpectedly.';
  end if;
  if not exists(select 1 from pg_catalog.pg_class as relation_row
    where relation_row.oid = 'public.user_journeys'::pg_catalog.regclass and relation_row.relrowsecurity)
     or pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.user_journeys', 'UPDATE') then
    raise exception 'Journey RLS or direct-mutation protections changed.';
  end if;
end;
$contract$;

rollback;
