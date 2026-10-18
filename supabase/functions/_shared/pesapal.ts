export type PesapalEnvironment = 'sandbox' | 'production';

export interface PesapalConfig {
  environment: PesapalEnvironment;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  ipnId: string;
  callbackUrl: string;
  cancellationUrl: string;
}

export class PesapalError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus?: number,
    public readonly providerCode?: string,
  ) {
    super(code);
    this.name = 'PesapalError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SANDBOX_BASE = 'https://cybqa.pesapal.com/pesapalv3';
const PRODUCTION_BASE = 'https://pay.pesapal.com/v3';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new PesapalError('PESAPAL_CONFIGURATION_MISSING');
  return value;
}

function safeUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('invalid');
    }
    return url;
  } catch {
    throw new PesapalError('PESAPAL_CONFIGURATION_INVALID');
  }
}

function hasSuccessfulProviderStatus(payload: Record<string, unknown>): boolean {
  return payload.status === 200 || payload.status === '200';
}

export function getPesapalConfig(expectedEnvironment?: string): PesapalConfig {
  const environment = requiredEnv('PESAPAL_ENVIRONMENT');
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new PesapalError('PESAPAL_ENVIRONMENT_INVALID');
  }
  if (expectedEnvironment && expectedEnvironment !== environment) {
    throw new PesapalError('PESAPAL_PAYMENT_ENVIRONMENT_MISMATCH');
  }
  const expectedBase = environment === 'sandbox' ? SANDBOX_BASE : PRODUCTION_BASE;
  const baseUrl = requiredEnv('PESAPAL_BASE_URL').replace(/\/+$/, '');
  if (baseUrl !== expectedBase) throw new PesapalError('PESAPAL_BASE_URL_ENVIRONMENT_MISMATCH');

  const callbackUrl = safeUrl(requiredEnv('PESAPAL_CALLBACK_URL')).toString();
  const cancellationUrl = safeUrl(requiredEnv('PESAPAL_CANCELLATION_URL')).toString();
  const ipnId = requiredEnv('PESAPAL_IPN_ID');
  if (!UUID_PATTERN.test(ipnId)) throw new PesapalError('PESAPAL_IPN_ID_INVALID');

  return {
    environment,
    baseUrl,
    consumerKey: requiredEnv('PESAPAL_CONSUMER_KEY'),
    consumerSecret: requiredEnv('PESAPAL_CONSUMER_SECRET'),
    ipnId,
    callbackUrl,
    cancellationUrl,
  };
}

async function safeProviderCode(response: Response): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < 4096) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const part = value.subarray(0, 4096 - total);
      chunks.push(part);
      total += part.byteLength;
      if (part.byteLength < value.byteLength || total === 4096) {
        await reader.cancel();
        break;
      }
    }
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const error = payload.error;
    const candidate = typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>).code
      : payload.code;
    return typeof candidate === 'string' && /^[A-Z0-9_]{1,64}$/i.test(candidate)
      ? candidate.toUpperCase() : undefined;
  } catch {
    return undefined;
  }
}

async function parseProviderResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const providerCode = await safeProviderCode(response);
    throw new PesapalError('PESAPAL_HTTP_ERROR', response.status, providerCode);
  }
  try {
    const payload = await response.json() as unknown;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('shape');
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new PesapalError('PESAPAL_INVALID_RESPONSE', response.status);
  }
}

export async function getPesapalAccessToken(config = getPesapalConfig()): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumer_key: config.consumerKey, consumer_secret: config.consumerSecret }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PesapalError('PESAPAL_TOKEN_NETWORK_ERROR');
  }
  const payload = await parseProviderResponse(response);
  const token = payload.token;
  if (!hasSuccessfulProviderStatus(payload) || typeof token !== 'string' || !token.trim()) {
    throw new PesapalError('PESAPAL_TOKEN_INVALID_RESPONSE');
  }
  return token;
}

