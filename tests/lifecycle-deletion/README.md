# Wave 8 Lifecycle and deletion acceptance

`npm run test:lifecycle-deletion` runs local static acceptance checks. It does not connect to Supabase or mutate data.

`database-contract.sql` is a read-only database contract. Run it only with a trusted read-only database connection after the migration has been deployed in a test project.

The hard-deletion UI flag is reserved only; no hard-delete RPC or account deletion action is implemented in this wave. Readiness therefore remains `can_hard_delete = false` for every account.

Journey transitions: all journey types support pause from active and resume via the existing activation RPC; Matchmaking, Marriage Support, Coaching, and Counselling can be withdrawn from active/paused; only completed Marriage Support/Coaching intakes can be marked complete. Education/preparation completion remains driven by course progress, and Counselling request status remains a separate workflow.

`npm run test:lifecycle-deletion:integration` is a separately gated destructive acceptance harness for a non-production Supabase project and dedicated disposable accounts. It requires `TEST_LIFECYCLE_DELETION_ALLOW_MUTATIONS=true`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_LIFECYCLE_USER_EMAIL`, `TEST_LIFECYCLE_USER_PASSWORD`, `TEST_LIFECYCLE_EXPECTED_USER_ID`, and `TEST_LIFECYCLE_BLOCK_TARGET_PROFILE_ID`. It never accepts or uses a service-role key. The Matchmaking removal step is irreversible; do not run this against production or any account with real user data.

The harness should be run only after a human has provisioned a disposable owner with an active Matchmaking journey/profile and an unblocked disposable target profile, then verified that the owner Auth UUID exactly matches the expected test UUID. It creates one outgoing block and verifies that the block remains after Matchmaking participation is removed.
