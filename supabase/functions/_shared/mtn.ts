import { createClient } from 'npm:@supabase/supabase-js@2';

export interface PaymentContext {
  payment_id: string;
  user_id: string;
  course_id: string;
  provider_reference: string;
  external_reference: string;
  amount: number;
  currency: string;
  status: string;
  payer_msisdn_masked: string | null;
  access_granted_at: string | null;
}

export interface SafePaymentResult {
  payment_id: string;
  course_id: string;
  amount: number;
  currency: string;
  status: string;
  access_granted: boolean;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function getSupabaseConfig() {
  return {
    url: requiredEnv('SUPABASE_URL'),
    anonKey: requiredEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function getMtnConfig() {
  const baseUrl = requiredEnv('MTN_BASE_URL').replace(/\/+$/, '');
  const callbackBaseUrl = requiredEnv('MTN_CALLBACK_BASE_URL').replace(/\/+$/, '');
  const parsedBase = new URL(baseUrl);
  const parsedCallback = new URL(callbackBaseUrl);
  if (parsedBase.protocol !== 'https:' || parsedBase.hostname !== 'sandbox.momodeveloper.mtn.com'
      || parsedCallback.protocol !== 'https:' || parsedCallback.username || parsedCallback.password
      || parsedCallback.search || parsedCallback.hash) {
    throw new Error('This implementation is restricted to the MTN sandbox and an HTTPS callback.');
  }
  const targetEnvironment = requiredEnv('MTN_TARGET_ENVIRONMENT');
  if (targetEnvironment !== 'sandbox') {
    throw new Error('MTN_TARGET_ENVIRONMENT must be sandbox in this implementation.');
  }
  return {
    baseUrl,
    callbackBaseUrl,
    apiUser: requiredEnv('MTN_API_USER'),
    apiKey: requiredEnv('MTN_API_KEY'),
    subscriptionKey: requiredEnv('MTN_COLLECTION_SUBSCRIPTION_KEY'),
    targetEnvironment,
  };
}

export function createServiceClient() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(authorization: string) {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export function normalizeUgandanMsisdn(input: string): { canonical: string; masked: string } {
  const trimmed = input.trim();
  if (!/^\+?[0-9()\s.-]+$/.test(trimmed)) {
    throw new Error('Enter a valid Ugandan MTN phone number.');
  }
  const digits = trimmed.replace(/\D/g, '');
  const sandboxNumbers = new Set([
    '46733123450', '46733123451', '46733123452', '46733123453', '46733123454',
    '46733123455', '46733123456', '46733123457', '46733123458', '46733123459',
    '46733123460', '46733123461', '46733123462', '46733123463', '46733123464',
  ]);
  if (Deno.env.get('MTN_TARGET_ENVIRONMENT') === 'sandbox' && sandboxNumbers.has(digits)) {
    return { canonical: digits, masked: `${digits.slice(0, 3)}•••••${digits.slice(-3)}` };
  }

  let canonical: string;
  if (/^07[0-9]{8}$/.test(digits)) canonical = `256${digits.slice(1)}`;
  else if (/^7[0-9]{8}$/.test(digits)) canonical = `256${digits}`;
  else if (/^2567[0-9]{8}$/.test(digits)) canonical = digits;
  else throw new Error('Enter a valid Ugandan MTN number, such as 07… or +2567….');
  return { canonical, masked: `${canonical.slice(0, 3)}••••••${canonical.slice(-3)}` };
}

export async function getMtnAccessToken(): Promise<string> {
  const config = getMtnConfig();
  const basic = btoa(`${config.apiUser}:${config.apiKey}`);
  const response = await fetch(`${config.baseUrl}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('MTN authentication failed. Check server-side sandbox configuration.');
  const payload = await response.json() as { access_token?: unknown };
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('MTN did not return an access token.');
  }
  return payload.access_token;
}

function callbackUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = basePath.endsWith('/mtn-payment-callback')
    ? basePath
    : `${basePath}/mtn-payment-callback`;
  return url.toString();
}

function mtnHeaders(accessToken: string) {
  const config = getMtnConfig();
  return {
    Authorization: `Bearer ${accessToken}`,
    'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    'X-Target-Environment': config.targetEnvironment,
    'Content-Type': 'application/json',
  };
}

export async function requestToPay(
  context: PaymentContext,
  msisdn: string,
  accessToken: string,
  providerTerms: { amount: number; currency: string },
): Promise<Response> {
  const config = getMtnConfig();
  const headers = {
    ...mtnHeaders(accessToken),
    'X-Reference-Id': context.provider_reference,
    'X-Callback-Url': callbackUrl(config.callbackBaseUrl),
  };
  return await fetch(`${config.baseUrl}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: String(providerTerms.amount),
      currency: providerTerms.currency,
      externalId: context.external_reference,
      payer: { partyIdType: 'MSISDN', partyId: msisdn },
      payerMessage: 'Uncle Bashi course purchase',
      payeeNote: 'Course access after verified payment',
    }),
    signal: AbortSignal.timeout(20000),
  });
}

export interface MtnTransactionStatus {
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  amount: number;
  currency: string;
  externalId: string;
}

export async function getProviderTransactionStatus(
  providerReference: string,
  accessToken: string,
): Promise<MtnTransactionStatus> {
  const config = getMtnConfig();
  const response = await fetch(
    `${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(providerReference)}`,
    { headers: mtnHeaders(accessToken), signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error('MTN payment status is not available yet.');
  const payload = await response.json() as Record<string, unknown>;
  const allowed = ['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;
  if (typeof payload.status !== 'string' || !allowed.includes(payload.status as typeof allowed[number])) {
    throw new Error('MTN returned an unsupported payment status.');
  }
  const amount = typeof payload.amount === 'number' ? payload.amount
    : typeof payload.amount === 'string' && /^\d+(?:\.0+)?$/.test(payload.amount)
      ? Number(payload.amount) : NaN;
  if (!Number.isSafeInteger(amount) || typeof payload.currency !== 'string'
      || typeof payload.externalId !== 'string') {
    throw new Error('MTN payment status did not include the expected transaction details.');
  }
  return {
    status: payload.status as MtnTransactionStatus['status'],
    amount,
    currency: payload.currency,
    externalId: payload.externalId,
  };
}

export async function loadVerificationContext(
  client: ReturnType<typeof createServiceClient>,
  lookup: { paymentId?: string; providerReference?: string; externalReference?: string },
): Promise<PaymentContext> {
  const { data, error } = await client.rpc('get_course_payment_verification_context', {
    p_payment_id: lookup.paymentId ?? null,
    p_provider_reference: lookup.providerReference ?? null,
    p_external_reference: lookup.externalReference ?? null,
  });
  if (error) throw new Error('Payment record could not be loaded.');
  const row = (data as PaymentContext[] | null)?.[0];
  if (!row) throw new Error('Payment record not found.');
  return row;
}

export async function verifyAndFinalize(
  client: ReturnType<typeof createServiceClient>,
  context: PaymentContext,
): Promise<SafePaymentResult> {
  if (context.status === 'successful') return safeResult(context);
  if (['failed', 'cancelled', 'expired'].includes(context.status)) return safeResult(context);
  const token = await getMtnAccessToken();
  const provider = await getProviderTransactionStatus(context.provider_reference, token);
  if (provider.externalId !== context.external_reference) {
    throw new Error('MTN transaction reference did not match the payment attempt.');
  }
  const { error } = await client.rpc('finalize_verified_course_payment', {
    p_payment_id: context.payment_id,
    p_provider_reference: context.provider_reference,
    p_provider_status: provider.status,
    p_amount: provider.amount,
    p_currency: provider.currency,
  });
  if (error) throw new Error('Verified payment could not be finalized.');
  const refreshed = await loadVerificationContext(client, { paymentId: context.payment_id });
  return safeResult(refreshed);
}

export function safeResult(context: PaymentContext): SafePaymentResult {
  return {
    payment_id: context.payment_id,
    course_id: context.course_id,
    amount: context.amount,
    currency: context.currency,
    status: context.status,
    access_granted: Boolean(context.access_granted_at),
  };
}

export function getProviderTerms(context: PaymentContext): { amount: number; currency: string } {
  const config = getMtnConfig();
  return {
    amount: context.amount,
    currency: config.targetEnvironment === 'sandbox' ? 'EUR' : context.currency,
  };
}

export async function classifyRequestToPayFailure(response: Response): Promise<string | null> {
  let payload = '';
  try {
    payload = (await response.text()).slice(0, 4096);
  } catch {
    return null;
  }

  let code = '';
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const candidate = parsed.code ?? parsed.errorCode ?? parsed.message;
    if (typeof candidate === 'string') code = candidate.toUpperCase();
  } catch {
    code = payload.toUpperCase();
  }

  // MTN may return this when the same reference already exists. That is
  // ambiguous: retain pending and verify its status instead of failing it.
  if (code.includes('RESOURCE_ALREADY_EXIST')) return null;
  if (code.includes('INVALID_CURRENCY')) return 'MTN rejected the configured payment currency.';
  if (code.includes('INVALID_CALLBACK_URL_HOST')) return 'MTN rejected the configured callback host.';
  if (code.includes('NOT_ALLOWED_TARGET_ENVIRONMENT')) return 'MTN rejected the configured target environment.';
  if (response.status === 400) return 'MTN rejected the payment request parameters.';
  if (response.status === 401 || response.status === 403) return 'MTN rejected the server payment configuration.';
  return null;
}

export async function getCaller(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Sign in to continue.');
  const client = createUserClient(authorization);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to continue.');
  return { id: data.user.id, client };
}

export async function isAdmin(
  client: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client.from('user_roles').select('role')
    .eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (error) throw new Error('Could not verify administrator role.');
  return Boolean(data);
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = corsHeaders): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
