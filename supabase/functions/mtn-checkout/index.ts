import {
  createServiceClient,
  getCaller,
  getMtnAccessToken,
  getMtnConfig,
  getProviderTerms,
  getSupabaseConfig,
  isAdmin,
  jsonResponse,
  loadVerificationContext,
  normalizeUgandanMsisdn,
  requestToPay,
  classifyRequestToPayFailure,
  safeResult,
  verifyAndFinalize,
  getCorsHeaders,
  isAllowedBrowserOrigin,
  MtnTokenError,
} from '../_shared/mtn.ts';

interface CheckoutBody {
  action?: unknown;
  course_id?: unknown;
  payer_phone?: unknown;
  idempotency_key?: unknown;
  payment_id?: unknown;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  const corsHeaders = getCorsHeaders(request);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);
  if (origin && !isAllowedBrowserOrigin(origin)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  try {
    getSupabaseConfig();
    const caller = await getCaller(request);
    const body = await request.json() as CheckoutBody;
    const service = createServiceClient();

    if (body.action === 'status') {
      if (typeof body.payment_id !== 'string' || !uuidPattern.test(body.payment_id)) {
        return respond({ error: 'A valid payment ID is required.' }, 400);
      }
      const context = await loadVerificationContext(service, { paymentId: body.payment_id });
      if (context.user_id !== caller.id && !(await isAdmin(service, caller.id))) {
        return respond({ error: 'Payment not found.' }, 404);
      }
      if (context.status === 'pending') {
        const result = await verifyAndFinalize(service, context);
        return respond(result);
      }
      return respond(safeResult(context));
    }

    if (body.action !== undefined) return respond({ error: 'Unsupported checkout action.' }, 400);
    if (typeof body.course_id !== 'string' || !uuidPattern.test(body.course_id)
        || typeof body.idempotency_key !== 'string' || !uuidPattern.test(body.idempotency_key)
        || typeof body.payer_phone !== 'string' || body.payer_phone.length > 40) {
      return respond({ error: 'Course, phone number, and idempotency key are required.' }, 400);
    }
    const phone = normalizeUgandanMsisdn(body.payer_phone);
    // Provider environment is selected only from trusted server config and is
    // persisted atomically with a newly created payment attempt.
    const providerEnvironment = getMtnConfig().targetEnvironment;
    const { data, error } = await service.rpc('create_course_payment_attempt', {
      p_user_id: caller.id,
      p_course_id: body.course_id,
      p_idempotency_key: body.idempotency_key,
      p_payer_msisdn_masked: phone.masked,
      p_provider_environment: providerEnvironment,
    });
    if (error) {
      if (error.message.includes('EDUCATION_AUDIENCE_INELIGIBLE')) {
        return respond({
          error: 'This course is available to a specific audience. Please review your profile details.',
          code: 'COURSE_AUDIENCE_INELIGIBLE',
        }, 403);
      }
      return respond({ error: 'Course checkout could not be created. Check course access and pricing.' }, 400);
    }
    const attempt = (data as Array<{ payment_id: string; status: string }> | null)?.[0];
    if (!attempt) return respond({ error: 'Course checkout could not be created.' }, 500);
    let context = await loadVerificationContext(service, { paymentId: attempt.payment_id });
    if (context.provider !== 'mtn') {
      return respond({ error: 'This payment attempt belongs to another checkout provider.' }, 409);
    }

    if (context.status === 'created') {
      // Fail configuration/token errors before claiming the request so that
      // an unsubmitted attempt remains safely retryable with the same key.
      const token = await getMtnAccessToken();
      const terms = getProviderTerms(context);
      const { data: termsSet, error: termsError } = await service.rpc('set_course_payment_provider_terms', {
        p_payment_id: context.payment_id,
        p_provider_amount: terms.amount,
        p_provider_currency: terms.currency,
      });
      if (termsError || termsSet !== true) return respond({ error: 'Provider payment terms could not be set.' }, 500);
      const { data: claimed, error: claimError } = await service.rpc('begin_course_payment_request', {
        p_payment_id: context.payment_id,
      });
      if (claimError) return respond({ error: 'Course payment request could not be started.' }, 500);
      if (claimed === true) {
        try {
          context = await loadVerificationContext(service, { paymentId: context.payment_id });
          const providerResponse = await requestToPay(context, phone.canonical, token, terms);
          if (providerResponse.status === 202) {
            context = await loadVerificationContext(service, { paymentId: context.payment_id });
          } else {
            const safeFailureReason = await classifyRequestToPayFailure(providerResponse);
            if (safeFailureReason) {
              await service.rpc('fail_course_payment_request', {
                p_payment_id: context.payment_id,
                p_provider_reference: context.provider_reference,
                p_safe_failure_reason: safeFailureReason,
              });
              context = await loadVerificationContext(service, { paymentId: context.payment_id });
            }
          }
          // Non-202 success responses, server errors, and network ambiguity stay
          // pending; authenticated status rechecks verify the provider state.
        } catch {
          // Do not mark a timeout as failed: MTN may have accepted the request.
        }
      }
      context = await loadVerificationContext(service, { paymentId: context.payment_id });
    }

    return respond(safeResult(context));
  } catch (error) {
    if (error instanceof MtnTokenError) {
      const safeLog = error.providerHttpStatus === undefined
        ? error.code
        : `${error.code} status=${error.providerHttpStatus}${error.providerErrorCode ? ` provider_code=${error.providerErrorCode}` : ''}`;
      console.error(safeLog);
      return respond({
        error: 'MTN payment service is temporarily unavailable.',
        code: error.code,
        ...(error.providerHttpStatus === undefined ? {} : { provider_http_status: error.providerHttpStatus }),
        ...(error.providerErrorCode ? { provider_error_code: error.providerErrorCode } : {}),
      }, 503);
    }
    if (error instanceof Error && (error.message.startsWith('Enter a valid') || error.message === 'Sign in to continue.')) {
      return respond({ error: error.message }, 400);
    }
    // Avoid logging request bodies, phone numbers, provider responses, or secrets.
    console.error('mtn-checkout failed');
    return respond({ error: 'Payment service is temporarily unavailable. Please retry or check payment status.' }, 503);
  }
});
