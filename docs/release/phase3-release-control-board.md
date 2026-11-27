# Phase 3 Release Control Board

**Purpose:** single release-evidence register for the Phase 3 release candidate. This board separates local/static evidence, earlier reported acceptance, and fresh human RC acceptance. A migration file in this repository is not evidence that the migration was applied remotely.

**Snapshot:** 2026-11-25
**Branch at audit start:** `phase3-release-candidate`
**HEAD at audit start:** `541def4ac83e8fc17e01b26ed9b555b142b3a7a7` (`Merge Wave 8 lifecycle and deletion controls`)
**Working tree at audit start:** clean. The control board, runner, and package script are the only intended changes made by this release-mode task.
**Overall recommendation:** **NO-GO for unrestricted or paid-course production launch today.** RC-11 and RC-14 have concrete readiness gaps. Other product domains still require fresh RC human acceptance; historical results are not substituted for it.

## Evidence rules

- `AUTOMATED PASS` means a local non-destructive check completed. It does not establish remote deployment, operational readiness, or user acceptance.
- Historical results reported in prior work are identified as historical and must be reconfirmed during the RC sessions below.
- Remote migration status, production secrets, provider setup, and runtime behavior are not inferred from source files.
- No production configuration, feature flag, database, Edge Function, or payment provider was changed in this release-mode task.

## Establishment baseline

| Item | Observed |
|---|---|
| Branch / HEAD | `phase3-release-candidate` / `541def4ac83e8fc17e01b26ed9b555b142b3a7a7` |
| Working tree before this task | Clean |
| Node / npm | Node `v24.21.0`; npm `11.19.0` |
| Runtime package versions | `@supabase/supabase-js` `2.110.2`; transitive `@supabase/auth-js` `2.110.2`; React / React DOM `18.3.1`; Vite `5.4.21`; TypeScript package range `^5.5.3` |
| Auth architecture | Supabase Auth session is checked with `auth.getUser(access_token)` before account state is loaded by `loadIdentity()`. Identity/roles/onboarding/journeys come from the database projection. Invalid Auth state is locally cleared, with version guards against stale restoration work. App route guards remain UX; database RLS/RPC authorization is authoritative. |
| Local feature overrides | No Phase 3 release flags were explicitly set in `.env.local` at audit. `.env.example` specifies all nine flags as `false`; the centralized `enabled()` helper enables only the literal string `true`. No secret values were read or reported. |
| Supabase CLI / remote link | `supabase` CLI is not installed on PATH. No remote migration dry run was attempted; local migration state is not a deployment record. |

## RC-00 — Repository / build baseline

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-00 / repository, build, package integrity |
| Requirement | Verify RC branch/HEAD, clean initial tree, lint, TypeScript, production build, diff whitespace, and package/test script integrity. |
| Existing automated evidence | The initial checkout was clean on the expected branch. `test:release-baseline` runs lint, `npx tsc --noEmit`, production build, and the local static Trust and Lifecycle suites. It also validates migration filename timestamps/uniqueness/order, flag defaults, and key security boundaries. |
| Required human evidence | Review the final release-control diff; confirm only expected release artifacts are present; check clean status after the eventual release-control commit. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Automated check results are recorded in the final task report. This task intentionally leaves the release-control artifacts uncommitted, so the final clean/committed tree check remains outstanding. |
| Relevant feature flag | None |
| Final activation decision | No activation. |

## RC-01 — Database / migration integrity

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-01 / Supabase schema and migration history |
| Requirement | Review chronological migration inventory, duplicate versions, known repair history, Wave 4–8 objects, and compare local migrations to the remote migration history without mutation. |
| Existing automated evidence | The release runner checks all local migration filenames are timestamped, unique, and chronologically ordered. The local inventory contains 42 migrations after adding the unapplied Wave 4A publication/access refinement. Source includes Wave 4 photo foundation plus an incremental cleanup-conflict correction, Wave 5 support/coaching, Wave 6 counselling, Wave 7 trust, and Wave 8 lifecycle. |
| Required human evidence | Use an authorized read-only project/schema review after CLI/link availability; reconcile remote migration history with the complete local list; execute each database contract only against an approved non-production schema using read-only credentials. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Remote status is **unknown**. `supabase` CLI is not installed or linked in this checkout. No `db push`, migration repair, SQL execution, or remote configuration change was performed. |
| Relevant feature flag | Domain-specific flags in RC-05 through RC-09 |
| Final activation decision | Do not enable dependent features until remote migrations and their postconditions are verified. |

### Local migration inventory (chronological; deployment state unknown)

