import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261124010000_journey_lifecycle_account_controls.sql');
const features = read('../../src/config/features.ts');
const panel = read('../../src/components/profile/AccountLifecyclePanel.tsx');
const appLayout = read('../../src/components/AppLayout.tsx');
const journeys = read('../../src/components/dashboard/MyJourneys.tsx');
const integration = read('./run-acceptance.mjs');
const paymentFoundation = read('../../supabase/migrations/20261003020000_payments_foundation.sql');

describe('Wave 8 lifecycle/deletion static acceptance', () => {
  it('keeps all new account and removal RPCs owner-derived and definer-scoped', () => {
    for (const rpc of ['deactivate_my_account', 'reactivate_my_account', 'get_account_deletion_readiness', 'delete_my_matchmaking_data']) {
      assert.match(migration, new RegExp(`create function public\\.${rpc}\\(\\)`));
    }
    assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
    assert.match(migration, /security definer\s+set search_path = ''/i);
    assert.match(migration, /revoke all on function public\.delete_my_matchmaking_data\(\) from public, anon, authenticated, service_role/i);
    assert.match(migration, /grant execute on function public\.delete_my_matchmaking_data\(\) to authenticated/i);
    assert.doesNotMatch(migration, /delete from public\.payments/i);
  });

  it('preserves payment history and keeps hard deletion unavailable', () => {
    assert.match(paymentFoundation, /user_id uuid not null references auth\.users\s*\(id\) on delete restrict/i);
    assert.match(migration, /payments\.user_id must continue to restrict Auth-user deletion/i);
    assert.match(migration, /return query select false, v_has_payments/i);
    assert.match(migration, /hard_delete_feature_disabled/);
    assert.doesNotMatch(migration, /auth\.admin|delete_user|delete from auth\.users/i);
  });

  it('uses the existing photo delete trigger and does not expose Storage paths', () => {
    assert.match(migration, /delete from public\.matchmaking_photos as photo_row where photo_row\.user_id = v_actor/i);
    assert.match(migration, /matchmaking_photos_queue_storage_cleanup/);
    assert.doesNotMatch(migration, /storage_path|reviewed_by/);
    assert.match(migration, /matchmaking_interests as interest_row[\s\S]*?status = 'withdrawn'/);
    assert.doesNotMatch(migration, /delete from public\.matchmaking_blocks/i);
    assert.match(migration, /safety_and_moderation_records/);
    assert.match(panel, /Safety and moderation records such as blocks or reports may be retained/);
    assert.match(integration, /Outgoing Matchmaking blocks changed during participation removal/);
    assert.match(integration, /blocksAfter/);
  });

  it('constrains journey transitions and retains database-side account status enforcement', () => {
    assert.match(migration, /v_account_status <> 'active'/);
    assert.match(migration, /p_status = 'paused' and v_journey\.status <> 'active'/);
    assert.match(migration, /p_journey_type not in \('marriage_support', 'coaching'\)/);
    assert.match(migration, /p_journey_type not in \('matchmaking', 'marriage_support', 'coaching', 'counselling'\)/);
    assert.match(migration, /intake_completed_at is not null/);
    assert.match(migration, /status = 'withdrawn'/);
    assert.doesNotMatch(migration, /primary_reason_for_joining\s*=/i);
    const removal = migration.slice(migration.indexOf('create function public.delete_my_matchmaking_data()'));
    assert.ok(removal.indexOf('pg_advisory_xact_lock') < removal.indexOf('for update'));
  });

  it('leaves lifecycle UI disabled by default and gates protected routes for deactivated accounts', () => {
    assert.match(features, /accountLifecycleUI: enabled\(import\.meta\.env\.VITE_ACCOUNT_LIFECYCLE_UI\)/);
    assert.match(features, /hardAccountDeletion: enabled\(import\.meta\.env\.VITE_HARD_ACCOUNT_DELETION\)/);
    const example = read('../../.env.example');
    assert.match(example, /VITE_ACCOUNT_LIFECYCLE_UI=false/);
    assert.match(example, /VITE_HARD_ACCOUNT_DELETION=false/);
    assert.match(panel, /window\.confirm\(/);
    assert.match(appLayout, /user\.accountStatus !== 'active'/);
    assert.match(journeys, /features\.accountLifecycleUI/);
  });
});
