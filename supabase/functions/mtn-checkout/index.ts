import {
  createServiceClient,
  getCaller,
  getMtnAccessToken,
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
  corsHeaders,
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
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    getSupabaseConfig();
    const caller = await getCaller(request);
    const body = await request.json() as CheckoutBody;
    const service = createServiceClient();

    if (body.action === 'status') {
      if (typeof body.payment_id !== 'string' || !uuidPattern.test(body.payment_id)) {
        return jsonResponse({ error: 'A valid payment ID is required.' }, 400);
      }
      const context = await loadVerificationContext(service, { paymentId: body.payment_id });
      if (context.user_id !== caller.id && !(await isAdmin(service, caller.id))) {
        return jsonResponse({ error: 'Payment not found.' }, 404);
      }
      if (['created', 'pending'].includes(context.status)) {
        const result = await verifyAndFinalize(service, context);
        return jsonResponse(result);
      }
      return jsonResponse(safeResult(context));
    }

    if (body.action !== undefined) return jsonResponse({ error: 'Unsupported checkout action.' }, 400);
    if (typeof body.course_id !== 'string' || !uuidPattern.test(body.course_id)
        || typeof body.idempotency_key !== 'string' || !uuidPattern.test(body.idempotency_key)
        || typeof body.payer_phone !== 'string' || body.payer_phone.length > 40) {
      return jsonResponse({ error: 'Course, phone number, and idempotency key are required.' }, 400);
    }
    const phone = normalizeUgandanMsisdn(body.payer_phone);
    const { data, error } = await service.rpc('create_course_payment_attempt', {
      p_user_id: caller.id,
      p_course_id: body.course_id,
      p_idempotency_key: body.idempotency_key,
      p_payer_msisdn_masked: phone.masked,
    });
    if (error) return jsonResponse({ error: 'Course checkout could not be created. Check course access and pricing.' }, 400);
    const attempt = (data as Array<{ payment_id: string; status: string }> | null)?.[0];
    if (!attempt) return jsonResponse({ error: 'Course checkout could not be created.' }, 500);
    let context = await loadVerificationContext(service, { paymentId: attempt.payment_id });

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
      if (termsError || termsSet !== true) return jsonResponse({ error: 'Provider payment terms could not be set.' }, 500);
      const { data: claimed, error: claimError } = await service.rpc('begin_course_payment_request', {
        p_payment_id: context.payment_id,
      });
      if (claimError) return jsonResponse({ error: 'Course payment request could not be started.' }, 500);
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

    return jsonResponse(safeResult(context));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Enter a valid') || error.message === 'Sign in to continue.')) {
      return jsonResponse({ error: error.message }, 400);
    }
    // Avoid logging request bodies, phone numbers, provider responses, or secrets.
    console.error('mtn-checkout failed');
    return jsonResponse({ error: 'Payment service is temporarily unavailable. Please retry or check payment status.' }, 503);
  }
});
