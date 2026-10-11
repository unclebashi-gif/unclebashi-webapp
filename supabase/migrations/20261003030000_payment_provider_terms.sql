-- Keep business pricing in UGX while recording the separate currency sent
-- to the payment provider (EUR for the current MTN sandbox integration).
begin;

alter table public.payments
  add column provider_amount bigint,
  add column provider_currency text;

update public.payments
set provider_amount = amount,
    provider_currency = currency;

create function public.initialize_payment_provider_terms()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.provider_amount := coalesce(new.provider_amount, new.amount);
  new.provider_currency := coalesce(new.provider_currency, new.currency);
  return new;
end;
$function$;

create trigger payments_initialize_provider_terms
before insert on public.payments
for each row execute function public.initialize_payment_provider_terms();

alter table public.payments
  alter column provider_amount set not null,
  alter column provider_currency set not null,
  add constraint payments_provider_amount_positive check (provider_amount > 0),
  add constraint payments_provider_currency_format check (provider_currency ~ '^[A-Z]{3}$');

comment on column public.payments.provider_amount is
  'Server-controlled amount submitted to and verified from the provider; not a price authority.';
comment on column public.payments.provider_currency is
  'Server-controlled provider transport currency; distinct from the business course currency.';

revoke all on function public.initialize_payment_provider_terms() from public, anon, authenticated;

create function public.set_course_payment_provider_terms(
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
    raise exception 'Unsupported provider currency.' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments as payment_row
  where payment_row.id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if p_provider_amount is distinct from v_payment.amount then
    raise exception 'Provider amount must match the stored business amount.' using errcode = '22023';
  end if;
  if v_payment.status <> 'created' then
    return v_payment.provider_amount = p_provider_amount
      and v_payment.provider_currency = p_provider_currency;
  end if;

  update public.payments as payment_row
  set provider_amount = p_provider_amount,
      provider_currency = p_provider_currency,
      updated_at = now()
  where payment_row.id = p_payment_id;
  return true;
end;
$function$;

-- Recheck provider terms during finalization, rather than comparing sandbox
-- EUR against the business UGX course price.
create or replace function public.finalize_verified_course_payment(
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
  if p_amount is distinct from v_payment.provider_amount
     or p_currency is distinct from v_payment.provider_currency then
    raise exception 'Verified provider amount or currency does not match.' using errcode = '22023';
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

revoke all on function public.set_course_payment_provider_terms(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.set_course_payment_provider_terms(uuid, bigint, text)
  to service_role;

commit;
