import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const clients = [];

async function login(email, password) {
  const client = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(client);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  expect(error, 'The dedicated test account should authenticate.').toBeNull();
  const { data: verified, error: verifyError } = await client.auth.getUser();
  expect(verifyError).toBeNull();
  expect(verified.user?.id).toBe(data.user?.id);
  return { client, id: data.user.id };
}

const rpc = (client, name, args = {}) => client.rpc(name, args);

test('owner, privacy, pause, withdraw, and operational counselling request lifecycle', async () => {
  test.skip(env.TEST_COUNSELLING_GATEWAY_ALLOW_MUTATIONS !== 'true', 'Credentialed mutation suite is opt-in.');
  const owner = await login(env.TEST_COUNSELLING_USER_EMAIL, env.TEST_COUNSELLING_USER_PASSWORD);
  const other = await login(env.TEST_COUNSELLING_OTHER_EMAIL, env.TEST_COUNSELLING_OTHER_PASSWORD);
  const anonymous = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(anonymous);
  const admin = await login(env.TEST_COUNSELLING_ADMIN_EMAIL, env.TEST_COUNSELLING_ADMIN_PASSWORD);
  let originalJourney = null;
  let journeyLoaded = false;
  let requestId = null;

  try {
    expect(owner.id).not.toBe(other.id);
    expect(admin.id).not.toBe(owner.id);
    expect(admin.id).not.toBe(other.id);
    const { data: journey, error: journeyError } = await owner.client.from('user_journeys')
      .select('status,is_primary').eq('user_id', owner.id).eq('journey_type', 'counselling').maybeSingle();
    expect(journeyError).toBeNull();
    expect(journey?.status, 'The disposable owner account must have an active Counselling journey.').toBe('active');
    originalJourney = journey;
    journeyLoaded = true;

    const before = await rpc(owner.client, 'get_my_counselling_request');
    expect(before.error).toBeNull();
    const current = Array.isArray(before.data) ? before.data[0] : before.data;
    expect(!current || ['closed', 'withdrawn'].includes(current.status),
      'Use a dedicated test account without an open counselling request.').toBeTruthy();
    const otherBefore = await rpc(other.client, 'get_my_counselling_request');
    expect(otherBefore.error).toBeNull();
    const otherCurrent = Array.isArray(otherBefore.data) ? otherBefore.data[0] : otherBefore.data;
    expect(!otherCurrent || ['closed', 'withdrawn'].includes(otherCurrent.status),
      'Use a dedicated second account without an open counselling request.').toBeTruthy();

    const sentinel = `CGW_PRIVATE_TEST_${Date.now()}`;
    const incomplete = {
      support_type: 'couples_counselling', preferred_contact_method: 'email', contact_phone: null,
      preferred_time_notes: null, country_code: null, brief_reason: null,
      partner_participation: 'not_sure', urgency_self_description: 'routine', consent_to_contact: false,
    };
    const { data: draft, error: saveError } = await rpc(owner.client, 'save_counselling_request', { p_request: incomplete });
    expect(saveError).toBeNull();
    requestId = draft.id;
    expect(draft.status).toBe('draft');
    expect((await rpc(owner.client, 'get_my_counselling_request')).data?.[0]?.id).toBe(requestId);
    expect((await rpc(owner.client, 'submit_counselling_request')).error).toBeTruthy();

    expect((await rpc(owner.client, 'set_user_journey_status', { p_journey_type: 'counselling', p_status: 'paused' })).error).toBeNull();
    expect((await rpc(owner.client, 'get_my_counselling_request')).data?.[0]?.status).toBe('draft');
    expect((await rpc(owner.client, 'save_counselling_request', { p_request: incomplete })).error).toBeTruthy();
    expect((await rpc(owner.client, 'submit_counselling_request')).error).toBeTruthy();
    expect((await rpc(owner.client, 'withdraw_counselling_request')).error).toBeTruthy();
    expect((await rpc(owner.client, 'activate_user_journey', { p_journey_type: 'counselling', p_make_primary: originalJourney.is_primary })).error).toBeNull();

    const complete = { ...incomplete, country_code: 'UG', brief_reason: sentinel, consent_to_contact: true };
    expect((await rpc(owner.client, 'save_counselling_request', { p_request: complete })).error).toBeNull();
    const submitted = await rpc(owner.client, 'submit_counselling_request');
    expect(submitted.error).toBeNull();
    expect(submitted.data.status).toBe('submitted');
    expect(submitted.data.submitted_at).toBeTruthy();

    const crossUser = await other.client.from('counselling_requests').select('id').eq('id', requestId);
    expect(Boolean(crossUser.error) || (crossUser.data ?? []).length === 0).toBeTruthy();
    const anonymousRead = await anonymous.from('counselling_requests').select('id').eq('id', requestId);
    expect(Boolean(anonymousRead.error) || (anonymousRead.data ?? []).length === 0).toBeTruthy();
    const directMutation = await owner.client.from('counselling_requests').update({ status: 'closed' }).eq('id', requestId).select('id');
    expect(Boolean(directMutation.error) || (directMutation.data ?? []).length === 0).toBeTruthy();
    for (const rpcName of ['get_my_counselling_request', 'submit_counselling_request', 'get_counselling_request_queue']) {
      expect((await rpc(anonymous, rpcName, rpcName === 'get_counselling_request_queue' ? { p_status: null, p_limit: 20 } : {})).error).toBeTruthy();
    }
    expect((await rpc(owner.client, 'get_counselling_request_queue', { p_status: null, p_limit: 20 })).error).toBeTruthy();
    expect((await rpc(other.client, 'withdraw_counselling_request')).error).toBeTruthy();
    expect((await rpc(owner.client, 'get_my_counselling_request')).data?.[0]?.status).toBe('submitted');

    expect((await rpc(owner.client, 'set_user_journey_status', { p_journey_type: 'counselling', p_status: 'paused' })).error).toBeNull();
    expect((await rpc(owner.client, 'get_my_counselling_request')).data?.[0]?.status).toBe('submitted');
    expect((await rpc(owner.client, 'save_counselling_request', { p_request: complete })).error).toBeTruthy();
    expect((await rpc(owner.client, 'submit_counselling_request')).error).toBeTruthy();
    const pausedWithdraw = await rpc(owner.client, 'withdraw_counselling_request');
    expect(pausedWithdraw.error).toBeNull();
    expect(pausedWithdraw.data.status).toBe('withdrawn');
    expect(pausedWithdraw.data.submitted_at).toBe(submitted.data.submitted_at);
    expect(pausedWithdraw.data.withdrawn_at).toBeTruthy();
    expect((await rpc(owner.client, 'withdraw_counselling_request')).error).toBeTruthy();
    expect((await rpc(owner.client, 'get_my_counselling_request')).data?.[0]?.status).toBe('withdrawn');
    const withdrawnQueue = await rpc(admin.client, 'get_counselling_request_queue', { p_status: null, p_limit: 100 });
    expect(withdrawnQueue.error).toBeNull();
    expect(withdrawnQueue.data.some((row) => row.request_id === requestId)).toBeFalsy();
    requestId = null;
    expect((await rpc(owner.client, 'activate_user_journey', { p_journey_type: 'counselling', p_make_primary: originalJourney.is_primary })).error).toBeNull();

    const second = await rpc(owner.client, 'save_counselling_request', { p_request: complete });
    expect(second.error).toBeNull();
    requestId = second.data.id;
    expect((await rpc(owner.client, 'submit_counselling_request')).error).toBeNull();
    const { data: roles, error: rolesError } = await admin.client.from('user_roles').select('role').eq('user_id', admin.id);
    expect(rolesError).toBeNull();
    expect(roles?.some((row) => ['admin', 'moderator'].includes(row.role))).toBeTruthy();
    const queue = await rpc(admin.client, 'get_counselling_request_queue', { p_status: null, p_limit: 100 });
    expect(queue.error).toBeNull();
    expect(queue.data.some((row) => row.request_id === requestId && row.brief_reason === complete.brief_reason)).toBeTruthy();
    expect((await rpc(admin.client, 'update_counselling_request_status', { p_request_id: requestId, p_status: 'referred' })).error).toBeTruthy();
    expect((await rpc(admin.client, 'update_counselling_request_status', { p_request_id: requestId, p_status: 'under_review' })).data).toBe('under_review');
    expect((await rpc(admin.client, 'update_counselling_request_status', { p_request_id: requestId, p_status: 'contacted' })).data).toBe('contacted');
    expect((await rpc(admin.client, 'update_counselling_request_status', { p_request_id: requestId, p_status: 'referred' })).data).toBe('referred');
    expect((await rpc(admin.client, 'update_counselling_request_status', { p_request_id: requestId, p_status: 'closed' })).data).toBe('closed');
    expect((await rpc(owner.client, 'withdraw_counselling_request')).error).toBeTruthy();
    expect((await rpc(owner.client, 'get_my_counselling_request')).data?.[0]?.status).toBe('closed');
    requestId = null;
  } finally {
    if (journeyLoaded && originalJourney?.status === 'active') {
      await rpc(owner.client, 'activate_user_journey', {
        p_journey_type: 'counselling', p_make_primary: originalJourney.is_primary,
      });
    }
    if (requestId && journeyLoaded) {
      const latest = await rpc(owner.client, 'get_my_counselling_request');
      const status = latest.data?.[0]?.status;
      if (['submitted', 'under_review', 'contacted'].includes(status)) await rpc(owner.client, 'withdraw_counselling_request');
      else if (status === 'referred') {
        await rpc(admin.client, 'update_counselling_request_status', { p_request_id: requestId, p_status: 'closed' });
      } else if (status === 'draft') {
        const cleanupDraft = {
          support_type: 'couples_counselling', preferred_contact_method: 'email', contact_phone: null,
          preferred_time_notes: null, country_code: 'UG', brief_reason: 'Acceptance cleanup',
          partner_participation: 'not_sure', urgency_self_description: 'routine', consent_to_contact: true,
        };
        const saved = await rpc(owner.client, 'save_counselling_request', { p_request: cleanupDraft });
        if (!saved.error) {
          const submitted = await rpc(owner.client, 'submit_counselling_request');
          if (!submitted.error) await rpc(owner.client, 'withdraw_counselling_request');
        }
      }
    }
    await Promise.all(clients.map((client) => client.auth.signOut({ scope: 'local' }).catch(() => undefined)));
  }
});

