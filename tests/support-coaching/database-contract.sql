-- Read-only Wave 5 contract check. Execute in a non-production database.
-- Run with: psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/support-coaching/database-contract.sql
begin read only;

do $checks$
declare
  v_table text;
  v_role text;
  v_privilege text;
  v_signature text;
  v_oid oid;
  v_config text[];
  v_security_definer boolean;
  v_definition text;
begin
  if pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null then
    raise exception 'Contract failed: one or both private intake tables are missing.';
  end if;
  foreach v_table in array array['public.marriage_support_profiles', 'public.coaching_profiles'] loop
    if not exists (
      select 1 from pg_catalog.pg_class as relation_row
      join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
      where schema_row.nspname = 'public' and relation_row.relname = pg_catalog.split_part(v_table, '.', 2)
        and relation_row.relrowsecurity
    ) then raise exception 'Contract failed: RLS is not enabled on %.', v_table; end if;

    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if pg_catalog.has_table_privilege(v_role, v_table, v_privilege) then
          raise exception 'Contract failed: role % has direct % privilege on %.', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = pg_catalog.split_part(v_table, '.', 2)
        and column_name = 'status'
    ) then raise exception 'Contract failed: journey lifecycle status was duplicated into %.', v_table; end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.marriage_support_profiles'::pg_catalog.regclass
      and conname = 'marriage_support_areas_allowed_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.marriage_support_profiles'::pg_catalog.regclass
      and conname = 'marriage_support_partner_participation_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.marriage_support_profiles'::pg_catalog.regclass
      and conname = 'marriage_support_preferred_path_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.marriage_support_profiles'::pg_catalog.regclass
      and conname = 'marriage_support_timing_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.coaching_profiles'::pg_catalog.regclass
      and conname = 'coaching_focus_areas_allowed_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.coaching_profiles'::pg_catalog.regclass
      and conname = 'coaching_preferred_format_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.coaching_profiles'::pg_catalog.regclass
      and conname = 'coaching_session_frequency_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.coaching_profiles'::pg_catalog.regclass
      and conname = 'coaching_gender_preference_check' and contype = 'c'
  ) then
    raise exception 'Contract failed: controlled intake value constraints are incomplete.';
  end if;

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
    if v_oid is null then raise exception 'Contract failed: expected intake function % is missing.', v_signature; end if;
    select procedure_row.prosecdef, procedure_row.proconfig,
           pg_catalog.pg_get_functiondef(procedure_row.oid)
      into v_security_definer, v_config, v_definition
    from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
    if v_security_definer is not true or not exists (
      select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path='
    ) then raise exception 'Contract failed: % lacks SECURITY DEFINER and empty search_path.', v_signature; end if;
    if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'Contract failed: anonymous/service role can execute intake function %.', v_signature;
    end if;
  end loop;

  if not pg_catalog.has_function_privilege('authenticated', 'public.get_my_marriage_support_profile()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.save_marriage_support_profile(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.complete_marriage_support_intake()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_my_coaching_profile()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.save_coaching_profile(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.complete_coaching_intake()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._marriage_support_intake_is_complete(text[],text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._coaching_intake_is_complete(text[],text,text,text,text)', 'EXECUTE') then
    raise exception 'Contract failed: intended owner RPC grants or internal helper grants differ.';
  end if;

  foreach v_signature in array array[
    'public.get_my_marriage_support_profile()', 'public.save_marriage_support_profile(jsonb)',
    'public.complete_marriage_support_intake()', 'public.get_my_coaching_profile()',
    'public.save_coaching_profile(jsonb)', 'public.complete_coaching_intake()'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.strpos(v_definition, 'auth.uid()') = 0 then
      raise exception 'Contract failed: owner function % does not derive identity from auth.uid().', v_signature;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null then
    raise exception 'Contract failed: existing Matchmaking/photo objects are missing.';
  end if;
  select pg_catalog.pg_get_functiondef('public.is_matchmaking_eligible(uuid)'::regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition, 'marriage_support_profiles') > 0
     or pg_catalog.strpos(v_definition, 'coaching_profiles') > 0
     or pg_catalog.strpos(v_definition, 'matchmaking_photos') > 0 then
    raise exception 'Contract failed: Matchmaking/photo eligibility references changed.';
  end if;
  if pg_catalog.to_regprocedure('public.get_matchmaking_discovery(integer,timestamptz,uuid)') is null
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.get_matchmaking_discovery(integer,timestamptz,uuid)'::regprocedure), 'marriage_support_profiles') > 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.get_matchmaking_discovery(integer,timestamptz,uuid)'::regprocedure), 'coaching_profiles') > 0 then
    raise exception 'Contract failed: private intake data entered the Matchmaking discovery projection.';
  end if;
  foreach v_signature in array array[
    'public.get_matchmaking_profile(uuid)',
    'public.matchmaking_profile_user_projection(public.matchmaking_profiles)',
    'public.get_community_feed(integer,timestamptz,uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then raise exception 'Contract failed: public projection % is missing.', v_signature; end if;
    select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.strpos(v_definition, 'marriage_support_profiles') > 0
       or pg_catalog.strpos(v_definition, 'coaching_profiles') > 0 then
      raise exception 'Contract failed: private Wave 5 intake is referenced by public projection %.', v_signature;
    end if;
  end loop;
end;
$checks$;

rollback;
