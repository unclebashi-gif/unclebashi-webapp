import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const clients = [];
const createdPhotoIds = new Set();

function clientFor(email, password) {
  const client = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(client);
  return client.auth.signInWithPassword({ email, password }).then(async ({ data, error }) => {
    expect(error, 'Test account authentication should succeed.').toBeNull();
    expect(data.user?.id, 'Test account must resolve to an Auth user.').toBeTruthy();
    const { data: verified, error: verificationError } = await client.auth.getUser();
    expect(verificationError, 'Test account Auth identity should verify.').toBeNull();
    expect(verified.user?.id).toBe(data.user.id);
    return client;
  });
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  expect(error, `RPC ${name} should succeed.`).toBeNull();
  return data;
}

async function invoke(client, functionName, body) {
  return client.functions.invoke(functionName, { body });
}

async function expectDenied(result, label) {
  expect(result.error, `${label} should be denied.`).toBeTruthy();
  expect(result.data?.signed_url, `${label} must not return a signed URL.`).toBeFalsy();
}

async function uploadPhoto(page, owner, order, replacementId = null) {
  const { data, error } = await invoke(owner, 'matchmaking-photo-upload', {
    action: 'create', display_order: order, replace_photo_id: replacementId,
  });
  expect(error, 'Photo upload slot should be created.').toBeNull();
  expect(data?.photo_id).toBeTruthy();
  expect(data?.signed_upload_url).toBeTruthy();
  createdPhotoIds.add(data.photo_id);

  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#52708a';
    context.fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/webp');
  });
  const imageBytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  const uploaded = await fetch(data.signed_upload_url, {
    method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: imageBytes,
  });
  expect(uploaded.ok, `Signed WebP upload should succeed (HTTP ${uploaded.status}).`).toBeTruthy();

  const finalized = await invoke(owner, 'matchmaking-photo-upload', {
    action: 'finalize', photo_id: data.photo_id,
  });
  expect(finalized.error, 'Uploaded photo should finalize.').toBeNull();
  return data.photo_id;
}

async function ownerPhotos(owner) {
  return rpc(owner, 'get_my_matchmaking_photos');
}

