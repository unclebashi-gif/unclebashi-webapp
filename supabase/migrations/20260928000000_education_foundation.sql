-- Education content and learner-state foundation.
-- Course completion is calculated by database functions from published lessons.
begin;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  category text,
  thumbnail_url text,
  is_free boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  description text,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_modules_course_order_key unique (course_id, display_order),
  constraint course_modules_id_course_key unique (id, course_id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null,
  course_id uuid not null,
  title text not null,
  description text,
  content_type text not null
    check (content_type in ('video', 'article', 'reflection')),
  media_url text,
  content_body text,
  duration_minutes integer not null check (duration_minutes > 0),
  reflection_prompts text[] not null default '{}'::text[],
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_module_order_key unique (module_id, display_order),
  constraint lessons_id_course_key unique (id, course_id),
  constraint lessons_module_course_fkey foreign key (module_id, course_id)
    references public.course_modules (id, course_id) on delete cascade,
  constraint published_lesson_has_content_check check (
    status <> 'published'
    or (content_type <> 'video' or nullif(btrim(media_url), '') is not null)
  ),
  constraint published_article_has_body_check check (
    status <> 'published'
    or (content_type <> 'article' or nullif(btrim(content_body), '') is not null)
  )
);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  access_source text not null
    check (access_source in ('free', 'purchase', 'admin_grant')),
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_enrollments_user_course_key unique (user_id, course_id),
  constraint course_enrollments_id_course_key unique (id, course_id),
  constraint course_enrollments_revocation_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create table public.user_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  course_id uuid not null,
  lesson_id uuid not null,
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  accumulated_watch_seconds integer not null default 0 check (accumulated_watch_seconds >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_lesson_progress_enrollment_lesson_key unique (enrollment_id, lesson_id),
  constraint user_lesson_progress_enrollment_course_fkey
    foreign key (enrollment_id, course_id)
    references public.course_enrollments (id, course_id) on delete cascade,
  constraint user_lesson_progress_lesson_course_fkey
    foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete restrict,
  constraint user_lesson_progress_completion_check check (
    (is_completed and completed_at is not null)
    or (not is_completed and completed_at is null)
  )
);

create table public.user_course_progress (
  enrollment_id uuid primary key references public.course_enrollments (id) on delete cascade,
  completed_lesson_count integer not null default 0 check (completed_lesson_count >= 0),
  total_lesson_count integer not null default 0 check (total_lesson_count >= 0),
  progress_percentage integer not null default 0
    check (progress_percentage between 0 and 100),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_course_progress_counts_check check (
    completed_lesson_count <= total_lesson_count
  ),
  constraint user_course_progress_completion_check check (
    (status = 'completed' and total_lesson_count > 0
      and completed_lesson_count = total_lesson_count
      and progress_percentage = 100 and completed_at is not null)
    or (status = 'not_started' and completed_lesson_count = 0
      and progress_percentage = 0 and completed_at is null)
    or (status = 'in_progress' and total_lesson_count > 0
      and completed_lesson_count > 0
      and completed_lesson_count < total_lesson_count
      and progress_percentage < 100 and completed_at is null)
  )
);

