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
4. The project must have the Wave 4A foundation and member-projection migration
   applied, and the photo Edge Functions deployed to that test project.
5. Install the browser once (PowerShell):

   ```powershell
   $env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path (Get-Location) '.playwright-browsers')
   npx.cmd playwright install chromium --only-shell
   ```

## Run

```powershell
npm.cmd run test:matchmaking-photos
```

The end-to-end test checks upload/finalize, owner and member privacy, moderation,
rejection feedback, replacement lifecycle, reorder, slot limit, deletion, Core
image and biodata moderation preservation, plus anonymous denial. It logically
retires only photo rows it created. Storage objects enter the normal two-hour
cleanup queue and are removed by the cleanup worker after the signed-upload
grace period.

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
the private WebP bucket, browser/service-role grants, photo RPC grants, and that
the existing eligibility function has not gained photo-count logic.
