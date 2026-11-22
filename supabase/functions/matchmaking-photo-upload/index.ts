import {
  authenticatePhotoCaller,
  createPhotoServiceClient,
  isUuid,
  MATCHMAKING_PHOTO_BUCKET,
  MATCHMAKING_PHOTO_MAX_BYTES,
  photoCorsHeaders,
  photoJsonResponse,
  photoOriginIsAllowed,
  readPhotoRequestBody,
  removePhotoObjectAndAcknowledge,
} from '../_shared/matchmakingPhotos.ts';

interface UploadSlotRow {
  photo_id: string;
  storage_path: string;
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
    const service = createPhotoServiceClient();

    if (body.action === 'create') {
      const displayOrder = body.display_order;
      if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > 3
          || (body.replace_photo_id !== undefined && body.replace_photo_id !== null && !isUuid(body.replace_photo_id))) {
        return respond({ error: 'Choose a valid photo position.' }, 400);
      }
      const photoId = crypto.randomUUID();
      const storagePath = `${caller.id}/${photoId}.webp`;
      const { data, error } = await service.rpc('_create_matchmaking_photo_upload_slot', {
        p_user_id: caller.id,
        p_photo_id: photoId,
        p_display_order: displayOrder,
        p_storage_path: storagePath,
        p_replace_photo_id: body.replace_photo_id ?? null,
      });
      if (error) return respond({ error: 'A photo upload slot could not be created.' }, 400);
      const slot = (data as UploadSlotRow[] | null)?.[0];
      if (!slot || slot.photo_id !== photoId || slot.storage_path !== storagePath) {
        return respond({ error: 'A photo upload slot could not be created.' }, 500);
      }

      const { data: signedUpload, error: signedUploadError } = await service.storage
        .from(MATCHMAKING_PHOTO_BUCKET)
        .createSignedUploadUrl(slot.storage_path, { upsert: false });
      if (signedUploadError || !signedUpload?.signedUrl) {
        const { data: retired } = await service.rpc('_retire_matchmaking_photo', {
          p_user_id: caller.id,
          p_photo_id: slot.photo_id,
        });
        const retiredRow = (retired as Array<{ storage_path: string }> | null)?.[0];
        if (retiredRow?.storage_path) await removePhotoObjectAndAcknowledge(service, retiredRow.storage_path);
        return respond({ error: 'A secure photo upload could not be prepared.' }, 503);
      }

      // The signed URL is the one-object upload capability. Never return the
      // service key, signed token separately, or raw database storage path.
      return respond({ photo_id: slot.photo_id, signed_upload_url: signedUpload.signedUrl }, 201);
    }

    if (body.action === 'finalize') {
      if (!isUuid(body.photo_id)) return respond({ error: 'A valid photo ID is required.' }, 400);
      const { data: photo, error: photoError } = await service.from('matchmaking_photos')
        .select('id,storage_path')
        .eq('id', body.photo_id)
        .eq('user_id', caller.id)
        .is('deleted_at', null)
        .is('upload_completed_at', null)
        .maybeSingle();
      if (photoError || !photo) return respond({ error: 'Upload slot is unavailable.' }, 404);

      const { data: objectInfo, error: infoError } = await service.storage
        .from(MATCHMAKING_PHOTO_BUCKET)
        .info(photo.storage_path);
      if (infoError || !objectInfo) return respond({ error: 'Uploaded photo was not found.' }, 400);
      const contentType = (objectInfo.contentType ?? '').split(';')[0].trim().toLowerCase();
      const sizeBytes = Number(objectInfo.size);
      if (contentType !== 'image/webp' || !Number.isSafeInteger(sizeBytes)
          || sizeBytes < 1 || sizeBytes > MATCHMAKING_PHOTO_MAX_BYTES) {
        return respond({ error: 'Uploaded photo must be WebP and no larger than 3 MB.' }, 400);
      }

      const { data: finalized, error: finalizeError } = await service.rpc('_finalize_matchmaking_photo_upload', {
        p_user_id: caller.id,
        p_photo_id: body.photo_id,
        p_content_type: contentType,
        p_size_bytes: sizeBytes,
      });
      if (finalizeError || finalized !== true) return respond({ error: 'Photo upload could not be finalized.' }, 400);
      return respond({ photo_id: body.photo_id, status: 'pending_review' });
    }

    if (body.action === 'delete') {
      if (!isUuid(body.photo_id)) return respond({ error: 'A valid photo ID is required.' }, 400);
      const { data, error } = await service.rpc('_retire_matchmaking_photo', {
        p_user_id: caller.id,
        p_photo_id: body.photo_id,
      });
      const retired = (data as Array<{ photo_id: string; storage_path: string }> | null)?.[0];
      if (error || !retired) return respond({ error: 'Photo not found.' }, 404);
      await removePhotoObjectAndAcknowledge(service, retired.storage_path, true);
      return respond({ deleted: true, cleanup_pending: true, cleanup_recheck_after_seconds: 7200 });
    }

    return respond({ error: 'Unsupported photo upload action.' }, 400);
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return respond({ error: 'Sign in to continue.' }, 401);
    }
    // Do not log credentials, signed URLs, object paths, request bodies, or image metadata.
    console.error('matchmaking-photo-upload failed');
    return respond({ error: 'Photo service is temporarily unavailable.' }, 503);
  }
});