| Version | Migration | Area / release note |
|---|---|---|
| 20260926000000 | `20260926000000_initial_identity_onboarding.sql` | Identity, onboarding, roles |
| 20260927000000 | `20260927000000_save_onboarding_data_rpc.sql` | Onboarding save RPC |
| 20260927010000 | `20260927010000_fix_complete_onboarding_jsonb_validation.sql` | Onboarding validation correction |
| 20260928000000 | `20260928000000_education_foundation.sql` | Education schema and access |
| 20260928010000 | `20260928010000_seed_free_overview_course.sql` | Free course seed |
| 20260928020000 | `20260928020000_restricted_cms_content_role.sql` | Legacy CMS role privileges |
| 20260929000000 | `20260929000000_community_foundation.sql` | Community |
| 20260929010000 | `20260929010000_coaching_foundation.sql` | Coaching foundation |
| 20260930000000 | `20260930000000_matchmaking_foundation.sql` | Matchmaking foundation |
| 20261003000000 | `20261003000000_matchmaking_review_privacy_and_queue.sql` | Matchmaking review/admin privacy |
| 20261003010000 | `20261003010000_matchmaking_gender_enforcement.sql` | Server-side matchmaking gender eligibility |
| 20261003020000 | `20261003020000_payments_foundation.sql` | Course payments foundation |
| 20261003030000 | `20261003030000_payment_provider_terms.sql` | Provider amount/currency snapshots |
| 20261011000000 | `20261011000000_fix_admin_payments_email_type.sql` | Admin payment projection type correction |
| 20261011010000 | `20261011010000_admin_operational_overview.sql` | Admin projections |
| 20261011020000 | `20261011020000_education_audience_gender.sql` | Education audience eligibility |
| 20261011030000 | `20261011030000_admin_course_commercial_terms.sql` | Admin course pricing authority |
| 20261011040000 | `20261011040000_payment_environment_and_launch_cleanup.sql` | Payment provider environment / test-course cleanup |
| 20261018010000 | `20261018010000_pesapal_course_payments.sql` | PesaPal course payments |
| 20261019010000 | `20261019010000_admin_course_manager_audience.sql` | Admin course manager audience |
| 20261020000000 | `20261020000000_fix_matchmaking_admin_review_history.sql` | Matchmaking admin review history correction |
| 20261021000000 | `20261021000000_secure_course_publication.sql` | Publication / status privilege hardening |
| 20261021010000 | `20261021010000_admin_course_module_management.sql` | Admin course modules |
| 20261021020000 | `20261021020000_admin_course_lesson_management.sql` | Admin course lessons |
| 20261024000000 | `20261024000000_course_module_publication_readiness.sql` | Module publication readiness |
| 20261024010000 | `20261024010000_admin_remove_empty_course_module.sql` | Safe removal of empty modules |
| 20261024020000 | `20261024020000_fix_free_course_enrollment_ambiguity.sql` | Enrollment UPSERT ambiguity correction |
| 20261024030000 | `20261024030000_retire_legacy_cms_role.sql` | Legacy CMS role retirement |
| 20261031000000 | `20261031000000_core_profile_user_journeys.sql` | Core profile and journeys |
| 20261031010000 | `20261031010000_core_onboarding_v2_journey_adoption.sql` | Onboarding v2 and journey adoption |
| 20261101000000 | `20261101000000_core_profile_editor_permissions.sql` | Core profile editor column privileges |
| 20261101010000 | `20261101010000_reconcile_core_profile_journeys.sql` | Profile/journey reconciliation |
| 20261101020000 | `20261101020000_matchmaking_v2_biodata_preferences.sql` | Matchmaking v2 profile/preferences |
| 20261101030000 | `20261101030000_matchmaking_public_names_and_review_snapshots.sql` | Public-name projection and review snapshots |
| 20261122000000 | `20261122000000_matchmaking_photos_foundation.sql` | Wave 4A photo foundation |
| 20261122010000 | `20261122010000_fix_matchmaking_photo_cleanup_conflict.sql` | Photo cleanup conflict-target correction |
| 20261123000000 | `20261123000000_matchmaking_photo_member_projection.sql` | Approved-photo member projection |
| 20261123010000 | `20261123010000_marriage_support_coaching_intake.sql` | Wave 5 private intakes |
| 20261123020000 | `20261123020000_counselling_gateway.sql` | Wave 6 counselling gateway |
| 20261124000000 | `20261124000000_trust_verification_foundation.sql` | Wave 7 trust/verification metadata |
| 20261124010000 | `20261124010000_journey_lifecycle_account_controls.sql` | Wave 8 lifecycle and account controls |
| 20261127000000 | `20261127000000_matchmaking_photo_release_refinements.sql` | Wave 4A automatic publication, published-photo moderation, and release access refinements (unapplied) |

**Known correction history to reconcile against remote records:** the photo cleanup conflict was corrected by the 20261122010000 incremental migration; the free-course enrollment ambiguity by 20261024020000. The counselling and trust migrations also had reported pre-commit deployment failures and were corrected in their existing migration source. This history is not proof that any specific version is currently applied.

