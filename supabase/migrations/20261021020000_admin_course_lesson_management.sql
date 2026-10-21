-- Route lesson authoring and lifecycle changes through protected admin RPCs.
begin;

do $check_lesson_management_assumptions$
begin
  if pg_catalog.to_regclass('public.lessons') is null
     or pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.user_roles') is null then
    raise exception 'Required Education and identity tables are missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class
    where oid = 'public.lessons'::pg_catalog.regclass and relrowsecurity) then
    raise exception 'RLS must remain enabled on public.lessons.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_module_order_key' and contype = 'u') then
    raise exception 'The lesson module/order unique constraint is required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_content_type_check' and contype = 'c')
     or not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_duration_minutes_check' and contype = 'c')
     or not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_status_check' and contype = 'c') then
    raise exception 'Lesson content type, duration, and status constraints are required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_module_course_fkey' and contype = 'f')
     or not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.course_modules'::pg_catalog.regclass
      and confrelid = 'public.courses'::pg_catalog.regclass and contype = 'f') then
    raise exception 'The required lesson/module/course relationships are missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lessons'
      and policyname = 'lessons_read_accessible_published' and cmd = 'SELECT')
     or not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lessons'
      and policyname = 'lessons_admin_read_all' and cmd = 'SELECT') then
    raise exception 'Existing lesson read policies are required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.lessons'::pg_catalog.regclass
      and attname = 'duration_minutes' and attnotnull and not attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.lessons'::pg_catalog.regclass
      and attname = 'reflection_prompts'
      and atttypid = 'text[]'::pg_catalog.regtype and attnotnull and not attisdropped) then
    raise exception 'Lesson duration and reflection prompt schema assumptions are invalid.';
  end if;
end;
$check_lesson_management_assumptions$;

create function public.admin_create_course_lesson(
  p_module_id uuid,
  p_title text,
  p_content_type text,
  p_duration_minutes integer,
  p_description text default null,
  p_media_url text default null,
  p_content_body text default null,
  p_reflection_prompts text[] default '{}'::text[]
)
returns setof public.lessons
language plpgsql security definer set search_path = ''
as $function$
declare
  v_course_id uuid;
  v_course public.courses%rowtype;
  v_lesson public.lessons%rowtype;
  v_title text;
  v_description text;
  v_media_url text;
  v_content_body text;
  v_prompts text[];
  v_display_order bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select module_row.course_id into v_course_id
  from public.course_modules as module_row where module_row.id = p_module_id;
  if not found then raise exception 'Module not found.' using errcode = 'P0002'; end if;

  select course_row.* into v_course from public.courses as course_row
  where course_row.id = v_course_id for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before lessons can be edited.' using errcode = '22023';
  end if;

  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  if v_title = '' then raise exception 'Lesson title is required.' using errcode = '22023'; end if;
  if p_content_type is null or p_content_type not in ('video', 'article', 'reflection') then
    raise exception 'Lesson content type is invalid.' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'Lesson duration must be a positive whole number of minutes.' using errcode = '22023';
  end if;

  v_description := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');
  v_media_url := nullif(pg_catalog.btrim(coalesce(p_media_url, '')), '');
  v_content_body := nullif(pg_catalog.btrim(coalesce(p_content_body, '')), '');
  select coalesce(pg_catalog.array_agg(normalized.prompt order by normalized.ordinality), '{}'::text[])
    into v_prompts
  from (
    select pg_catalog.btrim(prompt.value) as prompt, prompt.ordinality
    from pg_catalog.unnest(coalesce(p_reflection_prompts, '{}'::text[]))
      with ordinality as prompt(value, ordinality)
    where nullif(pg_catalog.btrim(prompt.value), '') is not null
  ) as normalized;

  select coalesce(pg_catalog.max(lesson_row.display_order)::bigint + 1, 0)
    into v_display_order
  from public.lessons as lesson_row where lesson_row.module_id = p_module_id;
  if v_display_order > 2147483647 then
    raise exception 'Lesson order is too large to add another lesson safely.' using errcode = '22023';
  end if;

  insert into public.lessons (
    module_id, course_id, title, description, content_type, media_url,
    content_body, duration_minutes, reflection_prompts, status, display_order
  ) values (
    p_module_id, v_course_id, v_title, v_description, p_content_type, v_media_url,
    v_content_body, p_duration_minutes, v_prompts, 'draft', v_display_order::integer
  ) returning * into v_lesson;
  return next v_lesson;
end;
$function$;

