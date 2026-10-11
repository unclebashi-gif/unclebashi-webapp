-- Server-authoritative Uganda MTN MoMo course payments.
-- Payment state and purchase enrollment grants are written only by trusted
-- server functions; browser roles receive safe read projections only.
begin;

alter table public.courses
  add column price_amount bigint,
  add column currency text;

comment on column public.courses.price_amount is
  'Server-authoritative UGX whole-unit course price; null/zero for free courses.';
comment on column public.courses.currency is
  'ISO 4217 currency code for paid-course checkout; Uganda launch supports UGX.';

alter table public.courses
  add constraint courses_launch_price_check check (
    (
      is_free
      and coalesce(price_amount, 0) = 0
      and (currency is null or currency = 'UGX')
    )
    or
    (
      not is_free
      and (
        (status <> 'published' and price_amount is null and currency is null)
        or (price_amount > 0 and currency = 'UGX')
      )
    )
  );

-- The content-only CMS login may read course pricing/free status, but must
-- not insert or change those fields.
revoke select, insert, update on table public.courses from unclebashi_cms;
grant select (
  id, slug, title, description, category, thumbnail_url, status,
  display_order, created_at, updated_at, is_free, price_amount, currency
) on table public.courses to unclebashi_cms;
grant insert (
  slug, title, description, category, thumbnail_url, status, display_order
) on table public.courses to unclebashi_cms;
grant update (
  slug, title, description, category, thumbnail_url, status, display_order
) on table public.courses to unclebashi_cms;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  provider text not null default 'mtn_momo'
    check (provider = 'mtn_momo'),
  provider_reference uuid not null default gen_random_uuid(),
  external_reference text not null default gen_random_uuid()::text,
  idempotency_key uuid not null,
  amount bigint not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency = 'UGX'),
  payer_msisdn_masked text,
  status text not null default 'created'
    check (status in ('created', 'pending', 'successful', 'failed', 'cancelled', 'expired')),
  provider_status text,
  failure_reason text,
  access_granted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_reference_key unique (provider_reference),
  constraint payments_external_reference_key unique (external_reference),
  constraint payments_user_idempotency_key unique (user_id, idempotency_key),
  constraint payments_failure_reason_length check (
    failure_reason is null or length(failure_reason) <= 500
  )
);

create unique index payments_one_open_course_attempt_idx
  on public.payments (user_id, course_id)
  where status in ('created', 'pending');
create index payments_user_created_idx
  on public.payments (user_id, created_at desc, id desc);
create index payments_status_created_idx
  on public.payments (status, created_at desc, id desc);
create index payments_course_created_idx
  on public.payments (course_id, created_at desc);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
revoke all on table public.payments from public, anon, authenticated, service_role, unclebashi_cms;

