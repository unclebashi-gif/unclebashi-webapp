begin;

do $preconditions$
declare
  cms_role_oid oid;
  owned_object text;
begin
  select role_row.oid
    into cms_role_oid
    from pg_catalog.pg_roles as role_row
    where role_row.rolname = 'unclebashi_cms';

  if cms_role_oid is null then
    raise exception 'Required role unclebashi_cms does not exist.';
  end if;

  -- Do not reassign or drop objects as part of this retirement migration.
  select format('%I.%I', namespace_row.nspname, relation_row.relname)
    into owned_object
    from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
    where relation_row.relowner = cms_role_oid
      and relation_row.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    limit 1;
  if owned_object is not null then
    raise exception 'Role unclebashi_cms owns relation %; refusing retirement.', owned_object;
  end if;

  select format('%I.%I(%s)', namespace_row.nspname, procedure_row.proname,
                pg_catalog.pg_get_function_identity_arguments(procedure_row.oid))
    into owned_object
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = procedure_row.pronamespace
    where procedure_row.proowner = cms_role_oid
    limit 1;
  if owned_object is not null then
    raise exception 'Role unclebashi_cms owns routine %; refusing retirement.', owned_object;
  end if;

  select format('%I', namespace_row.nspname)
    into owned_object
    from pg_catalog.pg_namespace as namespace_row
    where namespace_row.nspowner = cms_role_oid
    limit 1;
  if owned_object is not null then
    raise exception 'Role unclebashi_cms owns schema %; refusing retirement.', owned_object;
  end if;

  if pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.lessons') is null then
    raise exception 'Required public content tables are missing; refusing retirement.';
  end if;
end;
$preconditions$;

alter role unclebashi_cms nologin;

drop policy if exists courses_cms_manage on public.courses;
drop policy if exists course_modules_cms_manage on public.course_modules;
drop policy if exists lessons_cms_manage on public.lessons;

revoke all privileges on table
  public.courses,
  public.course_modules,
  public.lessons
from unclebashi_cms;

-- Table-level REVOKE does not remove column grants. Clear every column-level
-- privilege (SELECT, INSERT, UPDATE, REFERENCES) on each column explicitly.
do $column_privilege_cleanup$
declare
  column_row record;
begin
  for column_row in
    select namespace_row.nspname as schema_name,
           relation_row.relname as table_name,
           attribute_row.attname as column_name
    from pg_catalog.pg_attribute as attribute_row
    join pg_catalog.pg_class as relation_row on relation_row.oid = attribute_row.attrelid
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public'
      and relation_row.relname in ('courses', 'course_modules', 'lessons')
      and relation_row.relkind in ('r', 'p', 'v', 'm', 'f')
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
  loop
    execute format(
      'revoke all (%I) on table %I.%I from unclebashi_cms',
      column_row.column_name,
      column_row.schema_name,
      column_row.table_name
    );
  end loop;
end;
$column_privilege_cleanup$;

revoke all privileges on schema public from unclebashi_cms;

do $postconditions$
declare
  cms_role_oid oid;
  relation_oid oid;
  privilege_name text;
  relation_name text;
  column_row record;
  owned_object text;
begin
  select role_row.oid
    into cms_role_oid
    from pg_catalog.pg_roles as role_row
    where role_row.rolname = 'unclebashi_cms';

  if cms_role_oid is null then
    raise exception 'Postcondition failed: role unclebashi_cms must be retained.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_roles as role_row
    where role_row.oid = cms_role_oid
      and (role_row.rolcanlogin or role_row.rolinherit or role_row.rolsuper
           or role_row.rolbypassrls)
  ) then
    raise exception 'Postcondition failed: unclebashi_cms must remain NOLOGIN, NOINHERIT, NOSUPERUSER, and NOBYPASSRLS.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_namespace as namespace_row
    cross join lateral pg_catalog.aclexplode(namespace_row.nspacl) as acl
    where namespace_row.nspname = 'public'
      and acl.grantee = cms_role_oid
  ) then
    raise exception 'Postcondition failed: unclebashi_cms has a direct ACL on schema public.';
  end if;

  foreach relation_name in array array['courses', 'course_modules', 'lessons'] loop
    relation_oid := pg_catalog.to_regclass(format('public.%I', relation_name));
    if relation_oid is null then
      raise exception 'Postcondition failed: public.% is missing.', relation_name;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class as relation_row
      cross join lateral pg_catalog.aclexplode(relation_row.relacl) as acl
      where relation_row.oid = relation_oid
        and acl.grantee = cms_role_oid
    ) then
      raise exception 'Postcondition failed: unclebashi_cms has a direct table ACL on public.%.',
        relation_name;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_attribute as attribute_row
      cross join lateral pg_catalog.aclexplode(attribute_row.attacl) as acl
      where attribute_row.attrelid = relation_oid
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
        and acl.grantee = cms_role_oid
    ) then
      raise exception 'Postcondition failed: unclebashi_cms has a direct column ACL on public.%.',
        relation_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policies as policy_row
    where 'unclebashi_cms' = any(policy_row.roles)
  ) then
    raise exception 'Postcondition failed: a policy still names unclebashi_cms.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership_row
    join pg_catalog.pg_roles as granted_role on granted_role.oid = membership_row.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = membership_row.member
    join pg_catalog.pg_roles as grantor_role on grantor_role.oid = membership_row.grantor
    cross join lateral (select pg_catalog.to_jsonb(membership_row) as membership_json) as membership_data
    where (membership_row.roleid = cms_role_oid or membership_row.member = cms_role_oid)
      and not (
        granted_role.rolname = 'unclebashi_cms'
        and member_role.rolname = 'postgres'
        and grantor_role.rolname = 'supabase_admin'
        and membership_row.admin_option
        and (
          not (membership_data.membership_json ? 'inherit_option')
          or membership_data.membership_json ->> 'inherit_option' is not distinct from 'false'
        )
        and (
          not (membership_data.membership_json ? 'set_option')
          or membership_data.membership_json ->> 'set_option' is not distinct from 'false'
        )
      )
  ) then
    raise exception 'Postcondition failed: an unexpected role membership links unclebashi_cms.';
  end if;

  select format('%I.%I', namespace_row.nspname, relation_row.relname)
    into owned_object
    from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
    where relation_row.relowner = cms_role_oid
      and relation_row.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    limit 1;
  if owned_object is not null then
    raise exception 'Postcondition failed: unclebashi_cms still owns relation %.', owned_object;
  end if;

  select format('%I.%I(%s)', namespace_row.nspname, procedure_row.proname,
                pg_catalog.pg_get_function_identity_arguments(procedure_row.oid))
    into owned_object
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = procedure_row.pronamespace
    where procedure_row.proowner = cms_role_oid
    limit 1;
  if owned_object is not null then
    raise exception 'Postcondition failed: unclebashi_cms still owns routine %.', owned_object;
  end if;

  select format('%I', namespace_row.nspname)
    into owned_object
    from pg_catalog.pg_namespace as namespace_row
    where namespace_row.nspowner = cms_role_oid
    limit 1;
  if owned_object is not null then
    raise exception 'Postcondition failed: unclebashi_cms still owns schema %.', owned_object;
  end if;
end;
$postconditions$;

commit;