## RC-02 — Core Auth & Account

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-02 / authentication and account restoration |
| Requirement | Human test signup/login, password reset, signed-out protected route, refresh persistence, corrupt/stale token cleanup, logout, deleted identity handling, and re-registration. |
| Existing automated evidence | Static code confirms Auth `getUser()` validation precedes `loadIdentity()`, invalid local storage is cleared, identity state is cleared, and stale async work has a request-version guard. Historical Gates 1–10 were reported PASS in earlier work; that is historical, not fresh RC evidence. |
| Required human evidence | Session A steps A1–A8 with test accounts only; verify no protected-data flash or restore loop. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Fresh end-to-end RC auth tests and recovery evidence. |
| Relevant feature flag | None |
| Final activation decision | Keep Auth baseline unchanged; no feature activation. |

## RC-03 — Core onboarding & journeys

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-03 / profile onboarding and journey lifecycle |
| Requirement | Verify onboarding completion, immutable historical `primary_reason_for_joining`, current primary journey, multiple active journeys, pause/resume/withdraw/complete transitions, and eligibility/readiness behavior. |
| Existing automated evidence | `test:lifecycle-deletion` statically checks lifecycle source/migration contracts. The destructive/credentialed integration harness is separate. Wave 2/8 changes exist in source; no local result proves remote schema application. |
| Required human evidence | Session A exercise lifecycle states and onboarding reason preservation; database contracts against non-production. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | RC-01 remote migration evidence and fresh human lifecycle acceptance. |
| Relevant feature flag | `VITE_ACCOUNT_LIFECYCLE_UI` |
| Final activation decision | Keep account lifecycle UI off until separate acceptance and support wording are approved. |

## RC-04 — Matchmaking profile, preferences, and discovery

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-04 / Matchmaking v2 |
| Requirement | Confirm biodata validation/moderation, Required/Preferred/Open semantics, strict legacy preference sanitization, privacy, server gender eligibility, discovery, ranking meaning, no fabricated compatibility percentage, and cross-user boundaries. |
| Existing automated evidence | Local Matchmaking migrations include v2 profiles/preferences, eligibility/discovery, review projection, and first-name snapshots. Static tests in adjacent suites check selected compatibility boundaries. No production RPC execution was performed. |
| Required human evidence | Session B, two ordinary disposable users plus moderator/admin; verify preference-only saves preserve approved profile status, biodata edits return to draft, and no cross-user/private fields leak. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | RC-01 and fresh cross-account RLS/discovery acceptance. |
| Relevant feature flag | None for base Matchmaking; photo subfeatures are RC-05. |
| Final activation decision | Preserve server eligibility and moderation; do not add scores or broaden projections. |

## RC-05 — Matchmaking photos

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-05 / private photo lifecycle |
| Requirement | Verify private bucket, owner visibility of incomplete slots, verified automatic publication, pending/rejected denial for members, admin/moderator rejection/removal, published-photo reporting, primary Photo 1 presentation, replacement, reorder, deletion, queued storage cleanup, cleanup worker operation, and both photo flags. |
| Existing automated evidence | `test:matchmaking-photos` is an opt-in Playwright/Supabase mutation suite; `image-normalization.spec.mjs` is a local browser utility test. Photo SQL contract is a read-only transaction. New uploads publish only after Edge validation of Storage metadata and the actual bounded RIFF/WebP container, then the service-only finalizer records `publication_source=automatic`. Historical approved rows are labelled `administrator`; historical pending/rejected rows are not auto-published. Admin/moderator controls include approved-photo reject/remove with reasons. Historical manual record: a live API acceptance attempt exposed an ambiguous cleanup `storage_path` conflict; it was corrected by the separate 20261122010000 migration. The new `20261127000000` refinement migration is still unapplied and no human photo acceptance has been performed for this batch. |
| Required human evidence | Session B: owner/member/admin test accounts; verify new-photo immediate publication, pending legacy items remain private, admin reject/remove/report, Photo 1 primary and gallery behavior, replacement/reorder/delete, URL expiry and cleanup queue/worker in non-production. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | The refinement migration and updated Edge Functions need deployment, then acceptance. If photo UI or discovery is enabled, an authorized cleanup-worker schedule/runbook is required. Both flags remain default-off, so this is safely deferred while disabled. |
| Relevant feature flag | `VITE_MATCHMAKING_PHOTOS_UI`, `VITE_MATCHMAKING_PHOTOS_DISCOVERY` |
| Final activation decision | Keep both off until migration sync, acceptance, worker operations, and privacy tests pass. |

## RC-06 — Marriage Support & Coaching

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-06 / two separate non-clinical intake domains |
| Requirement | For each domain separately verify active journey, owner-only save, completion, paused read-only state, cross-user denial, and UI flag behavior. Support is non-clinical marriage education/support; Coaching is goals, skills, accountability, and relationship education. |
| Existing automated evidence | `test:support-coaching` uses dedicated accounts and mutates intake/journey state; its database contract is read-only. Source and Wave 5 migration are present. It was not run in the safe baseline. |
| Required human evidence | Session C with two disposable ordinary accounts; verify the two intake records and permissions remain separate. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Remote migration verification and separate user acceptance for both flags. |
| Relevant feature flag | `VITE_MARRIAGE_SUPPORT_INTAKE`, `VITE_COACHING_INTAKE` |
| Final activation decision | Keep off until RC acceptance and service ownership are recorded. |

