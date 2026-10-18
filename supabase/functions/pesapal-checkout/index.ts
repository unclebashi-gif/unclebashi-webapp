import {
  createServiceClient,
  getCaller,
  getCorsHeaders,
  getSupabaseConfig,
  isAdmin,
  isAllowedBrowserOrigin,
  jsonResponse,
} from '../_shared/mtn.ts';
import {
  getPesapalAccessToken,
  getPesapalConfig,
  getPesapalTransactionStatus,
  PesapalError,
  submitPesapalOrder,
} from '../_shared/pesapal.ts';

interface CheckoutBody {
  action?: unknown;
  course_id?: unknown;
  idempotency_key?: unknown;
  payment_id?: unknown;
  order_tracking_id?: unknown;
  order_merchant_reference?: unknown;
}

interface PaymentContext {
  payment_id: string;
  user_id: string;
  course_id: string;
  provider_reference: string;
  external_reference: string;
  amount: number | string;
  currency: string;
  status: string;
  provider_environment: string;
  provider_amount: number | string;
  provider_currency: string;
  provider_status: string | null;
  redirect_url: string | null;
  access_granted_at: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safePayment(context: PaymentContext) {
  return {
    payment_id: context.payment_id,
    course_id: context.course_id,
    amount: Number(context.amount),
    currency: context.currency,
    status: context.status,
    access_granted: Boolean(context.access_granted_at),
    redirect_url: context.redirect_url,
  };
}

async function loadContext(
  service: ReturnType<typeof createServiceClient>,
  paymentId?: string,
  externalReference?: string,
): Promise<PaymentContext> {
  const { data, error } = await service.rpc('get_pesapal_payment_context', {
    p_payment_id: paymentId ?? null,
    p_external_reference: externalReference ?? null,
  });
  const context = (data as PaymentContext[] | null)?.[0];
  if (error || !context) throw new PesapalError('PESAPAL_PAYMENT_NOT_FOUND');
  return context;
}

async function verifiedStatus(
  service: ReturnType<typeof createServiceClient>,
  context: PaymentContext,
  trackingId?: string,
): Promise<ReturnType<typeof safePayment>> {
  const actualTrackingId = trackingId ?? context.provider_reference;
  if (!UUID_PATTERN.test(actualTrackingId)) throw new PesapalError('PESAPAL_TRACKING_ID_INVALID');

  if (context.provider_status === 'SUBMITTING' && !trackingId) return safePayment(context);
  const trackingNotPersisted = Boolean(trackingId && trackingId !== context.provider_reference);
  if (trackingNotPersisted && context.provider_status !== 'SUBMITTING') {
    throw new PesapalError('PESAPAL_TRACKING_ID_MISMATCH');
  }

  // A locally-created row has not reached Pesapal. Its generated reference is
  // not an orderTrackingId; only a user-initiated checkout may submit it.
  if (context.status === 'created'
      || (context.status === 'pending' && !['SUBMITTED', 'PENDING', 'COMPLETED', 'REVERSED'].includes(context.provider_status ?? ''))) {
    return safePayment(context);
  }

  const config = getPesapalConfig(context.provider_environment);
  const token = await getPesapalAccessToken(config);
  const provider = await getPesapalTransactionStatus(config, token, actualTrackingId);
  if (provider.orderTrackingId !== actualTrackingId
      || provider.merchantReference !== context.external_reference
      || !Number.isSafeInteger(Number(context.provider_amount))
      || provider.amount !== Number(context.provider_amount)
      || provider.currency !== context.provider_currency
      || context.currency !== context.provider_currency
      || Number(context.amount) !== Number(context.provider_amount)) {
    throw new PesapalError('PESAPAL_VERIFIED_TERMS_MISMATCH');
  }

  if (trackingNotPersisted) {
    const { error, data } = await service.rpc('set_pesapal_course_payment_order', {
      p_payment_id: context.payment_id,
      p_external_reference: context.external_reference,
      p_order_tracking_id: actualTrackingId,
      p_redirect_url: null,
    });
    if (error || data !== true) throw new PesapalError('PESAPAL_ORDER_REFERENCE_SAVE_FAILED');
  }

  const { error } = await service.rpc('finalize_pesapal_course_payment', {
    p_payment_id: context.payment_id,
    p_order_tracking_id: actualTrackingId,
    p_external_reference: context.external_reference,
    p_provider_status: provider.status,
    p_amount: provider.amount,
    p_currency: provider.currency,
    p_provider_environment: context.provider_environment,
  });
  if (error) throw new PesapalError('PESAPAL_FINALIZATION_FAILED');
  return safePayment(await loadContext(service, context.payment_id));
}

function firstLastName(value: unknown): { firstName: string; lastName: string } {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  const [firstName = 'Learner', ...remaining] = name.split(' ');
  return { firstName: firstName.slice(0, 50), lastName: remaining.join(' ').slice(0, 50) || 'Uncle Bashi' };
}

Deno.serve(async (request: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(request);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedBrowserOrigin(origin)) return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  try {
    getSupabaseConfig();
    const caller = await getCaller(request);
    const raw = await request.text();
    if (raw.length > 8192) return respond({ error: 'Request is too large.' }, 413);
    const body = JSON.parse(raw) as CheckoutBody;
    const service = createServiceClient();

    if (body.action === 'status') {
      const hasPaymentId = typeof body.payment_id === 'string' && UUID_PATTERN.test(body.payment_id);
      const hasReference = typeof body.order_merchant_reference === 'string'
        && UUID_PATTERN.test(body.order_merchant_reference);
      if (!hasPaymentId && !hasReference) return respond({ error: 'A payment reference is required.' }, 400);
      const context = await loadContext(service, hasPaymentId ? body.payment_id as string : undefined,
        hasReference ? body.order_merchant_reference as string : undefined);
      if (context.user_id !== caller.id && !(await isAdmin(service, caller.id))) {
        return respond({ error: 'Payment not found.' }, 404);
      }
      const trackingId = typeof body.order_tracking_id === 'string' ? body.order_tracking_id : undefined;
      return respond(await verifiedStatus(service, context, trackingId));
    }

    if (body.action !== undefined) return respond({ error: 'Unsupported checkout action.' }, 400);
    if (typeof body.course_id !== 'string' || !UUID_PATTERN.test(body.course_id)
        || typeof body.idempotency_key !== 'string' || !UUID_PATTERN.test(body.idempotency_key)) {
      return respond({ error: 'Course and idempotency key are required.' }, 400);
    }

    const config = getPesapalConfig();
    const { data: authData, error: authError } = await caller.client.auth.getUser();
    if (authError || !authData.user?.email) throw new PesapalError('PESAPAL_BILLING_EMAIL_REQUIRED');

    const { data, error } = await service.rpc('create_pesapal_course_payment_attempt', {
      p_user_id: caller.id,
      p_course_id: body.course_id,
      p_idempotency_key: body.idempotency_key,
      p_provider_environment: config.environment,
    });
    if (error) {
      if (error.message.includes('EDUCATION_AUDIENCE_INELIGIBLE')) {
        return respond({ error: 'This course is available to a specific audience. Please review your profile details.', code: 'COURSE_AUDIENCE_INELIGIBLE' }, 403);
      }
      if (error.message.includes('MTN payment request is already pending')) {
        return respond({ error: 'An earlier MTN payment is still being verified. Check its status before starting Pesapal checkout.' }, 409);
      }
      return respond({ error: 'Course checkout could not be created. Check course access and pricing.' }, 400);
    }
    let context = (data as PaymentContext[] | null)?.[0];
    if (!context) throw new PesapalError('PESAPAL_PAYMENT_CREATE_FAILED');
    if (context.provider_environment !== config.environment) {
      throw new PesapalError('PESAPAL_PAYMENT_ENVIRONMENT_MISMATCH');
    }
    if (context.status === 'successful' || context.status === 'reversed'
        || ['failed', 'cancelled', 'expired'].includes(context.status)) return respond(safePayment(context));
    if (context.status === 'pending' && context.redirect_url) return respond(safePayment(context));
    if (context.status === 'pending' && context.provider_status === 'SUBMITTING') {
      return respond({ ...safePayment(context), message: 'Payment submission is being reconciled. Check status shortly.' });
    }
    if (context.status !== 'created') return respond(safePayment(context));

    if (!Number.isSafeInteger(Number(context.provider_amount)) || Number(context.provider_amount) <= 0
        || context.provider_currency !== 'UGX' || context.currency !== 'UGX'
        || Number(context.provider_amount) !== Number(context.amount)) {
      throw new PesapalError('PESAPAL_PAYMENT_TERMS_INVALID');
    }
    const token = await getPesapalAccessToken(config);
    const { data: began, error: beginError } = await service.rpc('begin_pesapal_course_payment_request', {
      p_payment_id: context.payment_id,
    });
    if (beginError) throw new PesapalError('PESAPAL_REQUEST_START_FAILED');
    if (began !== true) {
      context = await loadContext(service, context.payment_id);
      return respond(safePayment(context));
    }

    const userMeta = authData.user.user_metadata ?? {};
    const { firstName, lastName } = firstLastName(userMeta.full_name ?? userMeta.name);
    try {
      const order = await submitPesapalOrder(config, token, {
        merchantReference: context.external_reference,
        amount: Number(context.provider_amount),
        currency: context.provider_currency,
        description: 'Uncle Bashi course purchase',
        email: authData.user.email,
        firstName,
        lastName,
      });
      const { data: saved, error: saveError } = await service.rpc('set_pesapal_course_payment_order', {
        p_payment_id: context.payment_id,
        p_external_reference: context.external_reference,
        p_order_tracking_id: order.orderTrackingId,
        p_redirect_url: order.redirectUrl,
      });
      if (saveError || saved !== true) throw new PesapalError('PESAPAL_ORDER_SAVE_FAILED');
    } catch (error) {
      const definitiveRejection = error instanceof PesapalError
        && ((error.code === 'PESAPAL_HTTP_ERROR' && (error.httpStatus ?? 0) >= 400 && (error.httpStatus ?? 0) < 500)
          || error.code === 'PESAPAL_ORDER_REJECTED');
      if (definitiveRejection) {
        await service.rpc('reset_pesapal_course_payment_request', {
          p_payment_id: context.payment_id,
          p_safe_reason: 'Pesapal rejected the order request; it can be retried.',
        });
        throw error;
      }
      throw error;
    }
    context = await loadContext(service, context.payment_id);
    return respond(safePayment(context));
  } catch (error) {
    if (error instanceof PesapalError) {
      console.error(`pesapal-checkout ${error.code}${error.httpStatus ? ` status=${error.httpStatus}` : ''}${error.providerCode ? ` provider_code=${error.providerCode}` : ''}`);
      const status = error.code === 'PESAPAL_BILLING_EMAIL_REQUIRED' ? 400 : 503;
      return respond({ error: status === 400 ? 'A verified email address is required for checkout.' : 'Pesapal checkout is temporarily unavailable.', code: error.code }, status);
    }
    if (error instanceof Error && error.message === 'Sign in to continue.') return respond({ error: 'Sign in to continue.' }, 401);
    console.error('pesapal-checkout failed');
    return respond({ error: 'Pesapal checkout is temporarily unavailable.' }, 503);
  }
});
