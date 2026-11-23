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
  expect(data.user?.id).toBeTruthy();
  const { data: verified, error: verifyError } = await client.auth.getUser();
  expect(verifyError, 'The authenticated test identity should verify.').toBeNull();
  expect(verified.user?.id).toBe(data.user.id);
  return { client, id: data.user.id };
}

async function rpc(client, name, args = {}) {
  return client.rpc(name, args);
}

test('owner-only Marriage Support and Coaching intake lifecycle', async () => {
  const owner = await login(env.TEST_SUPPORT_USER_EMAIL, env.TEST_SUPPORT_USER_PASSWORD);
  const other = await login(env.TEST_SUPPORT_OTHER_EMAIL, env.TEST_SUPPORT_OTHER_PASSWORD);
  const anonymous = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(anonymous);

  let originalJourneys = [];
  let journeysLoaded = false;
  try {
    const { data: journeyRows, error: journeyError } = await owner.client.from('user_journeys')
      .select('journey_type,status,is_primary').eq('user_id', owner.id)
      .in('journey_type', ['marriage_support', 'coaching']);
    expect(journeyError).toBeNull();
    originalJourneys = journeyRows ?? [];
    journeysLoaded = true;
    for (const type of ['marriage_support', 'coaching']) {
      expect(originalJourneys.find(row => row.journey_type === type)?.status,
        `The disposable test account must start with an active ${type} journey.`).toBe('active');
    }

    const sentinel = `W5_PRIVATE_INTAKE_${Date.now()}`;
    const marriageDraft = {
      support_areas: ['communication'], primary_concern: sentinel, desired_outcomes: null,
      partner_participation: null, preferred_support_path: null, timing_preference: null,
    };
    const { data: draft, error: draftError } = await rpc(owner.client, 'save_marriage_support_profile', { p_profile: marriageDraft });
    expect(draftError).toBeNull();
    expect(draft.intake_completed_at).toBeNull();
    const { data: persistedMarriage, error: loadMarriageError } = await rpc(owner.client, 'get_my_marriage_support_profile');
    expect(loadMarriageError).toBeNull();
    expect(persistedMarriage?.[0]?.primary_concern).toBe(sentinel);
    expect((await rpc(owner.client, 'complete_marriage_support_intake')).error).toBeTruthy();

    const completeMarriageDraft = { ...marriageDraft, desired_outcomes: 'More constructive conversations.', partner_participation: 'maybe', preferred_support_path: 'couple_support', timing_preference: 'exploring' };
    expect((await rpc(owner.client, 'save_marriage_support_profile', { p_profile: completeMarriageDraft })).error).toBeNull();
    const { data: marriageComplete, error: marriageCompleteError } = await rpc(owner.client, 'complete_marriage_support_intake');
    expect(marriageCompleteError).toBeNull();
    expect(marriageComplete.intake_completed_at).toBeTruthy();

    const invalidatedMarriage = { ...completeMarriageDraft, primary_concern: null };
    const { data: marriageAfterEdit, error: marriageEditError } = await rpc(owner.client, 'save_marriage_support_profile', { p_profile: invalidatedMarriage });
    expect(marriageEditError).toBeNull();
    expect(marriageAfterEdit.intake_completed_at).toBeNull();

    const coachingDraft = {
      focus_areas: ['communication_skills'], primary_goal: sentinel,
      desired_outcome: 'Build a steady practice.', preferred_format: 'individual',
      session_frequency: 'flexible', coach_gender_preference: 'no_preference', availability_notes: null,
    };
    expect((await rpc(owner.client, 'save_coaching_profile', { p_profile: coachingDraft })).error).toBeNull();
    const { data: coachingComplete, error: coachingCompleteError } = await rpc(owner.client, 'complete_coaching_intake');
    expect(coachingCompleteError).toBeNull();
    expect(coachingComplete.intake_completed_at).toBeTruthy();

    const discovery = await other.client.rpc('get_matchmaking_discovery', {
      p_limit: 20, p_cursor_created_at: null, p_cursor_user_id: null,
    });
    if (!discovery.error) expect(JSON.stringify(discovery.data)).not.toContain(sentinel);

    for (const table of ['marriage_support_profiles', 'coaching_profiles']) {
      const crossUser = await other.client.from(table).select('user_id').eq('user_id', owner.id);
      expect(Boolean(crossUser.error) || (crossUser.data ?? []).length === 0,
        `Another member must not read the owner's ${table}.`).toBeTruthy();
      const anonRead = await anonymous.from(table).select('user_id').eq('user_id', owner.id);
      expect(Boolean(anonRead.error) || (anonRead.data ?? []).length === 0,
        `Anonymous callers must not read ${table}.`).toBeTruthy();
    }
    expect((await rpc(anonymous, 'get_my_marriage_support_profile')).error).toBeTruthy();
    expect((await rpc(anonymous, 'get_my_coaching_profile')).error).toBeTruthy();

    for (const type of ['marriage_support', 'coaching']) {
      expect((await rpc(owner.client, 'set_user_journey_status', { p_journey_type: type, p_status: 'paused' })).error).toBeNull();
      const readName = type === 'marriage_support' ? 'get_my_marriage_support_profile' : 'get_my_coaching_profile';
      const readAfterPause = await rpc(owner.client, readName);
      expect(readAfterPause.error).toBeNull();
      expect(readAfterPause.data?.length).toBe(1);
      const saveName = type === 'marriage_support' ? 'save_marriage_support_profile' : 'save_coaching_profile';
      const saveBody = type === 'marriage_support' ? { p_profile: completeMarriageDraft } : { p_profile: coachingDraft };
      expect((await rpc(owner.client, saveName, saveBody)).error,
        `A paused ${type} journey must reject intake edits.`).toBeTruthy();
      const completeName = type === 'marriage_support' ? 'complete_marriage_support_intake' : 'complete_coaching_intake';
      expect((await rpc(owner.client, completeName)).error,
        `A paused ${type} journey must reject intake completion.`).toBeTruthy();
      expect((await rpc(owner.client, 'activate_user_journey', { p_journey_type: type, p_make_primary: false })).error).toBeNull();
    }
  } finally {
    if (journeysLoaded) {
      for (const original of originalJourneys) {
        if (original.status === 'active') {
          await rpc(owner.client, 'activate_user_journey', {
            p_journey_type: original.journey_type, p_make_primary: original.is_primary,
          }).catch(() => undefined);
        } else if (original.status === 'paused') {
          await rpc(owner.client, 'set_user_journey_status', {
            p_journey_type: original.journey_type, p_status: 'paused',
          }).catch(() => undefined);
        }
      }
    }
    await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' }).catch(() => undefined)));
  }
});