## RC-07 — Counselling Gateway

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-07 / Counselling intake and operations |
| Requirement | Verify draft/save/submit, pause behavior, owner withdrawal from submitted/under-review/contacted states, admin queue, privacy, immediate-danger messaging, and an actual trained operational response process. |
| Existing automated evidence | `test:counselling-gateway` is a credentialed Playwright/API suite that mutates request and journey state. Its database contract is read-only. Source excludes clinical notes/diagnosis. README explicitly says emergency-resource review is required before public launch; no operational response service was evidenced in this source audit. |
| Required human evidence | Session C checks safe copy and queue; separately obtain named response owner, coverage/response expectations, escalation procedure, and approved country-specific resources. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | A live request path must not be enabled until response ownership and crisis/escalation operations are ready. The gateway flag is currently off; keeping it off is safe deferral. |
| Relevant feature flag | `VITE_COUNSELLING_GATEWAY` |
| Final activation decision | Keep off until technical acceptance and operational readiness are both evidenced. |

## RC-08 — Trust & Verification

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-08 / verification status and minimized metadata |
| Requirement | Verify email source of truth, phone masking/privacy, ID metadata privacy, and absence of trust-score/biometric behavior. |
| Existing automated evidence | `test:trust-verification` is local static acceptance. The credentialed integration suite is read-only but signs in dedicated accounts. README states no OTP provider or ID-review provider is configured; ID metadata has no user submission/review flow. |
| Required human evidence | Session C checks UI and status projection; independently compare Auth-confirmed email/phone to owner RPC projection. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | No SMS/OTP provider or provider acceptance. This blocks enforcement, not the disabled optional trust UI. |
| Relevant feature flag | `VITE_TRUST_VERIFICATION_UI`; `VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT=false` |
| Final activation decision | Phone enforcement remains false. Do not describe phone OTP or external ID verification as implemented. |

## RC-09 — Lifecycle, deactivation & deletion

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-09 / lifecycle, account status, Matchmaking removal, deletion boundary |
| Requirement | Verify journey transitions, deactivation/reactivation, Matchmaking profile/preference/photo removal, retained blocks/reports, photo cleanup, payment-linked readiness blocker, and no hard deletion. |
| Existing automated evidence | `test:lifecycle-deletion` is local static acceptance. Integration is explicitly destructive and opt-in; it irreversibly removes Matchmaking participation for one disposable user. Source reserves the hard-delete flag; the README says no hard-delete RPC/action is implemented and readiness is false. Outgoing blocks are retained by the current migration and tested by the guarded integration harness. |
| Required human evidence | Session D on a disposable account; verify retained safety records and payment history, deactivation guard, reactivation, and safe retry semantics. Do not run against production. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | No hard deletion is available by design. This is acceptable; do not enable deletion. RC-01 migration deployment status remains unknown. |
| Relevant feature flag | `VITE_ACCOUNT_LIFECYCLE_UI`; `VITE_HARD_ACCOUNT_DELETION=false` |
| Final activation decision | Hard deletion remains unavailable/off. Lifecycle UI stays off pending RC review. |

## RC-10 — RLS / Security

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-10 / database and API authorization |
| Requirement | Consolidate anonymous denial, A→B SELECT/UPDATE/DELETE denial, no role escalation, explicit privileges, SECURITY DEFINER empty search paths, owner identity from `auth.uid()`, no browser-supplied ownership, and privacy-safe projections. |
| Existing automated evidence | Domain SQL contracts exist for photos, Support/Coaching, Counselling, Trust, and Lifecycle. They require read-only database access and are not bundled in package scripts. Trust/Lifecycle static suites ran in the baseline; they do not substitute for PostgREST tests. Historical Gate 9 A↔B security PASS is user-reported historical evidence, not fresh RC evidence. |
| Required human evidence | Session D with two disposable users and anonymous client; exercise direct APIs and inspect affected rows, plus read-only database contract/grant review. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Fresh cross-account and anonymous evidence against the deployed schema. |
| Relevant feature flag | All flags; no flag bypasses database authorization. |
| Final activation decision | Do not treat frontend route or flag checks as security authority. |

