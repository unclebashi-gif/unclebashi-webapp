import {
  authenticatePhotoCaller,
  createPhotoServiceClient,
  MATCHMAKING_PHOTO_BUCKET,
  photoCorsHeaders,
  photoJsonResponse,
  photoOriginIsAllowed,
  readPhotoRequestBody,
} from '../_shared/matchmakingPhotos.ts';

interface CleanupQueueRow { storage_path: string }

Deno.serve(async (request: Request): Promise<Response> => {
  const headers = photoCorsHeaders(request);
  const respond = (body: unknown, status = 200) => photoJsonResponse(body, status, headers);
  if (!photoOriginIsAllowed(request)) return respond({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  try {
    const caller = await authenticatePhotoCaller(request);
    const service = createPhotoServiceClient();
    const { data: adminRole, error: roleError } = await service.from('user_roles')
      .select('role').eq('user_id', caller.id).eq('role', 'admin').maybeSingle();
    if (roleError || !adminRole) return respond({ error: 'Administrator access required.' }, 403);

    const body = await readPhotoRequestBody(request);
    const requestedLimit = body.limit === undefined ? 100 : body.limit;
    if (typeof requestedLimit !== 'number' || !Number.isInteger(requestedLimit)
        || requestedLimit < 1 || requestedLimit > 100) {
      return respond({ error: 'Batch limit must be between 1 and 100.' }, 400);
    }

    const { data, error } = await service.rpc('_get_matchmaking_photo_cleanup_paths', { p_limit: requestedLimit });
    if (error) return respond({ error: 'The photo cleanup queue could not be loaded.' }, 503);
    const paths = (data as CleanupQueueRow[] | null) ?? [];
    let deleted = 0;
    let failed = 0;

    for (const row of paths) {
      const { error: removeError } = await service.storage.from(MATCHMAKING_PHOTO_BUCKET).remove([row.storage_path]);
      const providerCode = removeError && typeof removeError.statusCode === 'string'
        && /^[A-Z0-9_]{1,80}$/.test(removeError.statusCode)
        ? removeError.statusCode : removeError ? 'STORAGE_DELETE_FAILED' : null;
      const { error: acknowledgeError } = await service.rpc('_complete_matchmaking_photo_cleanup', {
        p_storage_path: row.storage_path,
        p_error_code: providerCode,
      });
      if (removeError || acknowledgeError) failed++;
      else deleted++;
    }

    return respond({
      processed: paths.length,
      deleted,
      failed,
      remaining_or_more: paths.length === requestedLimit,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return respond({ error: 'Sign in to continue.' }, 401);
    }
    console.error('matchmaking-photo-cleanup failed');
    return respond({ error: 'Photo cleanup is temporarily unavailable.' }, 503);
  }
});
