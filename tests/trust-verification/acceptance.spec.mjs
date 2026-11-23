import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261124000000_trust_verification_foundation.sql');
const features = read('src/config/features.ts');
const profile = read('src/components/profile/ProfilePage.tsx');
const panel = read('src/components/profile/TrustVerificationPanel.tsx');
const service = read('src/lib/verificationService.ts');
const matchmaking = read('src/components/matchmaking/MatchmakingHub.tsx');

test('verification table contains only minimized identity-provider metadata', () => {
  const table = migration.match(/create table public\.user_verifications \(([\s\S]*?)\n\);/i)?.[1];
  assert.ok(table, 'user_verifications table definition exists');
  for (const column of [
    'user_id', 'identity_status', 'identity_verified_at', 'identity_provider',
    'identity_provider_reference', 'identity_document_type', 'identity_rejection_reason',
  ]) assert.match(table, new RegExp(`\\b${column}\\b`));
  for (const forbidden of ['phone_e164', 'phone_last4', 'document_number', 'image_url', 'ocr_text', 'biometric']) {
    assert.doesNotMatch(table, new RegExp(forbidden, 'i'));
  }
  assert.match(table, /references auth\.users\(id\) on delete cascade/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.user_verifications from public, anon, authenticated, service_role/i);
});

test('owner RPC derives identity and projects only Auth-backed verified phone plus own identity status', () => {
  assert.match(migration, /create function public\.get_my_verification_status\(\)/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/i);
  assert.match(migration, /auth_user\.email_confirmed_at is not null/i);
  assert.match(migration, /auth_user\.phone_confirmed_at is not null/i);
  assert.match(migration, /pg_catalog\.right\(auth_user\.phone, 4\)/i);
  assert.match(migration, /verification_row\.user_id = auth_user\.id/i);
  assert.match(migration, /where auth_user\.id = v_actor/i);
  assert.match(migration, /revoke all on function public\.get_my_verification_status\(\)\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.get_my_verification_status\(\) to authenticated/i);
  assert.doesNotMatch(migration.match(/create function public\.get_my_verification_status\(\)([\s\S]*?)\$function\$;/i)?.[1] ?? '', /phone_e164|provider_reference|document_type/i);
});

test('UI flags default off; no SMS or document workflow can claim success', () => {
  assert.match(features, /trustVerificationUI: enabled\(import\.meta\.env\.VITE_TRUST_VERIFICATION_UI\)/);
  assert.match(features, /matchmakingPhoneVerificationEnforcement: enabled\(import\.meta\.env\.VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT\)/);
  assert.match(read('.env.example'), /VITE_TRUST_VERIFICATION_UI=false/);
  assert.match(read('.env.example'), /VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT=false/);
  assert.match(profile, /features\.trustVerificationUI && <div/);
  assert.match(matchmaking, /features\.trustVerificationUI && <TrustVerificationPanel matchmakingReadiness/);
  assert.match(panel, /Phone verification is not yet available/);
  assert.match(panel, /Optional ID verification is not yet available/);
  assert.doesNotMatch(panel, /verifyOtp|signInWithOtp|updateUser\(|upload\(/);
});

test('browser service calls the owner RPC without owner identifiers and allowlists the returned shape', () => {
  assert.match(service, /supabase\.rpc\('get_my_verification_status'\)/);
  assert.doesNotMatch(service, /user_id|auth\.uid|phone_e164|provider_reference/i);
  assert.match(service, /identityStatuses\.has/);
  assert.match(service, /phoneStatus !== 'unverified'/);
  assert.match(service, /\^•\{4\} \\d\{4\}\$/);
  assert.match(migration, /to_regprocedure\('public\.is_matchmaking_eligible\(uuid\)'\) is null/i);
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.is_matchmaking_eligible/i);
});

test('read-only database contract checks are included', () => {
  const contract = read('tests/trust-verification/database-contract.sql');
  assert.match(contract, /begin read only/i);
  assert.match(contract, /rollback/i);
  assert.match(contract, /get_my_verification_status/i);
  assert.match(contract, /is_matchmaking_eligible/i);
  assert.match(contract, /user_verifications/i);
});
