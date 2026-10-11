import {
  createServiceClient,
  jsonResponse,
  loadVerificationContext,
  verifyAndFinalize,
} from '../_shared/mtn.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

interface CallbackBody {
  externalId?: unknown;
  referenceId?: unknown;
  providerReference?: unknown;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, {});
  }
  let rawBody: string;
  try {
    const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
    if (declaredLength > 32000) return jsonResponse({ error: 'Invalid callback.' }, 413, {});
    rawBody = await request.text();
    if (rawBody.length > 32000) return jsonResponse({ error: 'Invalid callback.' }, 413, {});
  } catch {
    return jsonResponse({ error: 'Invalid callback.' }, 400, {});
  }

  let body: CallbackBody = {};
  try {
    if (rawBody.trim()) body = JSON.parse(rawBody) as CallbackBody;
  } catch {
    return jsonResponse({ error: 'Invalid callback.' }, 400, {});
  }

  const headerReference = request.headers.get('X-Reference-Id');
  const providerReference = headerReference
    ?? (typeof body.referenceId === 'string' ? body.referenceId : null)
    ?? (typeof body.providerReference === 'string' ? body.providerReference : null);
  const externalReference = typeof body.externalId === 'string' ? body.externalId : null;
  const hasProviderReference = Boolean(providerReference && uuidPattern.test(providerReference));
  const hasExternalReference = Boolean(externalReference && externalReference.length <= 100);
  if (!hasProviderReference && !hasExternalReference) {
    return jsonResponse({ error: 'A valid transaction reference is required.' }, 400, {});
  }

  const verification = (async () => {
    const service = createServiceClient();
    const context = await loadVerificationContext(service, hasProviderReference
      ? { providerReference: providerReference! }
      : { externalReference: externalReference! });
    if (hasExternalReference && context.external_reference !== externalReference) {
      throw new Error('Callback external reference mismatch.');
    }
    if (hasProviderReference && context.provider_reference !== providerReference) {
      throw new Error('Callback provider reference mismatch.');
    }
    if (context.status === 'created' || context.status === 'pending') {
      await verifyAndFinalize(service, context);
    }
    // Callback status is ignored; server-to-server MTN status verification is authoritative.
  })().catch(() => {
    console.error('mtn-payment-callback background verification failed');
  });

  EdgeRuntime.waitUntil(verification);
  return jsonResponse({ received: true }, 200, {});
});