## RC-11 — PesaPal Production Readiness

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-11 / production course payment rail |
| Requirement | Before selling paid courses, verify production credentials/configuration, authoritative checkout creation, return URL, IPN, provider status/amount/currency validation, success/failure/cancellation, duplicate notification idempotency, enrollment/access, admin investigation, logs/monitoring, and rollback. No transaction was run in this audit. |
| Existing automated evidence | Source contains authenticated `pesapal-checkout` and public `pesapal-ipn`; configuration uses `verify_jwt=true` for checkout and `false` for provider IPN. Server code loads `PESAPAL_ENVIRONMENT`, base/callback/cancellation URLs, IPN ID, consumer key/secret, validates server-stored amount/currency and provider status, and calls database finalizers. This is static evidence only. |
| Required human evidence | Session E in the provider-approved production/sandbox acceptance path with a controlled test transaction and duplicate/replay/callback/status checks; reconcile provider, payment row, enrollment, and admin view. Do not use real money during this release-control task. |
| Current status | `BLOCKER` |
| Blocker / dependency | No evidence of approved production credentials, registered IPN/callback configuration, successful end-to-end reconciliation, or live operational monitoring is present in the checkout. Paid-course sales must not be opened until RC-11 passes. |
| Relevant feature flag | None; payment behavior is not controlled by the nine Phase 3 flags. |
| Final activation decision | PesaPal is the intended production rail pending acceptance. MTN remains parked in sandbox; do not present it as a production alternative. |

## RC-12 — Operations

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-12 / moderation, cleanup, counselling, support, recovery |
| Requirement | Name photo moderators and cleanup scheduling, Counselling response ownership and escalation, support/contact route, error monitoring, rollback, backup/recovery awareness, and admin access. |
| Existing automated evidence | Source has an admin photo moderation panel, bounded authenticated cleanup Edge Function, counselling queue, payment admin panel, and account controls. `supabase/functions/README.md` explicitly says the photo cleanup worker has no schedule configured in this repo. Contact page says there is no active form or published public contact channel. |
| Required human evidence | Session E operations review; record accountable people/processes and prove the cleanup invocation path if photos are activated. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Unscheduled photo cleanup blocks enabling photo workflows. Missing public support/contact route is tracked as RC-14 blocker. No production alert/rollback evidence is in this repo. |
| Relevant feature flag | Photo flags; Counselling flag; lifecycle flag |
| Final activation decision | Keep dependent features off until owners and operations are established. |

## RC-13 — Product / UX smoke

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-13 / complete product UX |
| Requirement | Human smoke across mobile/desktop, signed-out/member/admin roles, navigation, loading/error states, links, journeys, and payment. |
| Existing automated evidence | Vite production build and ESLint/TypeScript are local checks. Photo image-normalization has a Playwright browser test requiring a running local app and installed browser. No full product smoke runner exists. |
| Required human evidence | Session E after A–D; include responsive and error-state coverage without enabling deferred flags. |
| Current status | `HUMAN TEST REQUIRED` |
| Blocker / dependency | Run after fresh domain acceptance and before launch. |
| Relevant feature flag | Depends on tested domain; all release flags remain off unless separately accepted. |
| Final activation decision | No redesign in RC; fix only verified release blockers. |

## RC-14 — Legal / public readiness

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-14 / public-facing terms, privacy, counselling and contact |
| Requirement | Confirm Terms, Privacy, counselling limitations, emergency wording/resources, refund/payment terms, account/data language, and functioning public contact/support. No fabricated compliance or jurisdiction-specific guarantees. |
| Existing automated evidence | `/terms` and `/privacy` pages exist and explicitly request formal legal review. Counselling copy is present. `/contact` exists but says public contact details are being prepared and explicitly states there is no active form or public contact channel. Counselling README requires authoritative country-specific emergency resource review before public launch. |
| Required human evidence | Session E plus formal legal review and approval of public copy, emergency wording/resources, refund/payment terms, and contact/privacy-request handling. |
| Current status | `BLOCKER` |
| Blocker / dependency | Unrestricted public launch lacks a functioning public contact/privacy-request channel and formal review of draft Terms/Privacy. Counselling-specific resources are also unapproved; Counselling can remain disabled while that work is completed. |
| Relevant feature flag | `VITE_COUNSELLING_GATEWAY` (must remain off until its specific operational/legal requirements pass) |
| Final activation decision | Do not claim policy/legal readiness until review and contact channels are live. |

## RC-15 — Final Go / No-Go

| Field | Evidence |
|---|---|
| Gate ID / domain | RC-15 / release decision |
| Requirement | No unresolved blockers. Every incomplete item is either a blocker or explicitly accepted deferred with safe release posture. |
| Existing automated evidence | Local safe baseline only; results are recorded after execution below. |
| Required human evidence | Complete Sessions A–E, reconcile migration history, resolve/accept every blocker, and record release owner approval. |
| Current status | `BLOCKER` |
| Blocker / dependency | RC-11 and RC-14 remain blockers; other domain human acceptance is outstanding. |
| Relevant feature flag | All nine flags |
| Final activation decision | **NO-GO** for unrestricted launch or paid-course sales on current evidence. Re-evaluate only after blockers are resolved and sessions are recorded. |

## Feature flag inventory

The source helper enables a feature only when the configured value is the literal `true`. The `.env.example` defaults are all `false`, and no release flag was explicitly enabled in the local `.env.local` at audit.

