-- Permit admins to remove only empty modules from draft courses.
begin;

do $check_empty_module_removal_assumptions$
begin
  if pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.lessons') is null
     or pg_catalog.to_regclass('public.user_roles') is null then
    raise exception 'Required Education and identity tables are missing.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.course_modules'::pg_catalog.regclass and relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on public.course_modules.';
  end if;
end;
$check_empty_module_removal_assumptions$;

create function public.admin_remove_empty_course_module(p_module_id uuid)
returns table (deleted_module_id uuid, course_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course_id uuid;
  v_course public.courses%rowtype;
  v_module public.course_modules%rowtype;
  v_deleted_module_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  -- Resolve the parent, then serialize with lesson creation and other admin
  -- module operations, which take this same course-row lock first.
  select module_row.course_id into v_course_id
  from public.course_modules as module_row
  where module_row.id = p_module_id;
  if not found then
    raise exception 'Module not found.' using errcode = 'P0002';
  end if;

  select course_row.* into v_course
  from public.courses as course_row
  where course_row.id = v_course_id
  for update;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before an empty module can be removed.' using errcode = '22023';
  end if;

  -- Locking the module also conflicts with the key-share lock taken by a
  -- lesson's foreign-key check, closing the insertion race around the count.
  select module_row.* into v_module
  from public.course_modules as module_row
  where module_row.id = p_module_id
    and module_row.course_id = v_course_id
  for update;
  if not found then
    raise exception 'Module not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.lessons as lesson_row
    where lesson_row.module_id = v_module.id
  ) then
    raise exception 'Only an empty module can be removed.' using errcode = '22023';
  end if;

  delete from public.course_modules as module_row
  where module_row.id = v_module.id
    and module_row.course_id = v_course_id
  returning module_row.id into v_deleted_module_id;
  if not found then
    raise exception 'Module could not be removed. Refresh and try again.' using errcode = 'P0002';
  end if;

  return query select v_deleted_module_id, v_course_id;
end;
$function$;

revoke all on function public.admin_remove_empty_course_module(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_remove_empty_course_module(uuid)
  to authenticated;

do $check_empty_module_removal_postconditions$
begin
  if pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.lessons') is null
     or pg_catalog.to_regclass('public.user_roles') is null then
    raise exception 'Required Education and identity tables must remain present.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.course_modules'::pg_catalog.regclass and relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on public.course_modules.';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.course_modules', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.course_modules', 'DELETE')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.course_modules', 'DELETE') then
    raise exception 'Direct course module DELETE remains available.';
  end if;
  if not pg_catalog.has_function_privilege(
       'authenticated', 'public.admin_remove_empty_course_module(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege(
       'anon', 'public.admin_remove_empty_course_module(uuid)', 'EXECUTE') then
    raise exception 'Empty module removal RPC grants are incorrect.';
  end if;
end;
$check_empty_module_removal_postconditions$;

commit;
