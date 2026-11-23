-- Read-only Wave 6 database contract. Run against a non-production database.
-- This script does not mutate schema or data.
begin read only;

do $checks$
declare
  v_signature text;
  v_oid oid;
  v_config text[];
  v_definition text;
  v_security_definer boolean;
  v_role text;
  v_privilege text;
begin
  if pg_catalog.to_regclass('public.counselling_requests') is null then
    raise exception 'Contract failed: counselling_requests is missing.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public' and relation_row.relname = 'counselling_requests'
      and relation_row.relrowsecurity
  ) then raise exception 'Contract failed: counselling_requests RLS is disabled.'; end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if pg_catalog.has_table_privilege(v_role, 'public.counselling_requests', v_privilege) then
        raise exception 'Contract failed: role % has direct % privilege on counselling_requests.', v_role, v_privilege;
      end if;
    end loop;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.counselling_requests'::pg_catalog.regclass
      and conname = 'counselling_support_type_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.counselling_requests'::pg_catalog.regclass
      and conname = 'counselling_contact_method_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.counselling_requests'::pg_catalog.regclass
      and conname = 'counselling_urgency_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.counselling_requests'::pg_catalog.regclass
      and conname = 'counselling_status_check' and contype = 'c'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.counselling_requests'::pg_catalog.regclass
      and conname = 'counselling_request_lifecycle_check' and contype = 'c'
  ) then raise exception 'Contract failed: request choice/lifecycle constraints are incomplete.'; end if;

  foreach v_signature in array array[
    'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)',
    'public.get_my_counselling_request()',
    'public.save_counselling_request(jsonb)',
    'public.submit_counselling_request()',
    'public.withdraw_counselling_request()',
    'public.get_counselling_request_queue(text,integer)',
    'public.update_counselling_request_status(uuid,text)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then raise exception 'Contract failed: required RPC/helper % is missing.', v_signature; end if;
    select procedure_row.prosecdef, procedure_row.proconfig,
           pg_catalog.pg_get_functiondef(procedure_row.oid)
      into v_security_definer, v_config, v_definition
    from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
    if pg_catalog.left(v_signature, 8) <> 'public._' and (v_security_definer is not true or not exists (
      select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path='
    )) then raise exception 'Contract failed: RPC % lacks SECURITY DEFINER and empty search_path.', v_signature; end if;
    if pg_catalog.left(v_signature, 8) <> 'public._' and (
      not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
    ) then raise exception 'Contract failed: RPC % grants are incorrect.', v_signature; end if;
    if v_signature in (
      'public.get_my_counselling_request()', 'public.save_counselling_request(jsonb)',
      'public.submit_counselling_request()', 'public.withdraw_counselling_request()'
    ) and pg_catalog.strpos(v_definition, 'auth.uid()') = 0 then
      raise exception 'Contract failed: owner RPC % does not derive identity from auth.uid().', v_signature;
    end if;
    if v_signature in ('public.get_counselling_request_queue(text,integer)', 'public.update_counselling_request_status(uuid,text)')
       and (pg_catalog.strpos(v_definition, 'user_roles') = 0
         or pg_catalog.strpos(v_definition, 'admin') = 0
         or pg_catalog.strpos(v_definition, 'moderator') = 0) then
      raise exception 'Contract failed: operational RPC % lacks the internal admin/moderator role check.', v_signature;
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
      raise exception 'Contract failed: owner mutation RPC % does not require an active Counselling journey.', v_signature;
    end if;
  end loop;
  v_oid := pg_catalog.to_regprocedure('public.withdraw_counselling_request()');
  select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
  if pg_catalog.strpos(v_definition, 'auth.uid()') = 0
     or pg_catalog.strpos(v_definition, 'request_row.user_id = v_actor') = 0
     or pg_catalog.strpos(v_definition, 'status in (''submitted'', ''under_review'', ''contacted'')') = 0 then
    raise exception 'Contract failed: owner withdrawal must use auth.uid() and only submitted, under-review, or contacted requests.';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public._counselling_request_is_submittable(text,text,text,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'Contract failed: private completion helper is executable by browser/service roles.';
  end if;

  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_discovery(integer,timestamptz,uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null
     or pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null then
    raise exception 'Contract failed: existing Matchmaking, photo, or Wave 5 objects are missing.';
  end if;
  select pg_catalog.pg_get_functiondef('public.is_matchmaking_eligible(uuid)'::regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition, 'counselling_requests') > 0
     or pg_catalog.strpos(v_definition, 'marriage_support_profiles') > 0
     or pg_catalog.strpos(v_definition, 'coaching_profiles') > 0
     or pg_catalog.strpos(v_definition, 'matchmaking_photos') > 0 then
    raise exception 'Contract failed: eligibility function was coupled to Counselling, Wave 5, or photos.';
  end if;
  foreach v_signature in array array[
    'public.get_matchmaking_discovery(integer,timestamptz,uuid)',
    'public.get_matchmaking_profile(uuid)',
    'public.get_community_feed(integer,timestamptz,uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then raise exception 'Contract failed: public projection % is missing.', v_signature; end if;
    select pg_catalog.pg_get_functiondef(v_oid) into v_definition from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.strpos(v_definition, 'counselling_requests') > 0 then
      raise exception 'Contract failed: private counselling request data entered public projection %.', v_signature;
    end if;
  end loop;
end;
$checks$;

rollback;