| Flag | Default / current local setting | Source | Intended RC production state | Prerequisite | Activation risk |
|---|---|---|---|---|---|
| `VITE_MATCHMAKING_PHOTOS_UI` | false / unset | `src/config/features.ts`, photo manager/admin panels | Off pending RC-05 | Photo migration sync, owner/admin lifecycle acceptance, moderation and cleanup operations | Exposes upload/review controls and creates queued-storage obligations |
| `VITE_MATCHMAKING_PHOTOS_DISCOVERY` | false / unset | `src/config/features.ts`, discovery projection | Off pending RC-05 | Approved-only projection, cross-user privacy tests, cleanup runbook | Exposes member photo views if policy/projection is wrong |
| `VITE_MARRIAGE_SUPPORT_INTAKE` | false / unset | `src/config/features.ts`, journey and intake UI | Off until RC-06 | Deployed schema/RPCs, owner/paused/completion acceptance, service ownership | Enables private intake capture |
| `VITE_COACHING_INTAKE` | false / unset | `src/config/features.ts`, Coaching UI | Off until RC-06 | Separate Coaching acceptance and operations | Enables private goals/skills intake capture |
| `VITE_COUNSELLING_GATEWAY` | false / unset | `src/config/features.ts`, Counselling UI/admin queue | Off until RC-07 | Request owner/response process, emergency-resource/legal review, queue access tests | Creates an expectation that people will respond to sensitive requests |
| `VITE_TRUST_VERIFICATION_UI` | false / unset | `src/config/features.ts`, Profile verification panel | Off pending RC-08 | Human projection/privacy acceptance; clear disclosure of metadata-only scope | May imply verification services not actually provided |
| `VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT` | false / unset | `src/config/features.ts` | **False for this RC** | Real SMS/OTP provider, abuse/rate controls, security and user acceptance | Can lock eligible users out without a working verification path |
| `VITE_ACCOUNT_LIFECYCLE_UI` | false / unset | `src/config/features.ts`, Profile account controls | Off pending RC-09 | Lifecycle acceptance, clear consequences/retention wording, support process | Exposes deactivation/removal controls with durable effects |
| `VITE_HARD_ACCOUNT_DELETION` | false / unset | `src/config/features.ts` | **False; unavailable in this wave** | No delete RPC exists; separate legal/retention/security design would be required | Must not suggest or expose hard deletion |

No feature flags were enabled or changed by this task.

## Test command inventory

| Command | Classification | Safe in every RC iteration? | Notes |
|---|---|---|---|
| `npm run test:release-baseline` | Local/static + lint/type/build + static suites | Yes | New safe orchestrator; excludes remote, credentialed, browser-mutation, and destructive tests. |
| `npm run test:trust-verification` | Static/local | Yes | Node test suite; no Supabase call or mutation. |
| `npm run test:lifecycle-deletion` | Static/local | Yes | Node test suite; no Supabase call or mutation. |
| `npm run test:matchmaking-photos` | Credentialed mutating + Playwright/browser | No | Requires dedicated accounts and `TEST_MATCHMAKING_PHOTOS_ALLOW_MUTATIONS=true`; creates/retire photo rows and queues storage cleanup. |
| `npm run test:support-coaching` | Credentialed mutating + Playwright/browser | No | Requires disposable accounts and explicit mutation opt-in; changes intake/journey state. |
| `npm run test:counselling-gateway` | Credentialed mutating + Playwright/browser | No | Requires disposable accounts and mutation opt-in; changes request/journey state. |
| `npm run test:trust-verification:integration` | Credentialed read-only/Auth integration | Not by default | Signs in dedicated accounts and calls owner RPC/anonymous reads; requires explicit Auth opt-in and disposable non-production users. |
| `npm run test:lifecycle-deletion:integration` | Destructive/credentialed integration | **Never in baseline** | Irreversibly removes Matchmaking participation for the configured disposable account; explicit mutation flag and expected UUID required. |
| `psql ... -f tests/<domain>/database-contract.sql` | Read-only database contract | No, environment-gated | Contracts start read-only transactions/rollback; require trusted read-only DB URL and a migrated non-production schema. No npm script wraps these files. |
| `npx playwright test tests/matchmaking-photos/image-normalization.spec.mjs --config=playwright.config.mjs` | Playwright/browser, local only | Optional | Requires local Vite app at configured test base URL and installed Playwright browser; no Supabase credentials. Not run by default baseline. |

**Safe baseline scope:** lint, `npx tsc --noEmit`, `vite build`, `test:trust-verification`, `test:lifecycle-deletion`, migration/flag/source boundary checks. No production payment, OTP, remote Supabase, or data-mutating command is invoked.

## Edge Function inventory

`verify_jwt` values below are read from `supabase/config.toml`; function names/purposes are read from local source. No function was deployed or invoked.

