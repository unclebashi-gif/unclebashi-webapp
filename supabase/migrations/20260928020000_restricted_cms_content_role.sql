-- Restricted database role for an external content-management client.
-- Keep this role NOLOGIN in migrations; provision credentials out of band.
begin;

create role unclebashi_cms
  NOLOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

-- The CMS needs name resolution only, never schema object creation.
revoke all on schema public from unclebashi_cms;
grant usage on schema public to unclebashi_cms;

-- UUID defaults are used by these tables; no sequences are required.
revoke all on table public.courses,
  public.course_modules,
  public.lessons
  from unclebashi_cms;

grant select, insert, update, delete
  on table public.courses, public.course_modules, public.lessons
  to unclebashi_cms;

-- RLS is enabled on all Education tables. These role-specific policies
-- permit content administration only; learner tables receive no CMS policy.
create policy courses_cms_manage
  on public.courses
  for all
  to unclebashi_cms
  using (true)
  with check (true);

create policy course_modules_cms_manage
  on public.course_modules
  for all
  to unclebashi_cms
  using (true)
  with check (true);

create policy lessons_cms_manage
  on public.lessons
  for all
  to unclebashi_cms
  using (true)
  with check (true);

-- Guard against inherited schema CREATE grants (for example via PUBLIC).
do $check_cms_schema_privileges$
begin
  if pg_catalog.has_schema_privilege('unclebashi_cms', 'public', 'CREATE') then
    raise exception 'unclebashi_cms must not have CREATE on schema public';
  end if;
end;
$check_cms_schema_privileges$;

-- PUBLIC grants are inherited by every role in PostgreSQL. Fail closed if
-- any currently existing private table is exposed through such a grant.
do $check_cms_private_table_privileges$
declare
  v_table text;
  v_private_tables text[] := array[
    'public.users',
    'public.user_roles',
    'public.user_onboarding_data',
    'public.course_enrollments',
    'public.user_lesson_progress',
    'public.user_course_progress',
    'public.user_reflections'
  ];
begin
  foreach v_table in array v_private_tables loop
    if pg_catalog.to_regclass(v_table) is not null and (
      pg_catalog.has_table_privilege('unclebashi_cms', v_table, 'SELECT')
      or pg_catalog.has_table_privilege('unclebashi_cms', v_table, 'INSERT')
      or pg_catalog.has_table_privilege('unclebashi_cms', v_table, 'UPDATE')
      or pg_catalog.has_table_privilege('unclebashi_cms', v_table, 'DELETE')
    ) then
      raise exception 'unclebashi_cms has unexpected access to %', v_table;
    end if;
  end loop;
end;
$check_cms_private_table_privileges$;

commit;
