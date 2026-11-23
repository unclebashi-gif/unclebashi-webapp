# Marriage Support and Coaching intake acceptance

The RPC lifecycle suite is opt-in and mutates only the two Wave 5 intake
records plus active/paused state for the dedicated test user's existing
`marriage_support` and `coaching` journeys. It never uses a service-role key
and does not edit Core Profile, Matchmaking, payments, bookings, or Auth data.

Use a dedicated non-production project and two disposable ordinary accounts.
The support account must have completed onboarding, an eligible married or
separated Core Profile, and both journeys active before running the suite.
The second ordinary account is used for cross-user privacy checks. The suite
restores journey active/paused and primary state after pausing. Intake answers
created during the run remain on the disposable test account; there is
intentionally no client delete path for private intake records.

Set `TEST_SUPPORT_COACHING_ALLOW_MUTATIONS=true` only after confirming the
project and accounts are disposable, then run:

```powershell
npm.cmd run test:support-coaching
```

The guarded script requires local `.env.test` values and prints missing
variable names only. It never prints credentials or access tokens.

## Read-only database contract

The script starts a read-only transaction and rolls it back:

```powershell
psql "$env:TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/support-coaching/database-contract.sql
```

It checks private-table RLS/direct privileges, intake constraints, RPC
authorization shape, empty `search_path`, private Matchmaking projections,
unchanged eligibility, and continued presence of the Wave 4 photo objects.