| Function | Purpose | `verify_jwt` | Release dependency / manual acceptance |
|---|---|---:|---|
| `pesapal-checkout` | Authenticated course payment attempt, hosted checkout creation, owner status recheck | true | RC-11; provider configuration, return and reconciliation acceptance required |
| `pesapal-ipn` | Public provider callback/notification; server-side status and amount/currency verification | false | RC-11; registered IPN, duplicate/replay, verified finalization and monitoring checks required |
| `mtn-checkout` | Authenticated MTN course checkout/status; source docs say sandbox-locked | true | Parked; not a production rail for this RC |
| `mtn-payment-callback` | Public provider callback; source rechecks MTN status before finalization | false | Parked with sandbox MTN; callback transport acceptance not part of launch rail |
| `matchmaking-photo-upload` | Authenticated photo slot/upload/finalization workflow | true | RC-05; remains disabled until acceptance |
| `matchmaking-photo-access` | Authenticated photo access broker for approved photos | true | RC-05; member privacy and approval checks |
| `matchmaking-photo-cleanup` | Authenticated admin-only bounded Storage cleanup worker | true | RC-05/RC-12; no schedule exists in repository |

## Current Release Blockers

1. **RC-11: paid-course PesaPal production acceptance is absent.** Local source shows the server path, but there is no evidence here of production credentials/configuration, registered IPN/return URLs, end-to-end transaction reconciliation, monitoring, or rollback. Do not sell paid courses until this gate passes. This is not a claim that the implementation is broken; it is a missing production proof gate.
2. **RC-14: no active public contact/privacy-request channel.** The current Contact page explicitly says there is no active form or published public channel; Privacy points to this page for requests. Formal legal review of draft Terms/Privacy is also explicitly pending. Unrestricted public launch is not ready until those are resolved.

Counselling response/crisis operations are a feature-specific blocker before enabling the gateway, but the flag currently defaults off. Photo cleanup scheduling is a blocker before enabling photo workflows, also currently default-off. These are not blockers for a release that keeps those features disabled and clearly does not promise them.

## Accepted Deferred

- MTN production rail, SMS/OTP, phone-enforcement, trust score, biometrics, external ID verification, and advanced verification provider work remain out of this RC; MTN stays sandbox-only and phone enforcement stays off.
- Hard account deletion remains unavailable; `VITE_HARD_ACCOUNT_DELETION=false`.
- Matchmaking photo UI/discovery may remain disabled until cleanup operations and acceptance are ready.
- Marriage Support, Coaching, Counselling, Trust UI, and Lifecycle UI may remain disabled until each feature’s prerequisite gate passes. Disabled unfinished functionality is not represented as live service.
- Advanced Media CMS, advanced Community, compatibility percentage/scoring, sophisticated contact detection, and unrelated redesign work are frozen out of scope below.

## Human acceptance sessions

Use dedicated non-production accounts and record test date, build SHA, role/UUID aliases (no credentials), observed result, and linked evidence. Do not run destructive tests on production accounts. These sessions have not been run by this baseline task.

### Session A — Core Account, Auth, onboarding, journeys

1. Sign up a disposable member and verify profile/role provisioning; verify ordinary `user` role.
2. Sign out, sign in, refresh protected routes, and verify profile/onboarding restoration.
3. Exercise password reset and reset return path.
4. Visit a protected route while signed out; verify safe sign-in/home behavior and no protected-data flash.
5. Corrupt/expire only the disposable session; refresh and verify local cleanup without an account-data error trap or redirect loop.
6. Verify logout and deleted-identity handling; re-register a disposable address and confirm a new clean identity.
7. Complete onboarding; verify historical join reason stays unchanged while current primary journey can change.
8. Activate multiple eligible journeys; pause, resume, withdraw, and complete where allowed; verify invalid transitions are denied.

### Session B — Matchmaking, preferences, privacy, photos, moderation

1. Use two ordinary disposable users of opposite authoritative genders; verify server-side visibility and direct profile/interest protections.
2. Save valid Required/Preferred/Open preferences; verify invalid legacy values are discarded and no private preference is exposed.
3. Verify preference-only edits preserve approval while public biodata edits return to draft; submit and review again.
4. Verify discovery ranking/order and labels; confirm no compatibility percentage or score is fabricated.
5. As owner, create/cancel incomplete slots; verify valid new WebP publishes only after server validation and finalization; as another member, confirm legacy pending and rejected photos are inaccessible.
6. As admin/moderator, review a legacy pending item, reject a published item, remove a published item with a reason, and test inappropriate-photo reporting; as an eligible member, verify access and cross-user denial.
7. Verify Photo 1 is the primary image in discovery, profile detail, and interest/introduction UI; Photo 2/3 never silently replace a missing Photo 1. Test gallery thumbnails, keyboard arrows, swipe, reporting, and signed URL expiry.
8. Test replacement, reorder/Make Primary, deletion, account deactivation/Matchmaking removal, and cleanup queue/worker in the non-production project. These are human-required even if automated checks exist.
9. Confirm both photo flags remain false until migration deployment, acceptance, moderation ownership, and cleanup schedule are verified.

### Session C — Marriage Support, Coaching, Counselling, Trust

