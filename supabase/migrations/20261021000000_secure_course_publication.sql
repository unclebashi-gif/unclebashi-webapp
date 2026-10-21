-- Secure course publication behind database readiness checks and admin RPCs.
begin;

do $check_publication_assumptions$
declare
  v_status_default text;
begin
  if pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.lessons') is null
     or pg_catalog.to_regclass('public.user_roles') is null then
    raise exception 'Required Education and identity tables are missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.courses'::pg_catalog.regclass
      and conname = 'courses_launch_price_check') then
    raise exception 'The existing course commercial-terms constraint is required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'courses'
      and policyname = 'courses_admin_insert' and cmd = 'INSERT')
     or not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'courses'
      and policyname = 'courses_admin_update' and cmd = 'UPDATE') then
    raise exception 'Existing admin-only course RLS policies are required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class
    where oid = 'public.courses'::pg_catalog.regclass and relrowsecurity) then
    raise exception 'RLS must remain enabled on public.courses.';
  end if;
  select pg_catalog.pg_get_expr(d.adbin, d.adrelid) into v_status_default
  from pg_catalog.pg_attrdef as d
  join pg_catalog.pg_attribute as a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.courses'::pg_catalog.regclass
    and a.attname = 'status' and not a.attisdropped;
  if v_status_default is distinct from '''draft''::text' then
    raise exception 'New courses must rely on the existing draft status default.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'unclebashi_cms') then
    raise exception 'The existing restricted CMS role is required.';
  end if;
end;
$check_publication_assumptions$;

-- Preserve other course-manager fields while removing direct publication
-- authority from browser roles and the legacy CMS role.
revoke insert (status), update (status) on table public.courses
  from public, anon, authenticated, unclebashi_cms;
revoke delete on table public.courses
  from public, anon, authenticated, unclebashi_cms;

do $check_status_privileges$
begin
  if pg_catalog.has_column_privilege('authenticated', 'public.courses', 'status', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'status', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.courses', 'status', 'INSERT')
     or pg_catalog.has_column_privilege('anon', 'public.courses', 'status', 'UPDATE')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'status', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'status', 'UPDATE') then
    raise exception 'Direct course status writes remain available.';
  end if;
  if not pg_catalog.has_column_privilege('authenticated', 'public.courses', 'audience_gender', 'INSERT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.courses', 'audience_gender', 'UPDATE') then
    raise exception 'Admin audience metadata privileges must remain available.';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.courses', 'is_free', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'is_free', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'price_amount', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'price_amount', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'currency', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'currency', 'UPDATE') then
    raise exception 'Course commercial terms must remain protected by their admin RPC.';
  end if;
end;
$check_status_privileges$;

-- Shared, non-executable-by-callers readiness implementation.
create function public._course_publication_readiness(p_course_id uuid)
returns table (
  course_id uuid,
  can_publish boolean,
  module_count bigint,
  published_lesson_count bigint,
  draft_lesson_count bigint,
  reasons text[]
)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_module_count bigint := 0;
  v_published_count bigint := 0;
  v_draft_count bigint := 0;
  v_reasons text[] := array[]::text[];
begin
  select c.* into v_course from public.courses as c where c.id = p_course_id;
  if not found then
    return query select p_course_id, false, 0::bigint, 0::bigint, 0::bigint,
      array['Course not found.']::text[];
    return;
  end if;

  select count(*) into v_module_count from public.course_modules as m where m.course_id = p_course_id;
  select count(*) filter (where l.status = 'published'),
         count(*) filter (where l.status = 'draft')
    into v_published_count, v_draft_count
  from public.lessons as l where l.course_id = p_course_id;

  if v_course.status <> 'draft' then
    v_reasons := pg_catalog.array_append(v_reasons, 'Course must be a draft to publish.');
  end if;
  if pg_catalog.left(v_course.slug, 8) = 'sandbox-' then
    v_reasons := pg_catalog.array_append(v_reasons, 'Sandbox/test courses cannot be published.');
  end if;
  if v_module_count = 0 then
    v_reasons := pg_catalog.array_append(v_reasons, 'Course has no modules.');
  end if;
  if v_published_count = 0 then
    v_reasons := pg_catalog.array_append(v_reasons, 'No published lessons.');
  end if;
  if exists (select 1 from public.lessons as l
    where l.course_id = p_course_id and l.status = 'published'
      and l.content_type = 'video' and nullif(pg_catalog.btrim(l.media_url), '') is null) then
    v_reasons := pg_catalog.array_append(v_reasons, 'A published video lesson is missing media.');
  end if;
  if exists (select 1 from public.lessons as l
    where l.course_id = p_course_id and l.status = 'published'
      and l.content_type = 'article' and nullif(pg_catalog.btrim(l.content_body), '') is null) then
    v_reasons := pg_catalog.array_append(v_reasons, 'A published article lesson is missing content.');
  end if;
  if exists (select 1 from public.lessons as l
    where l.course_id = p_course_id and l.status = 'published'
      and l.content_type = 'reflection'
      and not exists (
        select 1 from pg_catalog.unnest(l.reflection_prompts) as p(value)
        where nullif(pg_catalog.btrim(p.value), '') is not null
      )) then
    v_reasons := pg_catalog.array_append(v_reasons, 'A published reflection lesson has no prompt.');
  end if;

  if v_course.is_free then
    if coalesce(v_course.price_amount, 0) <> 0
       or (v_course.currency is not null and v_course.currency <> 'UGX') then
      v_reasons := pg_catalog.array_append(v_reasons, 'Free course commercial terms are invalid.');
    end if;
  elsif v_course.price_amount is null or v_course.price_amount <= 0
     or v_course.currency is distinct from 'UGX' then
    v_reasons := pg_catalog.array_append(v_reasons, 'Paid courses require a positive whole-unit UGX price.');
  end if;

  return query select p_course_id, cardinality(v_reasons) = 0,
    v_module_count, v_published_count, v_draft_count, v_reasons;
end;
$function$;

revoke all on function public._course_publication_readiness(uuid)
  from public, anon, authenticated;

create function public.get_admin_course_publication_readiness(p_course_id uuid)
returns table (
  course_id uuid,
  can_publish boolean,
  module_count bigint,
  published_lesson_count bigint,
  draft_lesson_count bigint,
  reasons text[]
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles as r
    where r.user_id = auth.uid() and r.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  return query select readiness.course_id, readiness.can_publish, readiness.module_count,
    readiness.published_lesson_count, readiness.draft_lesson_count, readiness.reasons
  from public._course_publication_readiness(p_course_id) as readiness;
end;
$function$;

create function public.admin_set_course_status(p_course_id uuid, p_status text)
returns table (course_id uuid, status text, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_readiness record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles as r
    where r.user_id = auth.uid() and r.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'Course status is invalid.' using errcode = '22023';
  end if;

  select c.* into v_course from public.courses as c where c.id = p_course_id for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;

  if v_course.status = 'draft' and p_status = 'draft' then
    return query select v_course.id, v_course.status::text, v_course.updated_at;
    return;
  elsif p_status = 'published' then
    if v_course.status <> 'draft' then
      raise exception 'Only draft courses can be published.' using errcode = '22023';
    end if;
    select * into v_readiness from public._course_publication_readiness(p_course_id);
    if not v_readiness.can_publish then
      raise exception 'Course cannot be published: %',
        pg_catalog.array_to_string(v_readiness.reasons, '; ') using errcode = '22023';
    end if;
  elsif p_status = 'draft' then
    if v_course.status not in ('published', 'archived') then
      raise exception 'Course cannot transition to draft from its current status.' using errcode = '22023';
    end if;
  elsif p_status = 'archived' then
    if v_course.status <> 'draft' then
      raise exception 'Only draft courses can be archived.' using errcode = '22023';
    end if;
  end if;

  update public.courses as c set status = p_status where c.id = p_course_id
  returning c.id, c.status::text, c.updated_at into course_id, status, updated_at;
  return next;
end;
$function$;

revoke all on function public.get_admin_course_publication_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_course_publication_readiness(uuid) to authenticated;
revoke all on function public.admin_set_course_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_course_status(uuid, text) to authenticated;

do $check_publication_postconditions$
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.courses', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.courses', 'DELETE')
     or pg_catalog.has_table_privilege('unclebashi_cms', 'public.courses', 'DELETE') then
    raise exception 'Direct course deletes remain available after migration.';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.courses', 'status', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'status', 'UPDATE')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'status', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'status', 'UPDATE') then
    raise exception 'Direct course status writes remain available after migration.';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'courses'
      and policyname = 'courses_admin_insert' and cmd = 'INSERT')
     or not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'courses'
      and policyname = 'courses_admin_update' and cmd = 'UPDATE') then
    raise exception 'Admin-only course RLS policies must remain present.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.get_admin_course_publication_readiness(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.get_admin_course_publication_readiness(uuid)', 'EXECUTE') then
    raise exception 'Publication readiness RPC grants are incorrect.';
  end if;
  if pg_catalog.has_function_privilege('authenticated',
       'public._course_publication_readiness(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public._course_publication_readiness(uuid)', 'EXECUTE') then
    raise exception 'Internal readiness helper must not be executable by browser roles.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.admin_set_course_status(uuid, text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.admin_set_course_status(uuid, text)', 'EXECUTE') then
    raise exception 'Course status RPC grants are incorrect.';
  end if;
end;
$check_publication_postconditions$;

commit;