create table public.user_reflections (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  course_id uuid not null,
  lesson_id uuid not null,
  response text not null check (length(btrim(response)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reflections_enrollment_lesson_key unique (enrollment_id, lesson_id),
  constraint user_reflections_enrollment_course_fkey
    foreign key (enrollment_id, course_id)
    references public.course_enrollments (id, course_id) on delete cascade,
  constraint user_reflections_lesson_course_fkey
    foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete restrict
);

create index lessons_module_status_order_idx
  on public.lessons (module_id, status, display_order);
create index courses_status_order_idx
  on public.courses (status, display_order);
create index course_enrollments_course_status_idx
  on public.course_enrollments (course_id, status);
create index user_lesson_progress_lesson_idx
  on public.user_lesson_progress (lesson_id);
create index user_reflections_lesson_idx
  on public.user_reflections (lesson_id);

-- Reuse the Phase 2 trigger function; do not define another helper.
create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create trigger course_modules_set_updated_at
before update on public.course_modules
for each row execute function public.set_updated_at();

create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();

create trigger course_enrollments_set_updated_at
before update on public.course_enrollments
for each row execute function public.set_updated_at();

create trigger user_lesson_progress_set_updated_at
before update on public.user_lesson_progress
for each row execute function public.set_updated_at();

create trigger user_course_progress_set_updated_at
before update on public.user_course_progress
for each row execute function public.set_updated_at();

create trigger user_reflections_set_updated_at
before update on public.user_reflections
for each row execute function public.set_updated_at();

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.user_lesson_progress enable row level security;
alter table public.user_course_progress enable row level security;
alter table public.user_reflections enable row level security;

revoke all on table public.courses, public.course_modules, public.lessons,
  public.course_enrollments, public.user_lesson_progress,
  public.user_course_progress, public.user_reflections
  from public, anon, authenticated;

grant select on table public.courses, public.course_modules, public.lessons
  to authenticated;
grant insert, update, delete on table public.courses, public.course_modules, public.lessons
  to authenticated;
grant select on table public.course_enrollments, public.user_lesson_progress,
  public.user_course_progress, public.user_reflections to authenticated;

create policy courses_read_published
on public.courses for select to authenticated
using (status = 'published');

create policy courses_admin_read_all
on public.courses for select to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));

create policy course_modules_read_published
on public.course_modules for select to authenticated
using (exists (
  select 1 from public.courses as course_row
  where course_row.id = course_id and course_row.status = 'published'
));

create policy course_modules_admin_read_all
on public.course_modules for select to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));

create policy lessons_read_accessible_published
on public.lessons for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.course_modules as module_row
    join public.courses as course_row on course_row.id = module_row.course_id
    where module_row.id = module_id
      and course_row.status = 'published'
      and (
        course_row.is_free
        or exists (
          select 1 from public.course_enrollments as enrollment_row
          where enrollment_row.course_id = course_row.id
            and enrollment_row.user_id = (select auth.uid())
            and enrollment_row.status = 'active'
        )
      )
  )
);

create policy lessons_admin_read_all
on public.lessons for select to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));

create policy courses_admin_insert
on public.courses for insert to authenticated
with check (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));
create policy courses_admin_update
on public.courses for update to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
))
with check (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));
create policy courses_admin_delete
on public.courses for delete to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));

create policy course_modules_admin_insert
on public.course_modules for insert to authenticated
with check (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));
create policy course_modules_admin_update
on public.course_modules for update to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
))
with check (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));
create policy course_modules_admin_delete
on public.course_modules for delete to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));

create policy lessons_admin_insert
on public.lessons for insert to authenticated
with check (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));
create policy lessons_admin_update
on public.lessons for update to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
))
with check (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));
create policy lessons_admin_delete
on public.lessons for delete to authenticated
using (exists (
  select 1 from public.user_roles as role_row
  where role_row.user_id = (select auth.uid()) and role_row.role = 'admin'
));

create policy course_enrollments_read_own
on public.course_enrollments for select to authenticated
using (user_id = (select auth.uid()));

create policy user_lesson_progress_read_own
on public.user_lesson_progress for select to authenticated
using (exists (
  select 1 from public.course_enrollments as enrollment_row
  where enrollment_row.id = enrollment_id
    and enrollment_row.user_id = (select auth.uid())
));

create policy user_course_progress_read_own
on public.user_course_progress for select to authenticated
using (exists (
  select 1 from public.course_enrollments as enrollment_row
  where enrollment_row.id = enrollment_id
    and enrollment_row.user_id = (select auth.uid())
));

create policy user_reflections_read_own
on public.user_reflections for select to authenticated
using (exists (
  select 1 from public.course_enrollments as enrollment_row
  where enrollment_row.id = enrollment_id
    and enrollment_row.user_id = (select auth.uid())
));