export interface PesapalOrderRequest {
  merchantReference: string;
  amount: number;
  currency: string;
  description: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PesapalOrderResponse {
  orderTrackingId: string;
  merchantReference: string;
  redirectUrl: string;
}

export async function submitPesapalOrder(
  config: PesapalConfig,
  token: string,
  order: PesapalOrderRequest,
): Promise<PesapalOrderResponse> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: order.merchantReference,
        currency: order.currency,
        amount: order.amount,
        description: order.description.slice(0, 100),
        redirect_mode: 'TOP_WINDOW',
        callback_url: config.callbackUrl,
        cancellation_url: config.cancellationUrl,
        notification_id: config.ipnId,
        billing_address: {
          email_address: order.email,
          country_code: 'UG',
          first_name: order.firstName.slice(0, 50) || 'Learner',
          last_name: order.lastName.slice(0, 50) || 'Uncle Bashi',
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new PesapalError('PESAPAL_ORDER_NETWORK_ERROR');
  }
  const payload = await parseProviderResponse(response);
  if (!hasSuccessfulProviderStatus(payload)) throw new PesapalError('PESAPAL_ORDER_REJECTED');
  const tracking = payload.order_tracking_id ?? payload.orderTrackingId;
  const reference = payload.merchant_reference ?? payload.merchantReference ?? order.merchantReference;
  const redirect = payload.redirect_url ?? payload.redirectUrl;
  if (typeof tracking !== 'string' || !UUID_PATTERN.test(tracking)
      || typeof reference !== 'string' || reference !== order.merchantReference
      || typeof redirect !== 'string') {
    throw new PesapalError('PESAPAL_ORDER_INVALID_RESPONSE');
  }
  const redirectUrl = safeUrl(redirect);
  const allowedHost = config.environment === 'sandbox' ? 'cybqa.pesapal.com' : 'pay.pesapal.com';
  if (redirectUrl.hostname !== allowedHost) throw new PesapalError('PESAPAL_REDIRECT_HOST_INVALID');
  return { orderTrackingId: tracking, merchantReference: reference, redirectUrl: redirectUrl.toString() };
}

export interface PesapalTransactionStatus {
  orderTrackingId: string;
  merchantReference: string;
  amount: number;
  currency: string;
  status: 'INVALID' | 'COMPLETED' | 'FAILED' | 'REVERSED';
}

function parsePesapalTransactionStatus(payload: Record<string, unknown>): PesapalTransactionStatus['status'] {
  const statusValue = payload.payment_status_description ?? payload.paymentStatusDescription;
  if (typeof statusValue === 'string') {
    const normalized = statusValue.trim().toUpperCase();
    if (['INVALID', 'COMPLETED', 'FAILED', 'REVERSED'].includes(normalized)) {
      return normalized as PesapalTransactionStatus['status'];
    }
  }

  const rawStatusCode = payload.status_code ?? payload.statusCode;
  const statusCode = typeof rawStatusCode === 'number' ? rawStatusCode
    : typeof rawStatusCode === 'string' && /^[0-3]$/.test(rawStatusCode) ? Number(rawStatusCode) : NaN;
  switch (statusCode) {
    case 0: return 'INVALID';
    case 1: return 'COMPLETED';
    case 2: return 'FAILED';
    case 3: return 'REVERSED';
    default: throw new PesapalError('PESAPAL_STATUS_INVALID_RESPONSE');
  }
}

export async function getPesapalTransactionStatus(
  config: PesapalConfig,
  token: string,
  orderTrackingId: string,
): Promise<PesapalTransactionStatus> {
  if (!UUID_PATTERN.test(orderTrackingId)) throw new PesapalError('PESAPAL_TRACKING_ID_INVALID');
  let response: Response;
  try {
    const url = new URL(`${config.baseUrl}/api/Transactions/GetTransactionStatus`);
    url.searchParams.set('orderTrackingId', orderTrackingId);
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PesapalError('PESAPAL_STATUS_NETWORK_ERROR');
  }
  const payload = await parseProviderResponse(response);
  if (!hasSuccessfulProviderStatus(payload)) throw new PesapalError('PESAPAL_STATUS_PROVIDER_ERROR');
  const tracking = payload.order_tracking_id ?? payload.orderTrackingId ?? orderTrackingId;
  const merchantReference = payload.merchant_reference ?? payload.merchantReference;
  const rawAmount = payload.amount;
  const amount = typeof rawAmount === 'number' ? rawAmount
    : typeof rawAmount === 'string' && /^\d+(?:\.0+)?$/.test(rawAmount) ? Number(rawAmount) : NaN;
  const currency = payload.currency;
  const status = parsePesapalTransactionStatus(payload);
  if (tracking !== orderTrackingId || typeof merchantReference !== 'string'
      || !Number.isSafeInteger(amount) || typeof currency !== 'string'
      || !['INVALID', 'COMPLETED', 'FAILED', 'REVERSED'].includes(status)) {
    throw new PesapalError('PESAPAL_STATUS_INVALID_RESPONSE');
  }
  return {
    orderTrackingId,
    merchantReference,
    amount,
    currency,
    status: status as PesapalTransactionStatus['status'],
  };
}
