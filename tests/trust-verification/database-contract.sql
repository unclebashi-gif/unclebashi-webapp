-- Read-only Wave 7 verification contract. Run against a non-production database.
begin read only;

do $checks$
declare
  v_oid oid;
  v_config text[];
  v_result text;
  v_definition text;
  v_security_definer boolean;
  v_columns text[];
  v_privilege text;
  v_role text;
  v_signature text;
begin
  if pg_catalog.to_regclass('public.user_verifications') is null then
    raise exception 'Contract failed: user_verifications is missing.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    where relation_row.oid = 'public.user_verifications'::pg_catalog.regclass
      and relation_row.relrowsecurity
  ) then raise exception 'Contract failed: verification table RLS is disabled.'; end if;
  if exists (
    select 1 from pg_catalog.pg_policy as policy_row
    where policy_row.polrelid = 'public.user_verifications'::pg_catalog.regclass
  ) then raise exception 'Contract failed: direct verification-table policies exist.'; end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if pg_catalog.has_table_privilege(v_role, 'public.user_verifications', v_privilege) then
        raise exception 'Contract failed: % has % on user_verifications.', v_role, v_privilege;
      end if;
    end loop;
  end loop;
  if exists (
    select 1
    from pg_catalog.pg_class as relation_row
    cross join lateral pg_catalog.aclexplode(coalesce(relation_row.relacl, array[]::pg_catalog.aclitem[])) as acl
    where relation_row.oid = 'public.user_verifications'::pg_catalog.regclass
      and acl.grantee in (0, pg_catalog.to_regrole('anon')::oid,
                          pg_catalog.to_regrole('authenticated')::oid,
                          pg_catalog.to_regrole('service_role')::oid)
  ) or exists (
    select 1
    from pg_catalog.pg_attribute as attribute_row
    cross join lateral pg_catalog.aclexplode(coalesce(attribute_row.attacl, array[]::pg_catalog.aclitem[])) as acl
    where attribute_row.attrelid = 'public.user_verifications'::pg_catalog.regclass
      and attribute_row.attnum > 0 and not attribute_row.attisdropped
      and acl.grantee in (0, pg_catalog.to_regrole('anon')::oid,
                          pg_catalog.to_regrole('authenticated')::oid,
                          pg_catalog.to_regrole('service_role')::oid)
  ) then raise exception 'Contract failed: direct table or column ACLs remain.'; end if;

  select pg_catalog.array_agg(attribute_row.attname::text order by attribute_row.attname)
    into v_columns
  from pg_catalog.pg_attribute as attribute_row
  where attribute_row.attrelid = 'public.user_verifications'::pg_catalog.regclass
    and attribute_row.attnum > 0 and not attribute_row.attisdropped;
  if v_columns is distinct from array[
    'created_at', 'identity_document_type', 'identity_provider', 'identity_provider_reference',
    'identity_rejection_reason', 'identity_status', 'identity_verified_at', 'updated_at', 'user_id'
  ]::text[] then raise exception 'Contract failed: unexpected verification-table columns.'; end if;

  v_oid := pg_catalog.to_regprocedure('public.get_my_verification_status()');
  if v_oid is null then raise exception 'Contract failed: owner status RPC is missing.'; end if;
  select procedure_row.prosecdef, procedure_row.proconfig,
         pg_catalog.pg_get_function_result(procedure_row.oid),
         pg_catalog.pg_get_functiondef(procedure_row.oid)
    into v_security_definer, v_config, v_result, v_definition
  from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
  if v_security_definer is not true or not exists (
    select 1 from pg_catalog.unnest(coalesce(v_config, array[]::text[])) as config(setting)
    where pg_catalog.replace(config.setting, '"', '') = 'search_path='
  ) then raise exception 'Contract failed: owner RPC security configuration is incorrect.'; end if;
  if pg_catalog.replace(v_result, ' ', '') <> 'TABLE(email_verifiedboolean,phone_statustext,masked_phonetext,identity_statustext,identity_rejection_reasontext)' then
    raise exception 'Contract failed: owner RPC result shape changed.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'Contract failed: owner RPC grants are incorrect.';
  end if;
  if pg_catalog.strpos(v_definition, 'auth.uid()') = 0
     or pg_catalog.strpos(v_definition, 'auth_user.phone_confirmed_at') = 0
     or pg_catalog.strpos(v_definition, 'auth_user.email_confirmed_at') = 0
     or pg_catalog.strpos(v_definition, 'where auth_user.id = v_actor') = 0 then
    raise exception 'Contract failed: owner source or scoping is incorrect.';
  end if;

  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null then
    raise exception 'Contract failed: Matchmaking eligibility function is missing.';
  end if;
  if pg_catalog.to_regprocedure('public.get_matchmaking_verification_badges(uuid)') is not null then
    raise exception 'Contract failed: no member verification projection is approved in this wave.';
  end if;
  select pg_catalog.pg_get_functiondef('public.is_matchmaking_eligible(uuid)'::regprocedure)
    into v_definition;
  if pg_catalog.strpos(v_definition, 'user_verifications') > 0
     or pg_catalog.strpos(v_definition, 'phone_confirmed_at') > 0 then
    raise exception 'Contract failed: Matchmaking eligibility depends on verification.';
  end if;
  foreach v_signature in array array[
    'public.get_matchmaking_discovery(integer,timestamptz,uuid)',
    'public.get_matchmaking_profile(uuid)',
    'public.get_community_feed(integer,timestamptz,uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then raise exception 'Contract failed: projection % is missing.', v_signature; end if;
    select pg_catalog.pg_get_functiondef(procedure_row.oid) into v_definition
    from pg_catalog.pg_proc as procedure_row where procedure_row.oid = v_oid;
    if pg_catalog.strpos(v_definition, 'user_verifications') > 0
       or pg_catalog.strpos(v_definition, 'phone_confirmed_at') > 0
       or pg_catalog.strpos(v_definition, 'auth_user.phone') > 0
       or pg_catalog.strpos(v_definition, 'phone_e164') > 0
       or pg_catalog.strpos(v_definition, 'identity_document') > 0 then
      raise exception 'Contract failed: private verification metadata entered %.', v_signature;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.users'::pg_catalog.regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
  ) then raise exception 'Contract failed: existing public user/Auth identity relationship is missing.'; end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute as auth_id
    join pg_catalog.pg_class as auth_table on auth_table.oid = auth_id.attrelid
    join pg_catalog.pg_namespace as auth_schema on auth_schema.oid = auth_table.relnamespace
    where auth_schema.nspname = 'auth' and auth_table.relname = 'users'
      and auth_id.attname = 'id' and auth_id.atttypid = 'uuid'::pg_catalog.regtype
      and auth_id.attnotnull
  ) then raise exception 'Contract failed: Auth user IDs are not UUIDs.'; end if;
  if pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.marriage_support_profiles') is null
     or pg_catalog.to_regclass('public.coaching_profiles') is null
     or pg_catalog.to_regclass('public.counselling_requests') is null then
    raise exception 'Contract failed: pre-existing Wave 4/5/6 objects are missing.';
  end if;
end;
$checks$;

rollback;