create function public.admin_update_course_lesson(
  p_lesson_id uuid,
  p_title text,
  p_content_type text,
  p_duration_minutes integer,
  p_description text,
  p_media_url text,
  p_content_body text,
  p_reflection_prompts text[]
)
returns setof public.lessons
language plpgsql security definer set search_path = ''
as $function$
declare
  v_module_id uuid;
  v_course_id uuid;
  v_course public.courses%rowtype;
  v_lesson public.lessons%rowtype;
  v_title text;
  v_description text;
  v_media_url text;
  v_content_body text;
  v_prompts text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select lesson_row.module_id, lesson_row.course_id into v_module_id, v_course_id
  from public.lessons as lesson_row where lesson_row.id = p_lesson_id;
  if not found then raise exception 'Lesson not found.' using errcode = 'P0002'; end if;

  select course_row.* into v_course from public.courses as course_row
  where course_row.id = v_course_id for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before lessons can be edited.' using errcode = '22023';
  end if;
  select lesson_row.* into v_lesson from public.lessons as lesson_row
  where lesson_row.id = p_lesson_id and lesson_row.module_id = v_module_id
    and lesson_row.course_id = v_course_id for update;
  if not found then raise exception 'Lesson not found.' using errcode = 'P0002'; end if;
  if v_lesson.status <> 'draft' then
    raise exception 'Return the lesson to Draft before editing its content.' using errcode = '22023';
  end if;

  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  if v_title = '' then raise exception 'Lesson title is required.' using errcode = '22023'; end if;
  if p_content_type is null or p_content_type not in ('video', 'article', 'reflection') then
    raise exception 'Lesson content type is invalid.' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'Lesson duration must be a positive whole number of minutes.' using errcode = '22023';
  end if;

  v_description := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');
  v_media_url := nullif(pg_catalog.btrim(coalesce(p_media_url, '')), '');
  v_content_body := nullif(pg_catalog.btrim(coalesce(p_content_body, '')), '');
  select coalesce(pg_catalog.array_agg(normalized.prompt order by normalized.ordinality), '{}'::text[])
    into v_prompts
  from (
    select pg_catalog.btrim(prompt.value) as prompt, prompt.ordinality
    from pg_catalog.unnest(coalesce(p_reflection_prompts, '{}'::text[]))
      with ordinality as prompt(value, ordinality)
    where nullif(pg_catalog.btrim(prompt.value), '') is not null
  ) as normalized;

  update public.lessons as lesson_row
  set title = v_title, description = v_description, content_type = p_content_type,
      media_url = v_media_url, content_body = v_content_body,
      duration_minutes = p_duration_minutes, reflection_prompts = v_prompts
  where lesson_row.id = p_lesson_id returning lesson_row.* into v_lesson;
  return next v_lesson;
end;
$function$;

create function public._lesson_publication_readiness(p_lesson_id uuid)
returns table (lesson_id uuid, can_publish boolean, reasons text[])
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_lesson public.lessons%rowtype;
  v_course_status text;
  v_reasons text[] := '{}'::text[];
begin
  select lesson_row.* into v_lesson from public.lessons as lesson_row
  where lesson_row.id = p_lesson_id;
  if not found then
    return query select p_lesson_id, false, array['Lesson not found.']::text[];
    return;
  end if;

  select course_row.status into v_course_status from public.courses as course_row
  where course_row.id = v_lesson.course_id;
  if not found then
    v_reasons := pg_catalog.array_append(v_reasons, 'Parent course was not found.');
  elsif v_course_status <> 'draft' then
    v_reasons := pg_catalog.array_append(v_reasons, 'Parent course must be a draft.');
  end if;
  if v_lesson.status <> 'draft' then
    v_reasons := pg_catalog.array_append(v_reasons, 'Lesson must be a draft to publish.');
  end if;
  if nullif(pg_catalog.btrim(v_lesson.title), '') is null then
    v_reasons := pg_catalog.array_append(v_reasons, 'Lesson title is required.');
  end if;
  if v_lesson.content_type not in ('video', 'article', 'reflection') then
    v_reasons := pg_catalog.array_append(v_reasons, 'Lesson content type is invalid.');
  elsif v_lesson.content_type = 'video'
    and nullif(pg_catalog.btrim(v_lesson.media_url), '') is null then
    v_reasons := pg_catalog.array_append(v_reasons, 'Video lesson requires a media URL.');
  elsif v_lesson.content_type = 'article'
    and nullif(pg_catalog.btrim(v_lesson.content_body), '') is null then
    v_reasons := pg_catalog.array_append(v_reasons, 'Article lesson requires content.');
  elsif v_lesson.content_type = 'reflection'
    and not exists (select 1 from pg_catalog.unnest(v_lesson.reflection_prompts) as prompt(value)
      where nullif(pg_catalog.btrim(prompt.value), '') is not null) then
    v_reasons := pg_catalog.array_append(v_reasons, 'Reflection lesson requires at least one prompt.');
  end if;
  if v_lesson.duration_minutes <= 0 then
    v_reasons := pg_catalog.array_append(v_reasons, 'Lesson duration must be a positive whole number of minutes.');
  end if;
  return query select p_lesson_id, pg_catalog.cardinality(v_reasons) = 0, v_reasons;
