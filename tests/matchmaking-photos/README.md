# Matchmaking photo acceptance

This suite is deliberately opt-in and is not part of `npm test` or the normal
build. It mutates photo rows only for the dedicated accounts configured in
`.env.test`; it never uses a service-role key and never changes profiles,
roles, or account settings.

## Configure

1. Use a dedicated non-production Supabase project and copy `.env.test.example`
   to `.env.test`.
2. Provide an owner account with an approved Matchmaking profile and no active
   Matchmaking photos, an eligible ordinary member who can view that owner, and
   an admin account. All three identities must be distinct disposable test
   accounts.
3. Set `TEST_MATCHMAKING_PHOTOS_ALLOW_MUTATIONS=true` only after confirming the
   URL and accounts are disposable. The suite prints variable names only, never
   passwords, JWTs, or signed URLs.
4. The project must have the Wave 4A foundation, member-projection, cleanup
   conflict correction, and `20261127000000_matchmaking_photo_release_refinements.sql`
   migrations applied, and the updated photo Edge Functions deployed to that test project.
5. Install the browser once (PowerShell):

   ```powershell
   $env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path (Get-Location) '.playwright-browsers')
   npx.cmd playwright install chromium --only-shell
   ```

## Run

```powershell
npm.cmd run test:matchmaking-photos
```

New uploads publish only after the authenticated Edge Function verifies
Storage metadata and the bounded RIFF/WebP container, then calls the new
service-role-only, versioned finalizer signature. The legacy finalizer signature
is removed so an older deployed upload function fails closed. This container
check is not a full decoder or content moderation service. Historical
pending/rejected rows are not auto-approved. Admin/moderator controls can
publish legacy pending rows, reject pending or published rows, and remove
published rows with a reason.

The end-to-end test checks upload/finalize, owner and eligible-member privacy,
automatic publication, moderation/rejection/removal, replacement lifecycle,
reorder/primary ordering, slot limit, deletion, Core image and biodata
moderation preservation, plus anonymous denial. It logically retires only photo
rows it created. Storage objects enter the normal two-hour cleanup queue and
are removed by the cleanup worker after the signed-upload grace period. The
suite does not create a historical pending row, so legacy approval remains a
database-contract/manual acceptance item.

The image normalization test can run without Supabase credentials:

```powershell
npx.cmd playwright test tests/matchmaking-photos/image-normalization.spec.mjs --config=playwright.config.mjs
```

It requires the local Vite app at `http://localhost:8080` (or `TEST_BASE_URL`)
and the Playwright browser installed.

## Read-only database contract

Use a read-only PostgreSQL connection and run:

```powershell
psql "$env:TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/matchmaking-photos/database-contract.sql
```

The SQL script starts a read-only transaction and rolls it back. It checks RLS,
the private WebP bucket, publication metadata, browser/service-role grants,
photo RPC grants, automatic finalizer/admin moderation behavior, and that the
existing eligibility function has not gained photo-count logic.

Both `VITE_MATCHMAKING_PHOTOS_UI` and
`VITE_MATCHMAKING_PHOTOS_DISCOVERY` must remain false until human acceptance
and the cleanup-operations gate pass. Matchmaking eligibility has no minimum
photo-count requirement.