-- Internal summary calculator. It is callable only by the owner of the
-- authenticated SECURITY DEFINER RPCs below, never by browser roles.
create function public.refresh_course_progress(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course_id uuid;
  v_total integer;
  v_completed integer;
  v_progress integer;
  v_status text;
begin
  select enrollment_row.course_id
    into v_course_id
    from public.course_enrollments as enrollment_row
    where enrollment_row.id = p_enrollment_id;

  if not found then
    raise exception 'Course enrollment not found.' using errcode = 'P0002';
  end if;

  select count(*)::integer
    into v_total
    from public.lessons as lesson_row
    join public.course_modules as module_row on module_row.id = lesson_row.module_id
    where module_row.course_id = v_course_id
      and lesson_row.status = 'published';

  select count(*)::integer
    into v_completed
    from public.lessons as lesson_row
    join public.course_modules as module_row on module_row.id = lesson_row.module_id
    join public.user_lesson_progress as progress_row
      on progress_row.lesson_id = lesson_row.id
     and progress_row.enrollment_id = p_enrollment_id
     and progress_row.is_completed
    where module_row.course_id = v_course_id
      and lesson_row.status = 'published';

  v_progress := case when v_total = 0 then 0
    else floor((v_completed::numeric * 100) / v_total)::integer end;
  v_status := case
    when v_total > 0 and v_completed = v_total then 'completed'
    when v_completed > 0 then 'in_progress'
    else 'not_started'
  end;

  insert into public.user_course_progress as existing (
    enrollment_id, completed_lesson_count, total_lesson_count,
    progress_percentage, status, completed_at, updated_at
  ) values (
    p_enrollment_id, v_completed, v_total, v_progress, v_status,
    case when v_status = 'completed' then now() else null end, now()
  )
  on conflict (enrollment_id) do update set
    completed_lesson_count = excluded.completed_lesson_count,
    total_lesson_count = excluded.total_lesson_count,
    progress_percentage = excluded.progress_percentage,
    status = excluded.status,
    completed_at = case
      when excluded.status = 'completed' then coalesce(existing.completed_at, now())
      else null
    end,
    updated_at = now();
end;
$function$;

revoke all on function public.refresh_course_progress(uuid)
  from public, anon, authenticated;

create function public.refresh_course_progress_for_lesson_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course_id uuid;
  v_enrollment_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      v_course_id := new.course_id;
      for v_enrollment_id in
        select enrollment_row.id from public.course_enrollments as enrollment_row
        where enrollment_row.course_id = v_course_id
      loop
        perform public.refresh_course_progress(v_enrollment_id);
      end loop;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'published' then
      v_course_id := old.course_id;
      for v_enrollment_id in
        select enrollment_row.id from public.course_enrollments as enrollment_row
        where enrollment_row.course_id = v_course_id
      loop
        perform public.refresh_course_progress(v_enrollment_id);
      end loop;
    end if;
  elsif old.status is distinct from new.status
     or old.module_id is distinct from new.module_id
     or old.course_id is distinct from new.course_id then
    if old.status = 'published' or new.status = 'published' then
      for v_course_id in
        select distinct affected.course_id
        from (values (old.course_id), (new.course_id)) as affected(course_id)
      loop
        for v_enrollment_id in
          select enrollment_row.id from public.course_enrollments as enrollment_row
          where enrollment_row.course_id = v_course_id
        loop
          perform public.refresh_course_progress(v_enrollment_id);
        end loop;
      end loop;
    end if;
  end if;
  return null;
end;
$function$;

revoke all on function public.refresh_course_progress_for_lesson_change()
  from public, anon, authenticated;

create trigger lessons_refresh_course_progress
after insert or delete or update of status, module_id, course_id
on public.lessons
for each row execute function public.refresh_course_progress_for_lesson_change();

create function public.enroll_in_free_course(p_course_id uuid)
returns table (
  enrollment_id uuid,
  course_id uuid,
  status text,
  access_source text,
  enrolled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_is_free boolean;
  v_course_status text;
  v_enrollment public.course_enrollments%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to enroll.' using errcode = '42501';
  end if;

  select course_row.is_free, course_row.status
    into v_is_free, v_course_status
    from public.courses as course_row
    where course_row.id = p_course_id;

  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course_status <> 'published' then
    raise exception 'Course is not published.' using errcode = '42501';
  end if;
  if not v_is_free then
    raise exception 'This course requires an authorized access grant.' using errcode = '42501';
  end if;

  insert into public.course_enrollments as existing (
    user_id, course_id, status, access_source
  ) values (
    v_user_id, p_course_id, 'active', 'free'
  )
  on conflict (user_id, course_id) do update set
    status = 'active',
    access_source = case when existing.status = 'active'
      then existing.access_source else 'free' end,
    enrolled_at = case when existing.status = 'active'
      then existing.enrolled_at else now() end,
    revoked_at = null,
    updated_at = now()
  returning existing.* into v_enrollment;

  perform public.refresh_course_progress(v_enrollment.id);

  return query select v_enrollment.id, v_enrollment.course_id,
    v_enrollment.status, v_enrollment.access_source, v_enrollment.enrolled_at;
end;
$function$;

revoke all on function public.enroll_in_free_course(uuid)
  from public, anon, authenticated;
grant execute on function public.enroll_in_free_course(uuid) to authenticated;

create function public.save_lesson_progress(
  p_lesson_id uuid,
  p_last_position_seconds integer,
  p_accumulated_watch_seconds integer,
  p_article_completion_requested boolean
)
returns table (
  enrollment_id uuid,
  completed_lesson_count integer,
  total_lesson_count integer,
  progress_percentage integer,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment_id uuid;
  v_course_id uuid;
  v_duration_seconds bigint;
  v_content_type text;
  v_course_status text;
  v_should_complete boolean;
  v_has_reflection boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save lesson progress.'
      using errcode = '42501';
  end if;
  if p_last_position_seconds is null or p_last_position_seconds < 0
     or p_accumulated_watch_seconds is null or p_accumulated_watch_seconds < 0 then
    raise exception 'Lesson position and watch time must be nonnegative integers.'
      using errcode = '22023';
  end if;

  select enrollment_row.id,
         enrollment_row.course_id,
         lesson_row.duration_minutes::bigint * 60,
         lesson_row.content_type,
         course_row.status
    into v_enrollment_id, v_course_id, v_duration_seconds, v_content_type, v_course_status
    from public.course_enrollments as enrollment_row
    join public.course_modules as module_row
      on module_row.course_id = enrollment_row.course_id
    join public.lessons as lesson_row
      on lesson_row.module_id = module_row.id and lesson_row.id = p_lesson_id
    join public.courses as course_row on course_row.id = enrollment_row.course_id
    where enrollment_row.user_id = v_user_id
      and enrollment_row.status = 'active'
      and lesson_row.status = 'published'
    limit 1;

  if not found then
    raise exception 'No active enrollment grants access to this published lesson.'
      using errcode = '42501';
  end if;
  if v_course_status <> 'published' then
    raise exception 'Course is not published.' using errcode = '42501';
  end if;
  if p_last_position_seconds > v_duration_seconds
     or p_accumulated_watch_seconds > v_duration_seconds then
    raise exception 'Lesson progress exceeds the lesson duration.' using errcode = '22023';
  end if;

  if coalesce(p_article_completion_requested, false)
     and v_content_type <> 'article' then
    raise exception 'The completion request is only valid for article lessons.'
      using errcode = '22023';
  end if;

  if v_content_type = 'video' then
    -- Product rule: 90% reported playback position; this is not attention telemetry.
    v_should_complete := p_last_position_seconds >= (v_duration_seconds * 9 / 10);
  elsif v_content_type = 'article' then
    v_should_complete := coalesce(p_article_completion_requested, false);
  else
    select exists (
      select 1 from public.user_reflections as reflection_row
      where reflection_row.enrollment_id = v_enrollment_id
        and reflection_row.lesson_id = p_lesson_id
        and length(btrim(reflection_row.response)) > 0
    ) into v_has_reflection;
    v_should_complete := v_has_reflection;
  end if;

  insert into public.user_lesson_progress as existing (
    enrollment_id, course_id, lesson_id, last_position_seconds,
    accumulated_watch_seconds, is_completed, completed_at
  ) values (
    v_enrollment_id, v_course_id,
    p_lesson_id, p_last_position_seconds,
    p_accumulated_watch_seconds, v_should_complete,
    case when v_should_complete then now() else null end
  )
  on conflict (enrollment_id, lesson_id) do update set
    last_position_seconds = greatest(existing.last_position_seconds, excluded.last_position_seconds),
    accumulated_watch_seconds = greatest(existing.accumulated_watch_seconds, excluded.accumulated_watch_seconds),
    is_completed = existing.is_completed or excluded.is_completed,
    completed_at = case
      when existing.is_completed then existing.completed_at
      when excluded.is_completed then now()
      else null
    end,
    updated_at = now();

  perform public.refresh_course_progress(v_enrollment_id);

  return query
    select v_enrollment_id, summary.completed_lesson_count,
      summary.total_lesson_count, summary.progress_percentage,
      summary.status, summary.completed_at
    from public.user_course_progress as summary
    where summary.enrollment_id = v_enrollment_id;
end;
$function$;

revoke all on function public.save_lesson_progress(uuid, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.save_lesson_progress(uuid, integer, integer, boolean)
  to authenticated;

create function public.save_lesson_reflection(
  p_lesson_id uuid,
  p_response text
)
returns table (
  reflection_id uuid,
  lesson_id uuid,
  response text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment_id uuid;
  v_course_id uuid;
  v_content_type text;
  v_reflection public.user_reflections%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save a reflection.'
      using errcode = '42501';
  end if;
  if p_response is null or length(btrim(p_response)) = 0 or length(p_response) > 20000 then
    raise exception 'Reflection must contain between 1 and 20000 characters.'
      using errcode = '22023';
  end if;

  select enrollment_row.id, enrollment_row.course_id, lesson_row.content_type
    into v_enrollment_id, v_course_id, v_content_type
    from public.course_enrollments as enrollment_row
    join public.course_modules as module_row
      on module_row.course_id = enrollment_row.course_id
    join public.lessons as lesson_row
      on lesson_row.module_id = module_row.id and lesson_row.id = p_lesson_id
    join public.courses as course_row on course_row.id = enrollment_row.course_id
    where enrollment_row.user_id = v_user_id
      and enrollment_row.status = 'active'
      and lesson_row.status = 'published'
      and course_row.status = 'published'
    limit 1;

  if not found then
    raise exception 'No active enrollment grants access to this published lesson.'
      using errcode = '42501';
  end if;

  insert into public.user_reflections as existing (
    enrollment_id, course_id, lesson_id, response
  ) values (
    v_enrollment_id, v_course_id, p_lesson_id, p_response
  )
  on conflict (enrollment_id, lesson_id) do update set
    response = excluded.response,
    updated_at = now()
  returning existing.* into v_reflection;

  if v_content_type = 'reflection' then
    insert into public.user_lesson_progress as existing (
      enrollment_id, course_id, lesson_id, is_completed, completed_at
    ) values (
      v_enrollment_id, v_course_id, p_lesson_id, true, now()
    )
    on conflict (enrollment_id, lesson_id) do update set
      is_completed = true,
      completed_at = coalesce(existing.completed_at, now()),
      updated_at = now();

    perform public.refresh_course_progress(v_enrollment_id);
  end if;

  return query select v_reflection.id, v_reflection.lesson_id,
    v_reflection.response, v_reflection.updated_at;
end;
$function$;

revoke all on function public.save_lesson_reflection(uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_lesson_reflection(uuid, text)
  to authenticated;

commit;