-- A verified server request creates attempts from the current course price.
-- p_user_id is accepted only from the trusted Edge Function after it verifies
-- the caller's Supabase JWT; this function is never executable by browser roles.
create function public.create_course_payment_attempt(
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
  if v_course.is_free then
    raise exception 'Free courses must use free enrollment.' using errcode = '22023';
  end if;
  if v_course.price_amount is null or v_course.price_amount <= 0
     or v_course.currency <> 'UGX' then
    raise exception 'Course pricing is not configured for Uganda checkout.' using errcode = '22023';
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

-- Atomically claim the sole provider request for an attempt.
create function public.begin_course_payment_request(p_payment_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  with claimed as (
    update public.payments as payment_row
    set status = 'pending', updated_at = now()
    where payment_row.id = p_payment_id and payment_row.status = 'created'
    returning payment_row.id
  )
  select exists(select 1 from claimed);
$function$;

create function public.get_course_payment_verification_context(
  p_payment_id uuid default null,
  p_provider_reference uuid default null,
  p_external_reference text default null
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
  payer_msisdn_masked text,
  access_granted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.num_nonnulls(p_payment_id, p_provider_reference, p_external_reference) <> 1 then
    raise exception 'Supply exactly one payment lookup reference.' using errcode = '22023';
  end if;
  return query
    select row_payment.id, row_payment.user_id, row_payment.course_id,
      row_payment.provider_reference, row_payment.external_reference,
      row_payment.amount, row_payment.currency, row_payment.status,
      row_payment.payer_msisdn_masked, row_payment.access_granted_at
    from public.payments as row_payment
    where (p_payment_id is not null and row_payment.id = p_payment_id)
       or (p_provider_reference is not null and row_payment.provider_reference = p_provider_reference)
       or (p_external_reference is not null and row_payment.external_reference = p_external_reference);
end;
$function$;

-- This also finalizes verified negative provider outcomes. Unknown or stale
-- statuses cannot mutate state, and a successful state is terminal.
create function public.finalize_verified_course_payment(
  p_payment_id uuid,
  p_provider_reference uuid,
  p_provider_status text,
  p_amount bigint,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payments%rowtype;
  v_new_status text;
  v_safe_reason text;
begin
  if p_provider_status not in ('SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED', 'PENDING') then
    raise exception 'Unsupported verified provider status.' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments as payment_row
  where payment_row.id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if v_payment.provider_reference <> p_provider_reference then
    raise exception 'Provider reference does not match the payment.' using errcode = '22023';
  end if;
  if p_amount is distinct from v_payment.amount
     or p_currency is distinct from v_payment.currency then
    raise exception 'Verified payment amount or currency does not match.' using errcode = '22023';
  end if;

  if v_payment.status = 'successful' then
    return true;
  end if;
  if v_payment.status not in ('created', 'pending') then
    return false;
  end if;

  if p_provider_status = 'SUCCESSFUL' then
    insert into public.course_enrollments as existing (
      user_id, course_id, status, access_source, enrolled_at, revoked_at
    ) values (
      v_payment.user_id, v_payment.course_id, 'active', 'purchase', now(), null
    )
    on conflict (user_id, course_id) do update set
      status = 'active',
      access_source = 'purchase',
      enrolled_at = now(),
      revoked_at = null,
      updated_at = now()
    where existing.status = 'revoked';

    update public.payments as payment_row
      set status = 'successful',
          provider_status = p_provider_status,
          failure_reason = null,
          verified_at = coalesce(payment_row.verified_at, now()),
          access_granted_at = coalesce(payment_row.access_granted_at, now()),
          updated_at = now()
      where payment_row.id = v_payment.id;
    return true;
  elsif p_provider_status in ('FAILED', 'CANCELLED', 'EXPIRED') then
    v_new_status := lower(p_provider_status);
    v_safe_reason := case p_provider_status
      when 'FAILED' then 'Payment was not completed.'
      when 'CANCELLED' then 'Payment was cancelled.'
      else 'Payment request expired.'
    end;
    update public.payments as payment_row
      set status = v_new_status,
          provider_status = p_provider_status,
          failure_reason = v_safe_reason,
          verified_at = coalesce(payment_row.verified_at, now()),
          updated_at = now()
      where payment_row.id = v_payment.id;
    return true;
  else
    update public.payments as payment_row
      set provider_status = p_provider_status,
          updated_at = now()
      where payment_row.id = v_payment.id;
    return true;
  end if;
end;
$function$;

-- Used only for definitive RequestToPay rejection. Ambiguous network/provider
-- failures remain pending and must be checked against MTN before transitioning.
create function public.fail_course_payment_request(
  p_payment_id uuid,
  p_provider_reference uuid,
  p_safe_failure_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  if p_safe_failure_reason is null or length(p_safe_failure_reason) > 300 then
    raise exception 'A sanitized failure reason is required.' using errcode = '22023';
  end if;
  update public.payments as payment_row
    set status = 'failed',
        provider_status = 'REQUEST_REJECTED',
        failure_reason = p_safe_failure_reason,
        verified_at = now(),
        updated_at = now()
    where payment_row.id = p_payment_id
      and payment_row.provider_reference = p_provider_reference
      and payment_row.status = 'pending'
    returning payment_row.status into v_status;
  return found;
end;
$function$;

create function public.get_my_course_payments(p_course_id uuid default null)
returns table (
  payment_id uuid,
  course_id uuid,
  course_title text,
  amount bigint,
  currency text,
  status text,
  created_at timestamptz,
  verified_at timestamptz,
  access_granted boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  return query
    select payment_row.id, payment_row.course_id, course_row.title,
      payment_row.amount, payment_row.currency, payment_row.status,
      payment_row.created_at, payment_row.verified_at,
      payment_row.access_granted_at is not null
    from public.payments as payment_row
    join public.courses as course_row on course_row.id = payment_row.course_id
    where payment_row.user_id = v_user_id
      and (p_course_id is null or payment_row.course_id = p_course_id)
    order by payment_row.created_at desc, payment_row.id desc;
end;
$function$;

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
  failure_reason text
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
      coalesce(nullif(btrim(profile_row.full_name), ''), 'User'),
      auth_row.email, payment_row.course_id, course_row.title,
      payment_row.amount, payment_row.currency, payment_row.provider,
      payment_row.payer_msisdn_masked, payment_row.status,
      payment_row.provider_reference, payment_row.verified_at,
      payment_row.access_granted_at, payment_row.failure_reason
    from public.payments as payment_row
    join public.courses as course_row on course_row.id = payment_row.course_id
    left join public.users as profile_row on profile_row.id = payment_row.user_id
    left join auth.users as auth_row on auth_row.id = payment_row.user_id
    where p_before is null or payment_row.created_at < p_before
    order by payment_row.created_at desc, payment_row.id desc
    limit p_limit;
end;
$function$;

-- Internal functions are executable only by the Edge Function service role.
revoke all on function public.create_course_payment_attempt(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_course_payment_attempt(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.begin_course_payment_request(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_course_payment_request(uuid) to service_role;
revoke all on function public.get_course_payment_verification_context(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_course_payment_verification_context(uuid, uuid, text)
  to service_role;
revoke all on function public.finalize_verified_course_payment(uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.finalize_verified_course_payment(uuid, uuid, text, bigint, text)
  to service_role;
revoke all on function public.fail_course_payment_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_course_payment_request(uuid, uuid, text)
  to service_role;

revoke all on function public.get_my_course_payments(uuid) from public, anon, authenticated;
grant execute on function public.get_my_course_payments(uuid) to authenticated;
revoke all on function public.get_admin_payments(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_admin_payments(integer, timestamptz) to authenticated;

-- Fail closed if the CMS role inherited any path to change course pricing/free status.
do $check_cms_pricing_privileges$
begin
  if pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'price_amount', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'price_amount', 'UPDATE')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'currency', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'currency', 'UPDATE')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'is_free', 'INSERT')
     or pg_catalog.has_column_privilege('unclebashi_cms', 'public.courses', 'is_free', 'UPDATE') then
    raise exception 'unclebashi_cms must not change course pricing/free status';
  end if;
end;
$check_cms_pricing_privileges$;

commit;