end;
$function$;

create function public.get_admin_lesson_publication_readiness(p_lesson_id uuid)
returns table (lesson_id uuid, can_publish boolean, reasons text[])
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  return query select readiness.lesson_id, readiness.can_publish, readiness.reasons
  from public._lesson_publication_readiness(p_lesson_id) as readiness;
end;
$function$;

create function public.admin_set_course_lesson_status(p_lesson_id uuid, p_status text)
returns table (lesson_id uuid, status text, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_module_id uuid;
  v_course_id uuid;
  v_course public.courses%rowtype;
  v_lesson public.lessons%rowtype;
  v_readiness record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'Lesson status is invalid.' using errcode = '22023';
  end if;

  select lesson_row.module_id, lesson_row.course_id into v_module_id, v_course_id
  from public.lessons as lesson_row where lesson_row.id = p_lesson_id;
  if not found then raise exception 'Lesson not found.' using errcode = 'P0002'; end if;
  select course_row.* into v_course from public.courses as course_row
  where course_row.id = v_course_id for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before lesson status can change.' using errcode = '22023';
  end if;
  select lesson_row.* into v_lesson from public.lessons as lesson_row
  where lesson_row.id = p_lesson_id and lesson_row.module_id = v_module_id
    and lesson_row.course_id = v_course_id for update;
  if not found then raise exception 'Lesson not found.' using errcode = 'P0002'; end if;

  if v_lesson.status = p_status then
    if p_status = 'draft' then
      return query select v_lesson.id, v_lesson.status::text, v_lesson.updated_at;
      return;
    end if;
    raise exception 'That lesson status transition is not available.' using errcode = '22023';
  elsif v_lesson.status = 'draft' and p_status in ('published', 'archived') then
    if p_status = 'published' then
      select * into v_readiness from public._lesson_publication_readiness(p_lesson_id);
      if not v_readiness.can_publish then
        raise exception 'Lesson cannot be published: %',
          pg_catalog.array_to_string(v_readiness.reasons, '; ') using errcode = '22023';
      end if;
    end if;
  elsif v_lesson.status in ('published', 'archived') and p_status = 'draft' then
    null;
  else
    raise exception 'That lesson status transition is not available.' using errcode = '22023';
  end if;

  update public.lessons as lesson_row set status = p_status
  where lesson_row.id = p_lesson_id
  returning lesson_row.id, lesson_row.status::text, lesson_row.updated_at
  into lesson_id, status, updated_at;
  return next;
end;
$function$;

create function public.admin_reorder_module_lessons(p_module_id uuid, p_lesson_ids uuid[])
returns table (module_id uuid, lesson_ids uuid[])
language plpgsql security definer set search_path = ''
as $function$
declare
  v_course_id uuid;
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
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_lesson_ids is null then
    raise exception 'Lesson order is invalid.' using errcode = '22023';
  end if;

  select module_row.course_id into v_course_id from public.course_modules as module_row
  where module_row.id = p_module_id;
  if not found then raise exception 'Module not found.' using errcode = 'P0002'; end if;
  select course_row.* into v_course from public.courses as course_row
  where course_row.id = v_course_id for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if v_course.status <> 'draft' then
    raise exception 'Course must be a draft before lessons can be reordered.' using errcode = '22023';
  end if;

  perform module_row.id from public.course_modules as module_row
  where module_row.id = p_module_id and module_row.course_id = v_course_id for update;

  perform lesson_row.id from public.lessons as lesson_row
  where lesson_row.module_id = p_module_id order by lesson_row.id for update;
  select count(*), coalesce(pg_catalog.max(lesson_row.display_order), -1)
  into v_current_count, v_max_order
  from public.lessons as lesson_row where lesson_row.module_id = p_module_id;
  select count(*), count(distinct requested.lesson_id)
  into v_requested_count, v_distinct_count
  from pg_catalog.unnest(p_lesson_ids) as requested(lesson_id);

  if v_requested_count <> v_current_count or v_distinct_count <> v_requested_count
     or exists (
       select 1 from pg_catalog.unnest(p_lesson_ids) as requested(lesson_id)
       left join public.lessons as lesson_row
         on lesson_row.id = requested.lesson_id and lesson_row.module_id = p_module_id
       where lesson_row.id is null
     ) then
    raise exception 'Lesson order is invalid.' using errcode = '22023';
  end if;

  if v_current_count > 0 then
    v_offset := v_max_order::bigint + 1;
    if v_max_order::bigint + v_offset > 2147483647 then
      raise exception 'Lesson order is too large to reorder safely.' using errcode = '22023';
    end if;
    update public.lessons as lesson_row
    set display_order = (lesson_row.display_order::bigint + v_offset)::integer
    where lesson_row.module_id = p_module_id;
    with requested_order as (
      select requested.lesson_id, (requested.ordinality - 1)::integer as new_order
      from pg_catalog.unnest(p_lesson_ids) with ordinality as requested(lesson_id, ordinality)
    )
    update public.lessons as lesson_row set display_order = requested_order.new_order
    from requested_order
    where lesson_row.id = requested_order.lesson_id and lesson_row.module_id = p_module_id;
  end if;
  return query select p_module_id, p_lesson_ids;
end;
$function$;

revoke insert, update, delete on table public.lessons
  from public, anon, authenticated, unclebashi_cms;

revoke all on function public.admin_create_course_lesson(uuid, text, text, integer, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.admin_create_course_lesson(uuid, text, text, integer, text, text, text, text[])
  to authenticated;
revoke all on function public.admin_update_course_lesson(uuid, text, text, integer, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.admin_update_course_lesson(uuid, text, text, integer, text, text, text, text[])
  to authenticated;
revoke all on function public._lesson_publication_readiness(uuid)
  from public, anon, authenticated;
revoke all on function public.get_admin_lesson_publication_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_lesson_publication_readiness(uuid)
  to authenticated;
revoke all on function public.admin_set_course_lesson_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_course_lesson_status(uuid, text)
  to authenticated;
revoke all on function public.admin_reorder_module_lessons(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_reorder_module_lessons(uuid, uuid[])
  to authenticated;

do $check_lesson_management_postconditions$
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.lessons', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.lessons', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.lessons', 'DELETE')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.lessons', 'INSERT')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.lessons', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.lessons', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.lessons', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.lessons', 'DELETE')
     or pg_catalog.has_any_column_privilege('anon', 'public.lessons', 'INSERT')
     or pg_catalog.has_any_column_privilege('anon', 'public.lessons', 'UPDATE')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.lessons', 'INSERT')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.lessons', 'UPDATE')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.lessons', 'DELETE')
     or pg_catalog.has_any_column_privilege('unclebashi_cms', 'public.lessons', 'INSERT')
     or pg_catalog.has_any_column_privilege('unclebashi_cms', 'public.lessons', 'UPDATE') then
    raise exception 'Direct lesson mutations remain available.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class
    where oid = 'public.lessons'::pg_catalog.regclass and relrowsecurity) then
    raise exception 'RLS must remain enabled on public.lessons.';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lessons'
      and policyname = 'lessons_read_accessible_published' and cmd = 'SELECT')
     or not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lessons'
      and policyname = 'lessons_admin_read_all' and cmd = 'SELECT') then
    raise exception 'Existing lesson read policies must remain present.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_module_order_key' and contype = 'u')
     or not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::pg_catalog.regclass
      and conname = 'lessons_module_course_fkey' and contype = 'f')
     or not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.course_modules'::pg_catalog.regclass
      and confrelid = 'public.courses'::pg_catalog.regclass and contype = 'f') then
    raise exception 'Required lesson ordering and parent relationships must remain present.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.admin_create_course_lesson(uuid, text, text, integer, text, text, text, text[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_create_course_lesson(uuid, text, text, integer, text, text, text, text[])', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.admin_update_course_lesson(uuid, text, text, integer, text, text, text, text[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_update_course_lesson(uuid, text, text, integer, text, text, text, text[])', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.get_admin_lesson_publication_readiness(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.get_admin_lesson_publication_readiness(uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.admin_set_course_lesson_status(uuid, text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_set_course_lesson_status(uuid, text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.admin_reorder_module_lessons(uuid, uuid[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_reorder_module_lessons(uuid, uuid[])', 'EXECUTE') then
    raise exception 'Lesson RPC grants are incorrect.';
  end if;
  if pg_catalog.has_function_privilege('authenticated',
       'public._lesson_publication_readiness(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public._lesson_publication_readiness(uuid)', 'EXECUTE') then
    raise exception 'Internal lesson readiness helper must not be executable by browser roles.';
  end if;
end;
$check_lesson_management_postconditions$;

commit;
