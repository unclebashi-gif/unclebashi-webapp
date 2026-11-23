# Wave 7 Trust & Verification checks

`npm run test:trust-verification` runs non-secret-dependent source/contract acceptance checks. It does not call Supabase or modify data.

`database-contract.sql` is read-only and can be run against a non-production database after the migration is deployed. The current implementation has no phone OTP provider or identity verification provider configured, so provider success, OTP rate-limit, and ID-review integration cases are intentionally unavailable and are not simulated.

Phone verification status is derived from Supabase Auth `phone_confirmed_at`; the complete number is not copied to application tables. Email status comes from Auth `email_confirmed_at`. ID metadata has no user-facing submission or review workflow in this wave; users cannot self-approve.

Both UI and Matchmaking enforcement flags default to off. Do not enable SMS/provider workflows or phone enforcement until a provider, abuse controls, and acceptance tests are configured.
