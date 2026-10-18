begin;

-- Generalize the existing course payment ledger without changing business
-- prices, the open-attempt uniqueness boundary, or the existing MTN functions.
alter table public.payments drop constraint if exists payments_provider_check;
update public.payments set provider = 'mtn' where provider = 'mtn_momo';
alter table public.payments alter column provider set default 'mtn';
alter table public.payments add constraint payments_provider_check
  check (provider in ('mtn', 'pesapal'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('created', 'pending', 'successful', 'failed', 'cancelled', 'expired', 'reversed'));

alter table public.payments add column if not exists redirect_url text;
comment on column public.payments.provider_environment is
  'Server-derived environment for the payment provider; never client supplied.';
comment on column public.payments.redirect_url is
  'Server-validated hosted checkout URL for the payment provider; returned only to the owning learner or admins.';

-- Keep the existing MTN server flow provider-scoped after introducing a
-- second provider. This prevents a payment id or callback from crossing flows.
create or replace function public.begin_course_payment_request(p_payment_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  with claimed as (
    update public.payments as payment_row
    set status = 'pending', updated_at = now()
    where payment_row.id = p_payment_id and payment_row.provider = 'mtn'
      and payment_row.status = 'created'
    returning payment_row.id
  )
  select exists(select 1 from claimed);
$function$;

create or replace function public.set_course_payment_provider_terms(
  p_payment_id uuid,
  p_provider_amount bigint,
  p_provider_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payments%rowtype;
begin
  if p_provider_currency is null or p_provider_currency not in ('EUR', 'UGX') then
    raise exception 'Unsupported MTN provider currency.' using errcode = '22023';
  end if;
  select * into v_payment from public.payments as payment_row
  where payment_row.id = p_payment_id for update;
  if not found then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
  if v_payment.provider <> 'mtn' then
    raise exception 'Payment belongs to another provider.' using errcode = '22023';
  end if;
  if p_provider_amount is distinct from v_payment.amount then
    raise exception 'Provider amount must match the stored business amount.' using errcode = '22023';
  end if;
  if v_payment.status <> 'created' then
    return v_payment.provider_amount = p_provider_amount
      and v_payment.provider_currency = p_provider_currency;
  end if;
  update public.payments set provider_amount = p_provider_amount,
    provider_currency = p_provider_currency, updated_at = now()
  where id = p_payment_id;
  return true;
end;
$function$;

create or replace function public.fail_course_payment_request(
  p_payment_id uuid,
  p_provider_reference uuid,
  p_safe_failure_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_safe_failure_reason is null or length(p_safe_failure_reason) > 300 then
    raise exception 'A sanitized failure reason is required.' using errcode = '22023';
  end if;
  update public.payments set status = 'failed', provider_status = 'REQUEST_REJECTED',
    failure_reason = p_safe_failure_reason, verified_at = now(), updated_at = now()
  where id = p_payment_id and provider = 'mtn'
    and provider_reference = p_provider_reference and status = 'pending';
  return found;
end;
$function$;

drop function public.get_course_payment_verification_context(uuid, uuid, text);
create function public.get_course_payment_verification_context(
  p_payment_id uuid default null,
  p_provider_reference uuid default null,
  p_external_reference text default null
)
returns table (
  payment_id uuid, user_id uuid, course_id uuid, provider_reference uuid,
  external_reference text, amount bigint, currency text, status text,
  payer_msisdn_masked text, access_granted_at timestamptz, provider text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.num_nonnulls(p_payment_id, p_provider_reference, p_external_reference) <> 1 then
    raise exception 'Supply exactly one payment lookup reference.' using errcode = '22023';
  end if;
  return query select payment_row.id, payment_row.user_id, payment_row.course_id,
    payment_row.provider_reference, payment_row.external_reference, payment_row.amount,
    payment_row.currency, payment_row.status, payment_row.payer_msisdn_masked,
    payment_row.access_granted_at, payment_row.provider::text
  from public.payments as payment_row
  where payment_row.provider = 'mtn'
    and ((p_payment_id is not null and payment_row.id = p_payment_id)
      or (p_provider_reference is not null and payment_row.provider_reference = p_provider_reference)
      or (p_external_reference is not null and payment_row.external_reference = p_external_reference));
end;
$function$;
revoke all on function public.get_course_payment_verification_context(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_course_payment_verification_context(uuid, uuid, text)
  to service_role;

-- A single learner/course attempt remains open at a time across providers.
-- The RPC below may retire only an unsubmitted MTN created row; a pending
-- MTN request must be reconciled before a second provider can be started.

create function public.create_pesapal_course_payment_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_idempotency_key uuid,
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
  provider_environment text,
  provider_amount bigint,
  provider_currency text,
  redirect_url text,
  was_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_user_id is null or p_course_id is null or p_idempotency_key is null
     or p_provider_environment is null
     or p_provider_environment not in ('sandbox', 'production') then
    raise exception 'Invalid course payment request.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  select * into v_course from public.courses as course_row
  where course_row.id = p_course_id for share;
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
  select * into v_payment from public.payments as payment_row
  where payment_row.user_id = p_user_id and payment_row.idempotency_key = p_idempotency_key;
  if found then
    if v_payment.course_id <> p_course_id or v_payment.provider <> 'pesapal' then
      raise exception 'This idempotency key was already used for another payment.' using errcode = '22023';
    end if;
    return query select v_payment.id, v_payment.user_id, v_payment.course_id,
      v_payment.provider_reference, v_payment.external_reference, v_payment.amount,
      v_payment.currency, v_payment.status, v_payment.provider_environment,
      v_payment.provider_amount, v_payment.provider_currency, v_payment.redirect_url, true;
    return;
  end if;

  if exists (
    select 1 from public.course_enrollments as enrollment_row
    where enrollment_row.user_id = p_user_id and enrollment_row.course_id = p_course_id
      and enrollment_row.status = 'active'
  ) then
    raise exception 'You already have active access to this course.' using errcode = '23505';
  end if;

  select * into v_payment from public.payments as payment_row
  where payment_row.user_id = p_user_id and payment_row.course_id = p_course_id
    and payment_row.status in ('created', 'pending')
  order by payment_row.created_at desc, payment_row.id desc limit 1
  for update;
  if found then
    if v_payment.provider = 'pesapal' then
      return query select v_payment.id, v_payment.user_id, v_payment.course_id,
        v_payment.provider_reference, v_payment.external_reference, v_payment.amount,
        v_payment.currency, v_payment.status, v_payment.provider_environment,
        v_payment.provider_amount, v_payment.provider_currency, v_payment.redirect_url, true;
      return;
    elsif v_payment.provider = 'mtn' and v_payment.status = 'created' then
      update public.payments set status = 'cancelled', provider_status = 'SUPERSEDED_BY_PESAPAL',
        failure_reason = 'Unsubmitted MTN attempt was replaced by a Pesapal checkout.',
        verified_at = now(), updated_at = now()
      where id = v_payment.id;
    else
      raise exception 'An MTN payment request is already pending. Check its status before starting another provider.'
        using errcode = '55000';
    end if;
  end if;

  insert into public.payments (
    user_id, course_id, provider, idempotency_key, amount, currency,
    provider_amount, provider_currency, provider_environment
  ) values (
    p_user_id, p_course_id, 'pesapal', p_idempotency_key, v_course.price_amount,
    v_course.currency, v_course.price_amount, v_course.currency, p_provider_environment
  ) returning * into v_payment;

  return query select v_payment.id, v_payment.user_id, v_payment.course_id,
    v_payment.provider_reference, v_payment.external_reference, v_payment.amount,
    v_payment.currency, v_payment.status, v_payment.provider_environment,
    v_payment.provider_amount, v_payment.provider_currency, v_payment.redirect_url, false;
end;
$function$;

create function public.begin_pesapal_course_payment_request(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.payments set status = 'pending', provider_status = 'SUBMITTING',
    updated_at = now()
  where id = p_payment_id and provider = 'pesapal' and status = 'created';
  return found;
end;
$function$;

create function public.reset_pesapal_course_payment_request(
  p_payment_id uuid,
  p_safe_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_safe_reason is null or length(p_safe_reason) > 300 then
    raise exception 'A safe retry reason is required.' using errcode = '22023';
  end if;
  update public.payments set status = 'created', provider_status = 'SUBMISSION_REJECTED',
    failure_reason = p_safe_reason, updated_at = now()
  where id = p_payment_id and provider = 'pesapal' and status = 'pending'
    and provider_status = 'SUBMITTING' and redirect_url is null;
  return found;
end;
$function$;

create function public.set_pesapal_course_payment_order(
  p_payment_id uuid,
  p_external_reference text,
  p_order_tracking_id uuid,
  p_redirect_url text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_order_tracking_id is null or p_external_reference is null
     or (p_redirect_url is not null and
       (length(p_redirect_url) > 2048 or p_redirect_url !~ '^https://[^[:space:]]+$')) then
    raise exception 'Invalid Pesapal order response.' using errcode = '22023';
  end if;
  update public.payments set provider_reference = p_order_tracking_id,
    external_reference = p_external_reference,
    redirect_url = coalesce(p_redirect_url, redirect_url),
    provider_status = 'SUBMITTED', failure_reason = null, updated_at = now()
  where id = p_payment_id and provider = 'pesapal'
    and external_reference = p_external_reference and status in ('pending', 'created')
    and (provider_status = 'SUBMITTING' or provider_reference = p_order_tracking_id);
  return found;
end;
$function$;

create function public.get_pesapal_payment_context(
  p_payment_id uuid default null,
  p_external_reference text default null
)
returns table (
  payment_id uuid, user_id uuid, course_id uuid, provider_reference uuid,
  external_reference text, amount bigint, currency text, status text,
  provider_environment text, provider_amount bigint, provider_currency text,
  provider_status text, redirect_url text, access_granted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.num_nonnulls(p_payment_id, p_external_reference) <> 1 then
    raise exception 'Supply exactly one payment lookup reference.' using errcode = '22023';
  end if;
  return query select payment_row.id, payment_row.user_id, payment_row.course_id,
    payment_row.provider_reference, payment_row.external_reference, payment_row.amount,
    payment_row.currency, payment_row.status, payment_row.provider_environment,
    payment_row.provider_amount, payment_row.provider_currency,
    payment_row.provider_status, payment_row.redirect_url, payment_row.access_granted_at
  from public.payments as payment_row
  where payment_row.provider = 'pesapal'
    and ((p_payment_id is not null and payment_row.id = p_payment_id)
      or (p_external_reference is not null and payment_row.external_reference = p_external_reference));
end;
$function$;

create function public.finalize_pesapal_course_payment(
  p_payment_id uuid,
  p_order_tracking_id uuid,
  p_external_reference text,
  p_provider_status text,
  p_amount bigint,
  p_currency text,
  p_provider_environment text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payments%rowtype;
  v_finalizer_status text;
  v_finalized boolean;
begin
  if p_provider_status is null
     or p_provider_status not in ('COMPLETED', 'FAILED', 'INVALID', 'REVERSED') then
    raise exception 'Unsupported Pesapal status.' using errcode = '22023';
  end if;
  select * into v_payment from public.payments as payment_row
  where payment_row.id = p_payment_id for update;
  if not found then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
  if v_payment.provider <> 'pesapal'
     or v_payment.provider_reference is distinct from p_order_tracking_id
     or v_payment.external_reference is distinct from p_external_reference
     or v_payment.provider_environment is distinct from p_provider_environment then
    raise exception 'Pesapal payment references or environment do not match.' using errcode = '22023';
  end if;
  if p_amount is distinct from v_payment.amount
     or p_amount is distinct from v_payment.provider_amount
     or p_currency is distinct from v_payment.currency
     or p_currency is distinct from v_payment.provider_currency then
    raise exception 'Verified Pesapal amount or currency does not match.' using errcode = '22023';
  end if;

  -- Reversal is a terminal reconciliation state. Later status checks must not
  -- restore access or rewrite the financial outcome.
  if v_payment.status = 'reversed' then
    return true;
  end if;

  if p_provider_status = 'REVERSED' then
    if v_payment.status not in ('created', 'pending', 'successful') then
      return false;
    end if;
    update public.payments set status = 'reversed', provider_status = 'REVERSED',
      failure_reason = case when access_granted_at is null
        then 'Pesapal reported a reversal; no course access was granted.'
        else 'Pesapal reported a reversal after access was granted; admin reconciliation is required.' end,
      verified_at = coalesce(verified_at, now()), updated_at = now()
    where id = v_payment.id;
    return true;
  end if;

  -- Keep existing terminal failures and successful payments stable against a
  -- stale or contradictory provider result. In particular, never downgrade a
  -- prior success to failed/invalid.
  if v_payment.status = 'successful' then
    return true;
  end if;
  if v_payment.status not in ('created', 'pending') then
    if v_payment.status = 'failed' and v_payment.provider_status = p_provider_status then
      return true;
    end if;
    return false;
  end if;

  -- The generic payment finalizer owns the atomic enrollment grant. Translate
  -- Pesapal's COMPLETED/INVALID vocabulary to its established statuses, then
  -- restore the exact Pesapal status for admin/provider diagnostics.
  v_finalizer_status := case p_provider_status
    when 'COMPLETED' then 'SUCCESSFUL'
    when 'INVALID' then 'FAILED'
    else p_provider_status
  end;
  v_finalized := public.finalize_verified_course_payment(
    p_payment_id, p_order_tracking_id, v_finalizer_status, p_amount, p_currency
  );

  if v_finalized then
    update public.payments as payment_row
    set provider_status = p_provider_status, updated_at = now()
    where payment_row.id = p_payment_id
      and payment_row.provider = 'pesapal'
      and payment_row.status = case when p_provider_status = 'COMPLETED' then 'successful'
        when p_provider_status = 'INVALID' then 'failed'
        else lower(p_provider_status) end;
  end if;
  return v_finalized;
end;
$function$;

-- User-owned recovery projection: provider and redirect are safe only for the
-- authenticated owner; provider credentials and verification payloads remain private.
drop function if exists public.get_my_course_payments(uuid);
create function public.get_my_course_payments(p_course_id uuid default null)
returns table (
  payment_id uuid, course_id uuid, course_title text, amount bigint, currency text,
  status text, created_at timestamptz, verified_at timestamptz,
  access_granted boolean, provider text, redirect_url text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  return query select payment_row.id, payment_row.course_id, course_row.title::text,
    payment_row.amount, payment_row.currency::text, payment_row.status::text,
    payment_row.created_at, payment_row.verified_at,
    payment_row.access_granted_at is not null, payment_row.provider::text,
    payment_row.redirect_url
  from public.payments as payment_row
  join public.courses as course_row on course_row.id = payment_row.course_id
  where payment_row.user_id = v_user_id
    and (p_course_id is null or payment_row.course_id = p_course_id)
  order by payment_row.created_at desc, payment_row.id desc;
end;
$function$;

revoke all on function public.create_pesapal_course_payment_attempt(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_pesapal_course_payment_attempt(uuid, uuid, uuid, text) to service_role;
revoke all on function public.begin_pesapal_course_payment_request(uuid) from public, anon, authenticated;
grant execute on function public.begin_pesapal_course_payment_request(uuid) to service_role;
revoke all on function public.reset_pesapal_course_payment_request(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_pesapal_course_payment_request(uuid, text) to service_role;
revoke all on function public.set_pesapal_course_payment_order(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_pesapal_course_payment_order(uuid, text, uuid, text) to service_role;
revoke all on function public.get_pesapal_payment_context(uuid, text) from public, anon, authenticated;
grant execute on function public.get_pesapal_payment_context(uuid, text) to service_role;
revoke all on function public.finalize_pesapal_course_payment(uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.finalize_pesapal_course_payment(uuid, uuid, text, text, bigint, text, text) to service_role;
revoke all on function public.get_my_course_payments(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_my_course_payments(uuid) to authenticated;

commit;
