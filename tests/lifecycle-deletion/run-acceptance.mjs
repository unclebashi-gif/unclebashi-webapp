import { createClient } from '@supabase/supabase-js';

const required = [
  'TEST_SUPABASE_URL',
  'TEST_SUPABASE_ANON_KEY',
  'TEST_LIFECYCLE_USER_EMAIL',
  'TEST_LIFECYCLE_USER_PASSWORD',
  'TEST_LIFECYCLE_EXPECTED_USER_ID',
  'TEST_LIFECYCLE_BLOCK_TARGET_PROFILE_ID',
];
const missing = required.filter((key) => !process.env[key]);
if (process.env.TEST_LIFECYCLE_DELETION_ALLOW_MUTATIONS !== 'true' || missing.length) {
  console.error('Blocked: destructive lifecycle integration requires explicit opt-in and dedicated disposable test-account configuration.');
  if (missing.length) console.error(`Missing configuration names: ${missing.join(', ')}`);
  process.exitCode = 2;
} else {
  const client = createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: process.env.TEST_LIFECYCLE_USER_EMAIL,
    password: process.env.TEST_LIFECYCLE_USER_PASSWORD,
  });
  if (authError || !authData.user || authData.user.id !== process.env.TEST_LIFECYCLE_EXPECTED_USER_ID) {
    throw new Error('Blocked: authenticated disposable user did not match the explicitly expected UUID.');
  }
  console.log('Authenticated dedicated test user UUID matches expected identity. Tokens are not printed.');

  const { data: lifecycle, error: lifecycleError } = await client.rpc('get_account_lifecycle_status');
  if (lifecycleError) throw new Error(`Lifecycle status failed: ${lifecycleError.message}`);
  const status = Array.isArray(lifecycle) ? lifecycle[0] : lifecycle;
  if (!status || status.account_status !== 'active') throw new Error('Disposable test account must start active.');

  const { data: before, error: readinessError } = await client.rpc('get_account_deletion_readiness');
  if (readinessError) throw new Error(`Deletion readiness failed: ${readinessError.message}`);
  const readiness = Array.isArray(before) ? before[0] : before;
  if (!readiness || readiness.can_hard_delete !== false) throw new Error('Hard deletion must remain unavailable.');

  const { data: identityBefore, error: identityError } = await client
    .from('users').select('primary_reason_for_joining').eq('id', authData.user.id).single();
  if (identityError) throw new Error(`Could not verify onboarding reason: ${identityError.message}`);
  const { data: journeysBefore, error: journeysBeforeError } = await client
    .from('user_journeys').select('journey_type,status').eq('user_id', authData.user.id);
  if (journeysBeforeError) throw new Error(`Could not inspect journeys: ${journeysBeforeError.message}`);
  const { data: profileBefore, error: profileBeforeError } = await client
    .from('matchmaking_profiles').select('user_id').eq('user_id', authData.user.id).maybeSingle();
  if (profileBeforeError || !profileBefore) throw new Error('Disposable account must have a Matchmaking profile before this removal test.');
  const { data: blocksBefore, error: blocksBeforeError } = await client
    .from('matchmaking_blocks').select('blocked_user_id').eq('blocker_user_id', authData.user.id);
  if (blocksBeforeError) throw new Error(`Could not inspect the test account's own outgoing blocks: ${blocksBeforeError.message}`);
  const beforeBlockedIds = (blocksBefore ?? []).map((row) => row.blocked_user_id).sort();
  const { data: blockCreated, error: blockError } = await client.rpc('block_matchmaking_profile', {
    p_profile_identifier: process.env.TEST_LIFECYCLE_BLOCK_TARGET_PROFILE_ID,
  });
  if (blockError || blockCreated !== true) throw new Error('Could not establish the disposable outgoing block for lifecycle acceptance.');
  const { data: blocksPrepared, error: blocksPreparedError } = await client
    .from('matchmaking_blocks').select('blocked_user_id').eq('blocker_user_id', authData.user.id);
  if (blocksPreparedError) throw new Error(`Could not verify the prepared outgoing block: ${blocksPreparedError.message}`);
  const preparedBlockedIds = (blocksPrepared ?? []).map((row) => row.blocked_user_id).sort();
  if (preparedBlockedIds.length !== beforeBlockedIds.length + 1) {
    throw new Error('The configured block target must be a new, unblocked disposable Matchmaking profile.');
  }
  const { error: activateError } = await client.rpc('activate_user_journey', {
    p_journey_type: 'matchmaking', p_make_primary: false,
  });
  if (activateError) throw new Error(`Could not establish active disposable Matchmaking journey: ${activateError.message}`);
  const { data: paused, error: pauseError } = await client.rpc('set_user_journey_status', {
    p_journey_type: 'matchmaking', p_status: 'paused',
  });
  if (pauseError || !Array.isArray(paused) || paused[0]?.status !== 'paused') throw new Error('Journey pause did not succeed.');
  const { error: invalidTransitionError } = await client.rpc('set_user_journey_status', {
    p_journey_type: 'matchmaking', p_status: 'paused',
  });
  if (!invalidTransitionError) throw new Error('Expected repeated pause transition to be rejected.');
  const { data: resumed, error: resumeError } = await client.rpc('activate_user_journey', {
    p_journey_type: 'matchmaking', p_make_primary: false,
  });
  if (resumeError || !Array.isArray(resumed) || resumed[0]?.status !== 'active') throw new Error('Journey resume did not succeed.');

  const { data: deactivated, error: deactivateError } = await client.rpc('deactivate_my_account');
  if (deactivateError || deactivated !== 'deactivated') throw new Error(`Deactivation failed: ${deactivateError?.message ?? 'unexpected response'}`);
  const { data: deniedJourneyMutation, error: journeyError } = await client.rpc('set_user_journey_status', {
    p_journey_type: 'matchmaking', p_status: 'withdrawn',
  });
  if (!journeyError || deniedJourneyMutation) throw new Error('Expected deactivated account journey mutation to be denied.');
  const { data: reactivated, error: reactivateError } = await client.rpc('reactivate_my_account');
  if (reactivateError || reactivated !== 'active') throw new Error(`Reactivation failed: ${reactivateError?.message ?? 'unexpected response'}`);

  const { data: removal, error: removalError } = await client.rpc('delete_my_matchmaking_data');
  if (removalError) throw new Error(`Matchmaking removal failed: ${removalError.message}`);
  const removalResult = Array.isArray(removal) ? removal[0] : removal;
  if (!removalResult || !['withdrawn', 'completed', 'not_started'].includes(removalResult.journey_status)) {
    throw new Error('Matchmaking removal did not return a recognized safe journey state.');
  }
  const { data: profileAfter, error: profileAfterError } = await client
    .from('matchmaking_profiles').select('user_id').eq('user_id', authData.user.id);
  if (profileAfterError || (profileAfter?.length ?? 0) !== 0) throw new Error('Matchmaking profile remains after removal.');
  const { data: blocksAfter, error: blocksAfterError } = await client
    .from('matchmaking_blocks').select('blocked_user_id').eq('blocker_user_id', authData.user.id);
  if (blocksAfterError) throw new Error(`Could not verify retained outgoing blocks: ${blocksAfterError.message}`);
  const afterBlockedIds = (blocksAfter ?? []).map((row) => row.blocked_user_id).sort();
  if (JSON.stringify(afterBlockedIds) !== JSON.stringify(preparedBlockedIds)) {
    throw new Error('Outgoing Matchmaking blocks changed during participation removal.');
  }
  const { data: preferencesAfter, error: preferencesAfterError } = await client
    .from('matchmaking_preferences').select('user_id').eq('user_id', authData.user.id);
  if (preferencesAfterError || (preferencesAfter?.length ?? 0) !== 0) throw new Error('Matchmaking preferences remain after removal.');
  const { data: photosAfter, error: photosAfterError } = await client.rpc('get_my_matchmaking_photos');
  if (photosAfterError || !Array.isArray(photosAfter) || photosAfter.length !== 0) throw new Error('Matchmaking photos remain visible after removal.');
  const { data: journeysAfter, error: journeysAfterError } = await client
    .from('user_journeys').select('journey_type,status').eq('user_id', authData.user.id);
  if (journeysAfterError) throw new Error(`Could not recheck journeys: ${journeysAfterError.message}`);
  const retainedJourneysBefore = (journeysBefore ?? []).filter((journey) => journey.journey_type !== 'matchmaking').sort((a, b) => a.journey_type.localeCompare(b.journey_type));
  const retainedJourneysAfter = (journeysAfter ?? []).filter((journey) => journey.journey_type !== 'matchmaking').sort((a, b) => a.journey_type.localeCompare(b.journey_type));
  if (JSON.stringify(retainedJourneysBefore) !== JSON.stringify(retainedJourneysAfter)) throw new Error('Matchmaking removal changed another journey.');
  const { data: identityAfter, error: identityAfterError } = await client
    .from('users').select('primary_reason_for_joining').eq('id', authData.user.id).single();
  if (identityAfterError || identityAfter.primary_reason_for_joining !== identityBefore.primary_reason_for_joining) {
    throw new Error('Matchmaking removal changed the historical onboarding reason.');
  }
  const { data: readinessAfter, error: readinessAfterError } = await client.rpc('get_account_deletion_readiness');
  if (readinessAfterError) throw new Error('Could not recheck retained account/payment state.');
  const afterReadiness = Array.isArray(readinessAfter) ? readinessAfter[0] : readinessAfter;
  if (afterReadiness?.has_payment_history !== readiness.has_payment_history) throw new Error('Matchmaking removal changed payment history.');

  await client.auth.signOut({ scope: 'local' });
  console.log('PASS: deactivation blocks journey mutation; reactivation works; Matchmaking removal returned safely.');
}