test('Wave 4 photo lifecycle, visibility, moderation, replacement, reorder, and cleanup', async ({ page }) => {
  const anonymous = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(anonymous);
  const owner = await clientFor(env.TEST_MATCHMAKING_OWNER_EMAIL, env.TEST_MATCHMAKING_OWNER_PASSWORD);
  const other = await clientFor(env.TEST_MATCHMAKING_OTHER_EMAIL, env.TEST_MATCHMAKING_OTHER_PASSWORD);
  const admin = await clientFor(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
  let profileIdentifier;
  let beforeProfileStatus;
  let beforeCoreImage;

  try {
    const response = await page.goto(env.TEST_BASE_URL);
    expect(response && response.status() < 500, 'The configured app origin should be reachable.').toBeTruthy();
    const normalized = await page.evaluate(async () => {
      const imageModule = await import('/src/lib/matchmakingPhotoImage.ts');
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = 2000;
      sourceCanvas.height = 1000;
      const sourceBlob = await new Promise(resolve => sourceCanvas.toBlob(resolve, 'image/png'));
      if (!sourceBlob) throw new Error('PNG test fixture could not be created.');
      const output = await imageModule.normalizeMatchmakingPhoto(new File([sourceBlob], 'fixture.png', { type: 'image/png' }));
      const decodedOutput = await createImageBitmap(output);
      const maxOutputEdge = Math.max(decodedOutput.width, decodedOutput.height);
      decodedOutput.close();
      let unsupportedRejected = false;
      try { await imageModule.normalizeMatchmakingPhoto(new File(['x'], 'fixture.heic', { type: 'image/heic' })); }
      catch { unsupportedRejected = true; }
      return { type: output.type, size: output.size, maxOutputEdge, unsupportedRejected };
    });
    expect(normalized.type).toBe('image/webp');
    expect(normalized.size).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(normalized.maxOutputEdge).toBeLessThanOrEqual(1600);
    expect(normalized.unsupportedRejected).toBeTruthy();

    const ownerSetup = await rpc(owner, 'get_my_matchmaking_setup');
    profileIdentifier = ownerSetup.profile?.id;
    beforeProfileStatus = ownerSetup.profile?.status;
    beforeCoreImage = ownerSetup.account?.profile_image_url;
    expect(profileIdentifier, 'Owner test account needs an existing Matchmaking profile.').toBeTruthy();
    expect(beforeProfileStatus, 'Owner test profile must be approved before photo-only regression checks.').toBe('approved');
    expect(await ownerPhotos(owner), 'Use a dedicated owner account with no active photo rows.').toHaveLength(0);

    const targetVisible = await other.rpc('get_matchmaking_profile', { p_profile_identifier: profileIdentifier });
    expect(targetVisible.error, 'The other test member must be eligible to view the owner profile.').toBeNull();

    const anonymousCreate = await invoke(anonymous, 'matchmaking-photo-upload', { action: 'create', display_order: 1 });
    await expectDenied(anonymousCreate, 'Anonymous upload-slot creation');
    const anonymousAccess = await invoke(anonymous, 'matchmaking-photo-access', { photo_id: '00000000-0000-4000-8000-000000000000' });
    await expectDenied(anonymousAccess, 'Anonymous photo access');

    const invalidSlot = await invoke(owner, 'matchmaking-photo-upload', { action: 'create', display_order: 1 });
    expect(invalidSlot.error).toBeNull();
    createdPhotoIds.add(invalidSlot.data.photo_id);
    const invalidUpload = await fetch(invalidSlot.data.signed_upload_url, {
      method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: Buffer.from('not a WebP container'),
    });
    expect(invalidUpload.ok).toBeTruthy();
    const invalidFinalize = await invoke(owner, 'matchmaking-photo-upload', {
      action: 'finalize', photo_id: invalidSlot.data.photo_id,
    });
    expect(invalidFinalize.error, 'Incorrect bytes must not be published as a WebP photo.').toBeTruthy();
    expect((await ownerPhotos(owner)).find(row => row.id === invalidSlot.data.photo_id)?.upload_completed_at).toBeNull();
    expect((await invoke(owner, 'matchmaking-photo-upload', { action: 'delete', photo_id: invalidSlot.data.photo_id })).error).toBeNull();

    const firstId = await uploadPhoto(page, owner, 1);
    let rows = await ownerPhotos(owner);
    expect(rows.find(row => row.id === firstId)?.status).toBe('approved');
    expect(rows.find(row => row.id === firstId)?.upload_completed_at).toBeTruthy();

    const ownerView = await invoke(owner, 'matchmaking-photo-access', { photo_id: firstId });
    expect(ownerView.error, 'Owner should access own published photo.').toBeNull();
    expect(ownerView.data?.signed_url).toBeTruthy();
    const firstMemberView = await invoke(other, 'matchmaking-photo-access', { photo_id: firstId });
    expect(firstMemberView.error, 'Eligible member should access a new photo immediately after finalization.').toBeNull();
    expect(firstMemberView.data?.signed_url).toBeTruthy();

    const memberReviewAttempt = await other.rpc('review_matchmaking_photo', {
      p_photo_id: firstId, p_decision: 'approve', p_reason: null,
    });
    expect(memberReviewAttempt.error, 'Ordinary member photo moderation should be denied.').toBeTruthy();
    expect((await ownerPhotos(owner)).find(row => row.id === firstId)?.status).toBe('approved');

    const queue = await rpc(admin, 'get_admin_matchmaking_photo_review_queue', { p_limit: 100 });
    expect(queue.some(row => row.id === firstId && row.status === 'approved'), 'Admin moderation queue should include a published photo.').toBeTruthy();

    const secondId = await uploadPhoto(page, owner, 2);
    expect((await ownerPhotos(owner)).find(row => row.id === secondId)?.status).toBe('approved');
    expect(await rpc(admin, 'review_matchmaking_photo', {
      p_photo_id: secondId, p_decision: 'reject', p_reason: 'Acceptance test rejection reason.',
    })).toBeTruthy();
    rows = await ownerPhotos(owner);
    expect(rows.find(row => row.id === secondId)?.moderation_reason).toBe('Acceptance test rejection reason.');
    expect((await invoke(owner, 'matchmaking-photo-access', { photo_id: secondId })).error).toBeNull();
    await expectDenied(await invoke(other, 'matchmaking-photo-access', { photo_id: secondId }), 'Cross-member rejected photo access');

    const abandonedReplacement = await invoke(owner, 'matchmaking-photo-upload', {
      action: 'create', display_order: 1, replace_photo_id: firstId,
    });
    expect(abandonedReplacement.error).toBeNull();
    createdPhotoIds.add(abandonedReplacement.data.photo_id);
    rows = await ownerPhotos(owner);
    expect(rows.find(row => row.id === firstId)?.status).toBe('approved');
    expect(rows.find(row => row.id === firstId)).toBeTruthy();
    await invoke(owner, 'matchmaking-photo-upload', { action: 'delete', photo_id: abandonedReplacement.data.photo_id });
    rows = await ownerPhotos(owner);
    expect(rows.find(row => row.id === firstId)?.status).toBe('approved');

    const replacementId = await uploadPhoto(page, owner, 1, firstId);
    rows = await ownerPhotos(owner);
    expect(rows.find(row => row.id === firstId)).toBeUndefined();
    expect(rows.find(row => row.id === replacementId)?.status).toBe('approved');
    await expectDenied(await invoke(other, 'matchmaking-photo-access', { photo_id: firstId }), 'Access to the retired replaced photo');
    const afterReplacementSetup = await rpc(owner, 'get_my_matchmaking_setup');
    expect(afterReplacementSetup.profile?.status, 'Photo replacement must not reset biodata moderation.').toBe(beforeProfileStatus);
    expect(afterReplacementSetup.account?.profile_image_url, 'Photo replacement must not change Core profile image.').toBe(beforeCoreImage);

    const thirdId = await uploadPhoto(page, owner, 3);
    expect((await ownerPhotos(owner)).find(row => row.id === thirdId)?.status).toBe('approved');
    rows = await ownerPhotos(owner);
    const ordered = rows.filter(row => row.upload_completed_at && row.display_order !== null)
      .sort((a, b) => a.display_order - b.display_order);
    const statusesBeforeReorder = new Map(ordered.map(row => [row.id, row.status]));
    expect(await rpc(owner, 'reorder_my_matchmaking_photos', { p_photo_ids: [...ordered].reverse().map(row => row.id) })).toBeTruthy();
    rows = await ownerPhotos(owner);
    expect(rows.find(row => row.display_order === 1)?.id).toBe(ordered[ordered.length - 1]?.id);
    for (const row of rows.filter(item => statusesBeforeReorder.has(item.id))) {
      expect(row.status).toBe(statusesBeforeReorder.get(row.id));
    }
    expect(await rpc(admin, 'review_matchmaking_photo', {
      p_photo_id: thirdId, p_decision: 'remove', p_reason: 'Acceptance test removal of published photo.',
    })).toBeTruthy();
    expect((await ownerPhotos(owner)).some(row => row.id === thirdId), 'Admin-removed photo should leave the owner projection.').toBeFalsy();
    await expectDenied(await invoke(other, 'matchmaking-photo-access', { photo_id: thirdId }), 'Access to an admin-removed published photo');
    const overLimit = await invoke(owner, 'matchmaking-photo-upload', { action: 'create', display_order: 3 });
    expect(overLimit.error, 'A fourth active photo slot must be rejected.').toBeTruthy();

    const deleteResult = await invoke(owner, 'matchmaking-photo-upload', { action: 'delete', photo_id: secondId });
    expect(deleteResult.error, 'Owner should logically delete an active photo.').toBeNull();
    expect(deleteResult.data?.cleanup_pending).toBeTruthy();
    expect((await ownerPhotos(owner)).some(row => row.id === secondId)).toBeFalsy();
    await expectDenied(await invoke(other, 'matchmaking-photo-access', { photo_id: secondId }), 'Access to a deleted photo');

    const finalSetup = await rpc(owner, 'get_my_matchmaking_setup');
    expect(finalSetup.profile?.status).toBe(beforeProfileStatus);
    expect(finalSetup.account?.profile_image_url).toBe(beforeCoreImage);
    expect(thirdId).toBeTruthy();
  } finally {
    // Retire only the photo IDs created by this test. Storage cleanup is queued
    // and is processed after the signed-upload grace period by the admin worker.
    if (profileIdentifier) {
      const current = await ownerPhotos(owner).catch(() => []);
      for (const photo of current) {
        if (createdPhotoIds.has(photo.id)) {
          await invoke(owner, 'matchmaking-photo-upload', { action: 'delete', photo_id: photo.id }).catch(() => undefined);
        }
      }
    }
    await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' }).catch(() => undefined)));
  }
});
