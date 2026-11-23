# Counselling Gateway acceptance

The API mutation suite is opt-in and should run only against a non-production Supabase project with dedicated ordinary test accounts plus a dedicated admin or moderator account. The primary account must have an active `counselling` journey and no open request; the second account must have no open request. The suite checks paused drafts remain read-only, a paused owner can withdraw a submitted request, another owner cannot withdraw it, withdrawn/closed requests cannot be withdrawn again, and a withdrawal leaves the operational queue. It changes only counselling request rows and temporarily pauses/resumes the primary account's Counselling journey; it restores the original active/primary state. It does not change Auth, Core Profile, onboarding, payments, coaching, Matchmaking, or photo records.

Copy `.env.test.example` to `.env.test` and fill it locally. Never print credentials or tokens. Set `TEST_COUNSELLING_GATEWAY_ALLOW_MUTATIONS=true` only after confirming the project and accounts are disposable, then run:

```powershell
npm.cmd run test:counselling-gateway
```

The browser UI test is optional. `TEST_COUNSELLING_GATEWAY_UI_URL` should point to a local application build with `VITE_COUNSELLING_GATEWAY=true`; the test uses the dedicated user to sign in and only exercises the local form state. `TEST_COUNSELLING_GATEWAY_OFF_URL` may point to a local build with the flag off to verify the information-only page.

The database contract script is read-only and rolls back its transaction:

```powershell
psql "$env:TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/counselling-gateway/database-contract.sql
```

It checks RLS/direct privileges, request constraints, owner and operational RPC security/grants, role checks, projection boundaries, and continued presence/isolation of Matchmaking, Wave 4 photo, and Wave 5 intake objects.

## Emergency resource launch gate

The UI deliberately shows only general guidance and no phone numbers. Before public launch, verify country-specific emergency resources for Uganda, Kenya, Rwanda, and Canada against authoritative local sources, document the reviewed source/date, and approve the copy. Do not invent or AI-generate emergency contact numbers. Until verified resources are approved, keep the general direction to contact local emergency services or go to the nearest emergency department.