test('feature-flagged gateway immediately presents safe emergency guidance', async ({ page }) => {
  test.skip(!env.TEST_COUNSELLING_GATEWAY_UI_URL, 'Set TEST_COUNSELLING_GATEWAY_UI_URL to a local build with the gateway flag on.');
  test.skip(!env.TEST_COUNSELLING_USER_EMAIL || !env.TEST_COUNSELLING_USER_PASSWORD, 'Dedicated UI test credentials are not configured.');
  await page.goto(`${env.TEST_COUNSELLING_GATEWAY_UI_URL}/counselling`);
  const signInButton = page.getByRole('button', { name: /^sign in$/i }).first();
  if (await signInButton.isVisible().catch(() => false)) {
    await signInButton.click();
    await page.getByPlaceholder('you@example.com').fill(env.TEST_COUNSELLING_USER_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(env.TEST_COUNSELLING_USER_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: /welcome back|courses|learning/i })).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
  }
  await page.goto(`${env.TEST_COUNSELLING_GATEWAY_UI_URL}/counselling`);
  await expect(page.getByRole('heading', { name: 'Request a human follow-up' })).toBeVisible();
  await page.getByLabel('I am in immediate danger').check();
  await expect(page.getByRole('alert').getByText(/not an emergency service/i)).toBeVisible();
  await expect(page.getByRole('alert').getByText(/local emergency services/i)).toBeVisible();
  await expect(page.getByRole('alert').getByText(/not monitored in real time/i)).toBeVisible();
});

test('feature flag off preserves the existing information-only Counselling page', async ({ page }) => {
  test.skip(!env.TEST_COUNSELLING_GATEWAY_OFF_URL, 'Set TEST_COUNSELLING_GATEWAY_OFF_URL to a local build with the gateway flag off.');
  await page.goto(`${env.TEST_COUNSELLING_GATEWAY_OFF_URL}/counselling`);
  await expect(page.getByText(/not currently accepting counselling bookings/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request a human follow-up' })).toHaveCount(0);
});
