import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const MATCHMAKING_PHOTO_BUCKET = 'matchmaking-photos';
export const MATCHMAKING_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

const allowedOrigins = new Set([
  'https://unclebashi.com',
  'https://www.unclebashi.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

export interface PhotoCaller {
  id: string;
  client: SupabaseClient;
}

export function photoCorsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function photoOriginIsAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins.has(origin);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function createPhotoServiceClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticatePhotoCaller(request: Request): Promise<PhotoCaller> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  return { id: data.user.id, client };
}

export function photoJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function readPhotoRequestBody(request: Request): Promise<Record<string, unknown>> {
  const maxBytes = 8192;
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > maxBytes || !request.body) throw new Error('INVALID_REQUEST');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('INVALID_REQUEST');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const rawBody = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error('INVALID_REQUEST');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('INVALID_REQUEST');
  return body as Record<string, unknown>;
}

export async function removePhotoObjectAndAcknowledge(
  service: SupabaseClient,
  storagePath: string,
  retainUploadCleanupGrace = false,
): Promise<boolean> {
  const { error } = await service.storage.from(MATCHMAKING_PHOTO_BUCKET).remove([storagePath]);
  if (error) {
    const safeCode = typeof error.statusCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.statusCode)
      ? error.statusCode
      : 'STORAGE_DELETE_FAILED';
    await service.rpc('_complete_matchmaking_photo_cleanup', {
      p_storage_path: storagePath,
      p_error_code: safeCode,
    });
    return false;
  }
  await service.rpc('_complete_matchmaking_photo_cleanup', {
    p_storage_path: storagePath,
    p_error_code: retainUploadCleanupGrace ? 'SIGNED_UPLOAD_GRACE' : null,
  });
  return true;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
