-- Route module mutations through admin RPCs and require draft parent courses.
begin;

do $check_module_management_assumptions$
begin
  if pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.courses') is null
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
$check_module_management_assumptions$;

create function public.admin_create_course_module(
  p_course_id uuid,
  p_title text,
  p_description text default null
)
returns setof public.course_modules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_module public.course_modules%rowtype;
  v_title text;
  v_description text;
  v_display_order bigint;
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

  select course_row.* into v_course
  from public.courses as course_row
  where course_row.id = p_course_id
  for update;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before modules can be edited.' using errcode = '22023';
  end if;

  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  if v_title = '' then
    raise exception 'Module title is required.' using errcode = '22023';
  end if;
  v_description := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');

  select coalesce(pg_catalog.max(module_row.display_order)::bigint + 1, 0)
    into v_display_order
  from public.course_modules as module_row
  where module_row.course_id = p_course_id;
  if v_display_order > 2147483647 then
    raise exception 'Module order is too large to add another module safely.' using errcode = '22023';
  end if;

  insert into public.course_modules (course_id, title, description, display_order)
  values (p_course_id, v_title, v_description, v_display_order::integer)
  returning * into v_module;

  return next v_module;
end;
$function$;

create function public.admin_update_course_module(
  p_module_id uuid,
  p_title text,
  p_description text default null
)
returns setof public.course_modules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course_id uuid;
  v_course public.courses%rowtype;
  v_module public.course_modules%rowtype;
  v_title text;
  v_description text;
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
    raise exception 'Course must be a draft before modules can be edited.' using errcode = '22023';
  end if;

  select module_row.* into v_module
  from public.course_modules as module_row
  where module_row.id = p_module_id and module_row.course_id = v_course_id
  for update;
  if not found then
    raise exception 'Module not found.' using errcode = 'P0002';
  end if;

  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  if v_title = '' then
    raise exception 'Module title is required.' using errcode = '22023';
  end if;
  v_description := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');

  update public.course_modules as module_row
  set title = v_title, description = v_description
  where module_row.id = p_module_id
  returning module_row.* into v_module;

  return next v_module;
end;
$function$;

create function public.admin_reorder_course_modules(
  p_course_id uuid,
  p_module_ids uuid[]
)
returns table (course_id uuid, module_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_current_count bigint;
  v_requested_count bigint;
  v_distinct_count bigint;
  v_max_order integer;
  v_offset bigint;
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

  select course_row.* into v_course
  from public.courses as course_row
  where course_row.id = p_course_id
  for update;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before modules can be edited.' using errcode = '22023';
  end if;
  if p_module_ids is null then
    raise exception 'Module order is invalid.' using errcode = '22023';
  end if;

  perform module_row.id
  from public.course_modules as module_row
  where module_row.course_id = p_course_id
  order by module_row.id
  for update;

  select count(*), coalesce(pg_catalog.max(module_row.display_order), -1)
  into v_current_count, v_max_order
  from public.course_modules as module_row
  where module_row.course_id = p_course_id;
  select count(*), count(distinct requested.module_id)
  into v_requested_count, v_distinct_count
  from pg_catalog.unnest(p_module_ids) as requested(module_id);

  if v_requested_count <> v_current_count or v_distinct_count <> v_requested_count
     or exists (
       select 1
       from pg_catalog.unnest(p_module_ids) as requested(module_id)
       left join public.course_modules as module_row
         on module_row.id = requested.module_id
        and module_row.course_id = p_course_id
       where module_row.id is null
     ) then
    raise exception 'Module order is invalid.' using errcode = '22023';
  end if;

  if v_current_count > 0 then
    v_offset := v_max_order::bigint + 1;
    if v_max_order::bigint + v_offset > 2147483647 then
      raise exception 'Module order is too large to reorder safely.' using errcode = '22023';
    end if;

    -- Move every current order above the existing range before applying
    -- the requested contiguous order, avoiding transient unique conflicts.
    update public.course_modules as module_row
    set display_order = (module_row.display_order::bigint + v_offset)::integer
    where module_row.course_id = p_course_id;

    with requested_order as (
      select requested.module_id, (requested.ordinality - 1)::integer as new_order
      from pg_catalog.unnest(p_module_ids) with ordinality as requested(module_id, ordinality)
    )
    update public.course_modules as module_row
    set display_order = requested_order.new_order
    from requested_order
    where module_row.id = requested_order.module_id
      and module_row.course_id = p_course_id;
  end if;

  return query select p_course_id, p_module_ids;
end;
$function$;

-- Direct DML grants exist from the Education and CMS foundation migrations.
-- Keep SELECT grants and RLS read policies intact; protected RPCs own writes.
revoke insert, update, delete on table public.course_modules
  from public, anon, authenticated, unclebashi_cms;

revoke all on function public.admin_create_course_module(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_course_module(uuid, text, text)
  to authenticated;
revoke all on function public.admin_update_course_module(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_course_module(uuid, text, text)
  to authenticated;
revoke all on function public.admin_reorder_course_modules(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_reorder_course_modules(uuid, uuid[])
  to authenticated;

do $check_module_management_postconditions$
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.course_modules', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.course_modules', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.course_modules', 'DELETE')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.course_modules', 'INSERT')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.course_modules', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.course_modules', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.course_modules', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.course_modules', 'DELETE')
     or pg_catalog.has_any_column_privilege('anon', 'public.course_modules', 'INSERT')
     or pg_catalog.has_any_column_privilege('anon', 'public.course_modules', 'UPDATE')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.course_modules', 'INSERT')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.course_modules', 'UPDATE')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.course_modules', 'DELETE')
     or pg_catalog.has_any_column_privilege('unclebashi_cms', 'public.course_modules', 'INSERT')
     or pg_catalog.has_any_column_privilege('unclebashi_cms', 'public.course_modules', 'UPDATE') then
    raise exception 'Direct course module mutations remain available.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.course_modules'::pg_catalog.regclass and relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on public.course_modules.';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'course_modules'
      and policyname = 'course_modules_read_published' and cmd = 'SELECT')
     or not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'course_modules'
      and policyname = 'course_modules_admin_read_all' and cmd = 'SELECT') then
    raise exception 'Existing course module read policies must remain present.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.admin_create_course_module(uuid, text, text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_create_course_module(uuid, text, text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.admin_update_course_module(uuid, text, text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_update_course_module(uuid, text, text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.admin_reorder_course_modules(uuid, uuid[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_reorder_course_modules(uuid, uuid[])', 'EXECUTE') then
    raise exception 'Course module RPC grants are incorrect.';
  end if;
end;
$check_module_management_postconditions$;

commit;
