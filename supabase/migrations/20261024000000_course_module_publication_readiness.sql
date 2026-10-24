-- Require published lesson content in every module before publishing a course.
begin;

do $check_course_module_readiness_assumptions$
begin
  if pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.lessons') is null then
    raise exception 'Course publication tables are missing.';
  end if;
  if pg_catalog.to_regprocedure('public._course_publication_readiness(uuid)') is null then
    raise exception 'The existing course publication readiness helper is missing.';
  end if;
  if pg_catalog.to_regprocedure('public.get_admin_course_publication_readiness(uuid)') is null then
    raise exception 'The admin course publication readiness RPC is missing.';
  end if;
  if pg_catalog.to_regprocedure('public.admin_set_course_status(uuid, text)') is null then
    raise exception 'The admin course status RPC is missing.';
  end if;
end;
$check_course_module_readiness_assumptions$;

create or replace function public._course_publication_readiness(p_course_id uuid)
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
  v_empty_module record;
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

  for v_empty_module in
    select m.id, m.title
    from public.course_modules as m
    where m.course_id = p_course_id
      and not exists (
        select 1 from public.lessons as l
        where l.module_id = m.id
          and l.course_id = p_course_id
          and l.status = 'published'
      )
    order by m.display_order, m.id
  loop
    v_reasons := pg_catalog.array_append(
      v_reasons,
      'Module "' || v_empty_module.title || '" has no published lessons.'
    );
  end loop;

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

  return query select p_course_id, pg_catalog.cardinality(v_reasons) = 0,
    v_module_count, v_published_count, v_draft_count, v_reasons;
end;
$function$;

revoke all on function public._course_publication_readiness(uuid)
  from public, anon, authenticated;

do $check_course_module_readiness_postconditions$
declare
  v_helper_config text[];
begin
  if pg_catalog.to_regclass('public.courses') is null
     or pg_catalog.to_regclass('public.course_modules') is null
     or pg_catalog.to_regclass('public.lessons') is null
     or pg_catalog.to_regprocedure('public._course_publication_readiness(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_admin_course_publication_readiness(uuid)') is null
     or pg_catalog.to_regprocedure('public.admin_set_course_status(uuid, text)') is null then
    raise exception 'Course publication objects must remain present.';
  end if;

  select p.proconfig into v_helper_config
  from pg_catalog.pg_proc as p
  where p.oid = 'public._course_publication_readiness(uuid)'::pg_catalog.regprocedure
    and p.prosecdef;
  if not found or not exists (
    select 1 from pg_catalog.unnest(coalesce(v_helper_config, array[]::text[])) as config(setting)
    where pg_catalog.replace(config.setting, '"', '') = 'search_path='
  ) then
    raise exception 'Course readiness helper must remain SECURITY DEFINER with an empty search_path.';
  end if;

  if pg_catalog.has_function_privilege('authenticated',
       'public._course_publication_readiness(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public._course_publication_readiness(uuid)', 'EXECUTE') then
    raise exception 'Internal course readiness helper must not be executable by browser roles.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.get_admin_course_publication_readiness(uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.admin_set_course_status(uuid, text)', 'EXECUTE') then
    raise exception 'Existing admin course publication RPC grants must remain present.';
  end if;
end;
$check_course_module_readiness_postconditions$;

commit;
