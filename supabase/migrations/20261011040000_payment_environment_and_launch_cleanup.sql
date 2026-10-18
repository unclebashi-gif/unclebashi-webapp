begin;

-- All existing attempts were created while the integration was sandbox-locked.
alter table public.payments add column provider_environment text;
update public.payments set provider_environment = 'sandbox' where provider_environment is null;
alter table public.payments
  alter column provider_environment set not null,
  add constraint payments_provider_environment_check
    check (provider_environment in ('sandbox', 'production'));

comment on column public.payments.provider_environment is
  'Server-derived MTN environment used for this transaction; never client supplied.';

revoke insert (provider_environment), update (provider_environment)
  on table public.payments from public, anon, authenticated, unclebashi_cms;

-- Replace the deployed signature so new attempts require the environment
-- chosen by trusted server configuration. Existing/idempotent rows keep their
-- original stored provider_environment.
drop function public.create_course_payment_attempt(uuid, uuid, uuid, text);

create function public.create_course_payment_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_idempotency_key uuid,
  p_payer_msisdn_masked text,
  p_provider_environment text
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
  if p_provider_environment is null
     or p_provider_environment not in ('sandbox', 'production') then
    raise exception 'Invalid payment environment.' using errcode = '22023';
  end if;
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
    select 1 from public.users as profile_row
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
    user_id, course_id, idempotency_key, amount, currency,
    payer_msisdn_masked, provider_environment
  ) values (
    p_user_id, p_course_id, p_idempotency_key, v_course.price_amount,
    v_course.currency, p_payer_msisdn_masked, p_provider_environment
  ) returning * into v_payment;
  v_inserted := true;

  return query select v_payment.id, v_payment.user_id, v_payment.course_id,
    v_payment.provider_reference, v_payment.external_reference,
    v_payment.amount, v_payment.currency, v_payment.status, not v_inserted;
end;
$function$;

revoke all on function public.create_course_payment_attempt(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_course_payment_attempt(uuid, uuid, uuid, text, text)
  to service_role;

-- Preserve historic payment records while keeping known sandbox-only test
-- courses out of learner catalogs ahead of launch.
update public.courses
set status = 'draft'
where slug in (
  'sandbox-mtn-payment-test',
  'sandbox-mtn-failure-test',
  'sandbox-mtn-idempotency-test'
) and status <> 'draft';

create or replace function public.get_admin_overview()
returns table (
  total_users bigint,
  onboarded_users bigint,
  published_courses bigint,
  active_enrollments bigint,
  pending_community_reports bigint,
  pending_matchmaking_reviews bigint,
  listed_coaches bigint,
  pending_coaching_bookings bigint,
  successful_payments bigint,
  failed_payments bigint,
  verified_payment_volume_ugx bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query select
    (select count(*) from auth.users)::bigint,
    (select count(*) from public.users as profile where profile.onboarding_completed)::bigint,
    (select count(*) from public.courses as course where course.status = 'published')::bigint,
    (select count(*) from public.course_enrollments as enrollment where enrollment.status = 'active')::bigint,
    (select count(*) from public.community_reports as report where report.status = 'pending')::bigint,
    (select count(*) from public.matchmaking_profiles as profile where profile.status = 'pending_review')::bigint,
    (select count(*) from public.coaches as coach where coach.is_active and coach.is_listed)::bigint,
    (select count(*) from public.coaching_bookings as booking where booking.status = 'pending')::bigint,
    (select count(*) from public.payments as payment
      where payment.status = 'successful' and payment.provider_environment = 'production')::bigint,
    (select count(*) from public.payments as payment
      where payment.status = 'failed' and payment.provider_environment = 'production')::bigint,
    coalesce((select sum(payment.amount) from public.payments as payment
      where payment.status = 'successful'
        and payment.currency = 'UGX'
        and payment.provider_environment = 'production'), 0)::bigint;
end;
$function$;

revoke all on function public.get_admin_overview() from public, anon, authenticated;
grant execute on function public.get_admin_overview() to authenticated;

-- Return environment only to the protected admin payment projection.
drop function public.get_admin_payments(integer, timestamptz);
create function public.get_admin_payments(
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  payment_id uuid,
  created_at timestamptz,
  customer_name text,
  customer_email text,
  course_id uuid,
  course_title text,
  amount bigint,
  currency text,
  provider text,
  payer_msisdn_masked text,
  status text,
  provider_reference uuid,
  verified_at timestamptz,
  access_granted_at timestamptz,
  failure_reason text,
  provider_environment text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100.' using errcode = '22023';
  end if;
  return query
    select payment_row.id, payment_row.created_at,
      coalesce(nullif(btrim(profile_row.full_name), ''), 'User')::text,
      auth_row.email::text, payment_row.course_id, course_row.title::text,
      payment_row.amount, payment_row.currency::text, payment_row.provider::text,
      payment_row.payer_msisdn_masked, payment_row.status::text,
      payment_row.provider_reference, payment_row.verified_at,
      payment_row.access_granted_at, payment_row.failure_reason,
      payment_row.provider_environment::text
    from public.payments as payment_row
    join public.courses as course_row on course_row.id = payment_row.course_id
    left join public.users as profile_row on profile_row.id = payment_row.user_id
    left join auth.users as auth_row on auth_row.id = payment_row.user_id
    where p_before is null or payment_row.created_at < p_before
    order by payment_row.created_at desc, payment_row.id desc
    limit p_limit;
end;
$function$;

revoke all on function public.get_admin_payments(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_admin_payments(integer, timestamptz)
  to authenticated;

commit;
