import {
  authenticatePhotoCaller,
  createPhotoServiceClient,
  isUuid,
  MATCHMAKING_PHOTO_BUCKET,
  photoCorsHeaders,
  photoJsonResponse,
  photoOriginIsAllowed,
  readPhotoRequestBody,
} from '../_shared/matchmakingPhotos.ts';

interface PhotoAccessRow {
  id: string;
  user_id: string;
  storage_path: string;
  status: 'pending_review' | 'approved' | 'rejected';
  upload_completed_at: string | null;
  deleted_at: string | null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const headers = photoCorsHeaders(request);
  const respond = (body: unknown, status = 200) => photoJsonResponse(body, status, headers);
  if (!photoOriginIsAllowed(request)) return respond({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  try {
    const caller = await authenticatePhotoCaller(request);
    const body = await readPhotoRequestBody(request);
    if (!isUuid(body.photo_id)) return respond({ error: 'Photo not found.' }, 404);
    const service = createPhotoServiceClient();
    const { data: callerAccount, error: callerAccountError } = await service.from('users')
      .select('id').eq('id', caller.id).eq('account_status', 'active').maybeSingle();
    if (callerAccountError) return respond({ error: 'Photo access could not be verified.' }, 503);
    if (!callerAccount) return respond({ error: 'Photo not found.' }, 404);
    const { data: photo, error: photoError } = await service.from('matchmaking_photos')
      .select('id,user_id,storage_path,status,upload_completed_at,deleted_at')
      .eq('id', body.photo_id)
      .is('deleted_at', null)
      .not('upload_completed_at', 'is', null)
      .maybeSingle();
    if (photoError || !photo) return respond({ error: 'Photo not found.' }, 404);

    const isOwner = photo.user_id === caller.id;
    let isReviewer = false;
    let authorized = isOwner;
    let targetProfileId: string | null = null;
    if (!authorized) {
      const { data: reviewerRole, error: roleError } = await service.from('user_roles')
        .select('role')
        .eq('user_id', caller.id)
        .in('role', ['admin', 'moderator'])
        .limit(1)
        .maybeSingle();
      if (roleError) return respond({ error: 'Photo access could not be verified.' }, 503);
      isReviewer = Boolean(reviewerRole);
      authorized = isReviewer;
    }

    if (!authorized) {
      if (photo.status !== 'approved') return respond({ error: 'Photo not found.' }, 404);
      const { data: targetProfile, error: targetError } = await service.from('matchmaking_profiles')
        .select('id')
        .eq('user_id', photo.user_id)
        .maybeSingle();
      if (targetError || !targetProfile) return respond({ error: 'Photo not found.' }, 404);
      targetProfileId = targetProfile.id;

      // This caller-scoped RPC is the existing authorization boundary for
      // eligible members, opposite gender, mutual preferences, blocks, and
      // current profile visibility. Its data is never returned by this broker.
      const { error: visibilityError } = await caller.client.rpc('get_matchmaking_profile', {
        p_profile_identifier: targetProfile.id,
      });
      if (visibilityError) return respond({ error: 'Photo not found.' }, 404);
    }

    const { data: signed, error: signedError } = await service.storage
      .from(MATCHMAKING_PHOTO_BUCKET)
      .createSignedUrl((photo as PhotoAccessRow).storage_path, 300);
    if (signedError || !signed?.signedUrl) return respond({ error: 'Photo is temporarily unavailable.' }, 503);

    // Revalidate the authorization boundary after signing. The URL is never
    // returned if account/journey state, moderation role, or member visibility
    // changed while the signing request was in flight.
    const { data: currentCallerAccount, error: currentAccountError } = await service.from('users')
      .select('id').eq('id', caller.id).eq('account_status', 'active').maybeSingle();
    if (currentAccountError || !currentCallerAccount) return respond({ error: 'Photo not found.' }, 404);
    if (isOwner) {
      const { data: journey, error: journeyError } = await service.from('user_journeys')
        .select('user_id').eq('user_id', caller.id).eq('journey_type', 'matchmaking').eq('status', 'active').maybeSingle();
      if (journeyError || !journey) return respond({ error: 'Photo not found.' }, 404);
    } else if (isReviewer) {
      const { data: reviewerRole, error: roleError } = await service.from('user_roles')
        .select('role').eq('user_id', caller.id).in('role', ['admin', 'moderator']).limit(1).maybeSingle();
      if (roleError || !reviewerRole) return respond({ error: 'Photo not found.' }, 404);
    } else if (targetProfileId) {
      const { error: visibilityError } = await caller.client.rpc('get_matchmaking_profile', {
        p_profile_identifier: targetProfileId,
      });
      if (visibilityError) return respond({ error: 'Photo not found.' }, 404);
    }

    const { data: stillActive, error: activeCheckError } = await service.from('matchmaking_photos')
      .select('status')
      .eq('id', photo.id)
      .eq('user_id', photo.user_id)
      .is('deleted_at', null)
      .not('upload_completed_at', 'is', null)
      .maybeSingle();
    if (activeCheckError || !stillActive || (!isOwner && !isReviewer && stillActive.status !== 'approved')) {
      return respond({ error: 'Photo not found.' }, 404);
    }
    return respond({ signed_url: signed.signedUrl, expires_in: 300 });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return respond({ error: 'Sign in to continue.' }, 401);
    }
    console.error('matchmaking-photo-access failed');
    return respond({ error: 'Photo access is temporarily unavailable.' }, 503);
  }
});
