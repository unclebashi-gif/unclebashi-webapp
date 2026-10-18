import { createServiceClient } from '../_shared/mtn.ts';
import {
  getPesapalAccessToken,
  getPesapalConfig,
  getPesapalTransactionStatus,
  PesapalError,
} from '../_shared/pesapal.ts';

interface PaymentContext {
  payment_id: string;
  provider_reference: string;
  external_reference: string;
  amount: number | string;
  currency: string;
  status: string;
  provider_environment: string;
  provider_amount: number | string;
  provider_currency: string;
  provider_status: string | null;
}

interface PesapalNotification {
  OrderTrackingId: string;
  OrderMerchantReference: string;
  OrderNotificationType: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function acknowledgement(type: string, trackingId: string, merchantReference: string, status: number): Response {
  return new Response(JSON.stringify({
    orderNotificationType: type,
    orderTrackingId: trackingId,
    orderMerchantReference: merchantReference,
    status,
  }), { status: status === 200 ? 200 : 500, headers: { 'Content-Type': 'application/json' } });
}

async function readNotification(request: Request): Promise<PesapalNotification> {
  const url = new URL(request.url);
  const values: PesapalNotification = {
    OrderTrackingId: url.searchParams.get('OrderTrackingId') ?? '',
    OrderMerchantReference: url.searchParams.get('OrderMerchantReference') ?? '',
    OrderNotificationType: url.searchParams.get('OrderNotificationType') ?? '',
  };
  if (request.method === 'POST') {
    const body = await request.text();
    if (body.length > 8192) throw new PesapalError('PESAPAL_IPN_BODY_TOO_LARGE');
    let entries: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        entries = parsed as Record<string, unknown>;
      }
    } catch {
      const params = new URLSearchParams(body);
      entries = Object.fromEntries(params.entries());
    }
    for (const key of ['OrderTrackingId', 'OrderMerchantReference', 'OrderNotificationType'] as const) {
      if (!values[key] && typeof entries[key] === 'string') values[key] = entries[key] as string;
    }
  }
  return values;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return acknowledgement('', '', '', 500);
  }
  let notification = { OrderTrackingId: '', OrderMerchantReference: '', OrderNotificationType: '' };
  try {
    notification = await readNotification(request);
    const trackingId = notification.OrderTrackingId;
    const merchantReference = notification.OrderMerchantReference;
    const notificationType = notification.OrderNotificationType;
    if (!UUID_PATTERN.test(trackingId) || !UUID_PATTERN.test(merchantReference)
        || notificationType !== 'IPNCHANGE') {
      return acknowledgement(notificationType, trackingId, merchantReference, 500);
    }

    const service = createServiceClient();
    const { data, error } = await service.rpc('get_pesapal_payment_context', {
      p_payment_id: null,
      p_external_reference: merchantReference,
    });
    const context = (data as PaymentContext[] | null)?.[0];
    if (error || !context || context.external_reference !== merchantReference) {
      return acknowledgement(notificationType, trackingId, merchantReference, 500);
    }
    const trackingNotPersisted = context.provider_reference !== trackingId;
    if (trackingNotPersisted && context.provider_status !== 'SUBMITTING') {
      return acknowledgement(notificationType, trackingId, merchantReference, 500);
    }

    const config = getPesapalConfig(context.provider_environment);
    const token = await getPesapalAccessToken(config);
    const provider = await getPesapalTransactionStatus(config, token, trackingId);
    if (provider.orderTrackingId !== trackingId || provider.merchantReference !== merchantReference
        || !Number.isSafeInteger(Number(context.provider_amount))
        || provider.amount !== Number(context.provider_amount)
        || provider.amount !== Number(context.amount)
        || provider.currency !== context.provider_currency
        || provider.currency !== context.currency) {
      throw new PesapalError('PESAPAL_VERIFIED_TERMS_MISMATCH');
    }
    if (trackingNotPersisted) {
      const { data: saved, error: saveError } = await service.rpc('set_pesapal_course_payment_order', {
        p_payment_id: context.payment_id,
        p_external_reference: merchantReference,
        p_order_tracking_id: trackingId,
        p_redirect_url: null,
      });
      if (saveError || saved !== true) throw new PesapalError('PESAPAL_ORDER_REFERENCE_SAVE_FAILED');
    }
    const { error: finalizeError } = await service.rpc('finalize_pesapal_course_payment', {
      p_payment_id: context.payment_id,
      p_order_tracking_id: trackingId,
      p_external_reference: merchantReference,
      p_provider_status: provider.status,
      p_amount: provider.amount,
      p_currency: provider.currency,
      p_provider_environment: context.provider_environment,
    });
    if (finalizeError) throw new PesapalError('PESAPAL_FINALIZATION_FAILED');
    return acknowledgement(notificationType, trackingId, merchantReference, 200);
  } catch (error) {
    const code = error instanceof PesapalError ? error.code : 'PESAPAL_IPN_PROCESSING_ERROR';
    console.error(`pesapal-ipn ${code}`);
    return acknowledgement(notification.OrderNotificationType, notification.OrderTrackingId,
      notification.OrderMerchantReference, 500);
  }
});
