-- Server-enforced Education audience targeting. Existing courses default to all.
begin;

alter table public.courses
  add column audience_gender text not null default 'all',
  add constraint courses_audience_gender_check
    check (audience_gender in ('all', 'female', 'male'));

comment on column public.courses.audience_gender is
  'Education audience targeting based only on public.users.gender.';

-- Caller-scoped helper used by catalog/content RLS. It never accepts a user ID
-- and returns only whether the current caller may view this course audience.
create function public.is_course_audience_eligible(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.courses as course_row
    where course_row.id = p_course_id
      and course_row.status = 'published'
      and (
        course_row.audience_gender = 'all'
        or exists (
          select 1
          from public.users as profile_row
          where profile_row.id = auth.uid()
            and profile_row.gender in ('male', 'female')
            and profile_row.gender = course_row.audience_gender
        )
      )
  );
$function$;

revoke all on function public.is_course_audience_eligible(uuid)
  from public, anon, authenticated;
grant execute on function public.is_course_audience_eligible(uuid)
  to authenticated;

-- Hide restricted courses from ineligible learners while preserving access
-- for learners who already have an active enrollment.
drop policy courses_read_published on public.courses;
create policy courses_read_published
on public.courses for select to authenticated
using (
  status = 'published'
  and (
    public.is_course_audience_eligible(id)
    or exists (
      select 1 from public.course_enrollments as enrollment_row
      where enrollment_row.course_id = id
        and enrollment_row.user_id = (select auth.uid())
        and enrollment_row.status = 'active'
    )
  )
);

drop policy course_modules_read_published on public.course_modules;
create policy course_modules_read_published
on public.course_modules for select to authenticated
using (exists (
  select 1
  from public.courses as course_row
  where course_row.id = course_id
    and course_row.status = 'published'
    and (
      public.is_course_audience_eligible(course_row.id)
      or exists (
        select 1 from public.course_enrollments as enrollment_row
        where enrollment_row.course_id = course_row.id
          and enrollment_row.user_id = (select auth.uid())
          and enrollment_row.status = 'active'
      )
    )
));

drop policy lessons_read_accessible_published on public.lessons;
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
        -- Existing active enrollment remains valid if audience targeting later
        -- changes. New free access still requires current eligibility.
        public.is_course_audience_eligible(course_row.id)
        or exists (
          select 1 from public.course_enrollments as enrollment_row
          where enrollment_row.course_id = course_row.id
            and enrollment_row.user_id = (select auth.uid())
            and enrollment_row.status = 'active'
        )
      )
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

create or replace function public.enroll_in_free_course(p_course_id uuid)
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
  if not public.is_course_audience_eligible(p_course_id) then
    raise exception 'EDUCATION_AUDIENCE_INELIGIBLE' using errcode = '42501';
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

-- Only the verified caller identity supplied by mtn-checkout may reach this
-- service_role-only function. It checks gender before reuse/creation so neither
-- browser payload changes nor a stale course card can create a new attempt.
create or replace function public.create_course_payment_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_idempotency_key uuid,
  p_payer_msisdn_masked text
)
returns table (
  payment_id uuid,
  user_id uuid,
  course_id uuid,
  provider_reference uuid,
  external_reference text,
  amount bigint,
  currency text,
  status text,
  was_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_payment public.payments%rowtype;
  v_inserted boolean := false;
begin
  if p_user_id is null or p_course_id is null or p_idempotency_key is null then
    raise exception 'User, course, and idempotency key are required.' using errcode = '22023';
  end if;
  if p_payer_msisdn_masked is null or length(p_payer_msisdn_masked) > 32 then
    raise exception 'A masked payer number is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  select * into v_course
  from public.courses as course_row
  where course_row.id = p_course_id
  for share;

  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course.status <> 'published' then
    raise exception 'Course is not available for purchase.' using errcode = '42501';
  end if;
  if v_course.audience_gender <> 'all' and not exists (
    select 1
    from public.users as profile_row
    where profile_row.id = p_user_id
      and profile_row.gender in ('male', 'female')
      and profile_row.gender = v_course.audience_gender
  ) then
    raise exception 'EDUCATION_AUDIENCE_INELIGIBLE' using errcode = '42501';
  end if;
  if v_course.is_free then
    raise exception 'Free courses must use free enrollment.' using errcode = '22023';
  end if;
  if v_course.price_amount is null or v_course.price_amount <= 0
     or v_course.currency <> 'UGX' then
    raise exception 'Course pricing is not configured for Uganda checkout.' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments as payment_row
  where payment_row.user_id = p_user_id
    and payment_row.idempotency_key = p_idempotency_key;
  if found then
    if v_payment.course_id <> p_course_id then
      raise exception 'This idempotency key was already used for another course.' using errcode = '22023';
    end if;
    return query select v_payment.id, v_payment.user_id, v_payment.course_id,
      v_payment.provider_reference, v_payment.external_reference,
      v_payment.amount, v_payment.currency, v_payment.status, true;
    return;
  end if;

  if exists (
    select 1 from public.course_enrollments as enrollment_row
    where enrollment_row.user_id = p_user_id
      and enrollment_row.course_id = p_course_id
      and enrollment_row.status = 'active'
  ) then
    raise exception 'You already have active access to this course.' using errcode = '23505';
  end if;

  select * into v_payment
  from public.payments as payment_row
  where payment_row.user_id = p_user_id
    and payment_row.course_id = p_course_id
    and payment_row.status in ('created', 'pending')
  order by payment_row.created_at desc
  limit 1;
  if found then
    return query select v_payment.id, v_payment.user_id, v_payment.course_id,
      v_payment.provider_reference, v_payment.external_reference,
      v_payment.amount, v_payment.currency, v_payment.status, true;
    return;
  end if;

  insert into public.payments (
    user_id, course_id, idempotency_key, amount, currency, payer_msisdn_masked
  ) values (
    p_user_id, p_course_id, p_idempotency_key, v_course.price_amount,
    v_course.currency, p_payer_msisdn_masked
  ) returning * into v_payment;
  v_inserted := true;

  return query select v_payment.id, v_payment.user_id, v_payment.course_id,
    v_payment.provider_reference, v_payment.external_reference,
    v_payment.amount, v_payment.currency, v_payment.status, not v_inserted;
end;
$function$;

revoke all on function public.create_course_payment_attempt(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_course_payment_attempt(uuid, uuid, uuid, text)
  to service_role;

-- A verified finalizer remains bound to this server-created payment row and
-- is intentionally not rechecked against mutable audience metadata after
-- RequestToPay. Its user/course/provider reference are immutable to browsers.

-- Content targeting is managed by CMS. Financial terms retain their existing
-- restrictions from the payment migration.
grant select (audience_gender) on table public.courses to unclebashi_cms;
grant insert (audience_gender) on table public.courses to unclebashi_cms;
grant update (audience_gender) on table public.courses to unclebashi_cms;

do $check_audience_and_pricing_privileges$
begin
  if not pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'audience_gender', 'SELECT')
     or not pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'audience_gender', 'INSERT')
     or not pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'audience_gender', 'UPDATE') then
    raise exception 'unclebashi_cms must be able to read and manage course audience targeting';
  end if;

  if pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'price_amount', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'price_amount', 'UPDATE')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'currency', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'currency', 'UPDATE')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'is_free', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'is_free', 'UPDATE') then
    raise exception 'unclebashi_cms must not change course pricing/free status';
  end if;
end;
$check_audience_and_pricing_privileges$;

commit;