1. With dedicated eligible journeys, separately save and complete Marriage Support and Coaching; verify content remains private and scope is non-clinical.
2. Pause each journey; verify read-only behavior and no saves/submissions; resume and confirm owner-only access.
3. Test cross-user denial for each intake.
4. If Counselling is not operationally staffed, confirm gateway flag remains off and public copy does not invite an unattended request.
5. If ready for acceptance, test save/submit, paused read-only, permitted withdrawal states, closed/referred denial, queue removal, privacy, and immediate-danger wording.
6. Verify email/phone status matches Supabase Auth and phone masking; verify ID metadata is not presented as external verification, and no trust score/biometric claim appears.

### Session D — Lifecycle, deactivation, Matchmaking deletion, RLS/security

1. With two disposable users and anonymous client, repeat cross-user/anonymous SELECT, UPDATE, DELETE, role-escalation, and RPC/IDOR denial checks; inspect row counts and verify no mutation.
2. Pause/resume/withdraw journeys and confirm the lifecycle transition matrix.
3. On a disposable Matchmaking owner, delete participation; verify profile/preferences disappear, photos become inaccessible and cleanup queues, outgoing/incoming safety blocks and reports remain, other journeys/Core account/payment history remain.
4. Deactivate/reactivate account; verify protected mutations are denied while inactive and no Auth identity mutation occurs.
5. Verify payment-linked hard-delete readiness is blocked and hard deletion remains unavailable.
6. Review direct table privileges, RLS, SECURITY DEFINER grants/search paths, and all domain read-only database contracts against non-production.

### Session E — PesaPal production, operations, final full-product smoke

1. Confirm approved PesaPal environment, secret names/configuration, return/cancellation URLs, registered IPN, monitoring, and rollback owner; never expose secret values.
2. Execute provider-approved test transaction flow; verify pending, success, failure, cancellation, duplicate notification/recheck, exact amount/currency, enrollment once, and admin traceability. No real-money test without explicit business approval.
3. Confirm photo cleanup scheduling/runbook if photos are to be enabled; confirm moderator, counselling response, crisis escalation, support, incident, backup/recovery and rollback owners.
4. Smoke mobile and desktop, signed-out/member/admin navigation, loading/errors, public links, primary journeys, and payment path.
5. Verify public Terms/Privacy/contact/emergency/refund/account wording and formal approvals.
6. Review RC-00 through RC-15; resolve blockers or record explicit safe deferrals, then obtain release-owner Go/No-Go.

**Recommended first session:** Session A. Auth/onboarding is the identity foundation for all later owner-scoped domain checks; use dedicated disposable accounts and no production deletion.

## Phase 3 Release Scope Freeze

No new features or architectural expansion during this RC. Out of scope:

- advanced Media CMS;
- advanced Community features;
- MTN production payment rail;
- compatibility percentages or scoring;
- trust score;
- biometric or face verification;
- advanced external ID-verification provider;
- sophisticated contact detector;
- unrelated UI redesigns.

Only release evidence, acceptance tooling, verified release-blocking fixes, operational readiness, and launch configuration are in scope. No feature flag is activated by this control-board task.

## Deployment inventory

- **Migrations:** 42 local files, listed above. The 20261127000000 Wave 4A refinement is not applied by this task; applied versions otherwise remain **unknown / not checked**.
- **Edge Functions:** seven source directories listed above. Deployment versions and runtime secrets: **unknown / not checked**.
- **Feature flags:** nine centralized defaults are false; local `.env.local` has no explicit release-flag enablement. Production values: **unknown / not checked**.
- **Supabase project link:** no local CLI available; remote status was not queried.
- **Payments:** PesaPal course checkout/IPN source exists; production readiness not proven. MTN source/docs remain sandbox-only and outside production launch scope.

## Acceptance standard

RC-15 cannot become `AUTOMATED PASS` from build/test results alone. It requires fresh Sessions A–E, remote migration reconciliation, resolved RC-11 and RC-14 blockers, and an explicit release owner decision. Every disabled feature remains disabled until its own prerequisites pass.

## Fresh local baseline run record

| Check | Result |
|---|---|
| Migration names/order/duplicate versions | `AUTOMATED PASS` — 41 timestamped files; no duplicate versions; ordered |
| Central/local feature flag checks | `AUTOMATED PASS` — nine defaults false; no `.env.local` enablement |
| Frontend secret boundary and Auth/payment source boundary checks | `AUTOMATED PASS` |
| ESLint | `AUTOMATED PASS` |
| TypeScript (`npx tsc --noEmit`) | `AUTOMATED PASS` |
| Production build | `AUTOMATED PASS` — Vite emitted only an advisory that Browserslist data is stale |
| `test:trust-verification` | `AUTOMATED PASS` — 5/5 |
| `test:lifecycle-deletion` | `AUTOMATED PASS` — 5/5 |
| `git diff --check` | `AUTOMATED PASS` — tracked diff clean; runner also checks trailing whitespace/newline on new release files |
| Credentialed, mutating, destructive, browser, remote DB/provider tests | Skipped by design; see inventory and human sessions |
