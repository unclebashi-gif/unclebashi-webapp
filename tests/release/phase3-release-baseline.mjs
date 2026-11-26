import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requiredFlags = [
  'VITE_MATCHMAKING_PHOTOS_UI',
  'VITE_MATCHMAKING_PHOTOS_DISCOVERY',
  'VITE_MARRIAGE_SUPPORT_INTAKE',
  'VITE_COACHING_INTAKE',
  'VITE_COUNSELLING_GATEWAY',
  'VITE_TRUST_VERIFICATION_UI',
  'VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT',
  'VITE_ACCOUNT_LIFECYCLE_UI',
  'VITE_HARD_ACCOUNT_DELETION',
];
const featureKeys = {
  VITE_MATCHMAKING_PHOTOS_UI: 'matchmakingPhotosUI',
  VITE_MATCHMAKING_PHOTOS_DISCOVERY: 'matchmakingPhotosDiscovery',
  VITE_MARRIAGE_SUPPORT_INTAKE: 'marriageSupportIntake',
  VITE_COACHING_INTAKE: 'coachingIntake',
  VITE_COUNSELLING_GATEWAY: 'counsellingGateway',
  VITE_TRUST_VERIFICATION_UI: 'trustVerificationUI',
  VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT: 'matchmakingPhoneVerificationEnforcement',
  VITE_ACCOUNT_LIFECYCLE_UI: 'accountLifecycleUI',
  VITE_HARD_ACCOUNT_DELETION: 'hardAccountDeletion',
};
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(label);
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function run(label, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  const ok = result.status === 0;
  check(label, ok, ok ? 'completed' : `exit=${result.status ?? 'unknown'}`);
}

console.log('Phase 3 release baseline: local/static checks only; no Supabase, payment provider, OTP, or mutation calls.');

const packageJson = JSON.parse(read('package.json'));
const migrationFiles = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'));
const migrationVersions = migrationFiles.map((name) => name.match(/^(\d{14})_.+\.sql$/)?.[1] ?? null);
const validMigrationNames = migrationVersions.every(Boolean);
const duplicateVersions = migrationVersions.filter((version, index) => migrationVersions.indexOf(version) !== index);
const sortedMigrations = [...migrationFiles].sort((a, b) => a.localeCompare(b));
check('migration filenames', validMigrationNames, `${migrationFiles.length} timestamped SQL files`);
check('migration versions unique', duplicateVersions.length === 0,
  duplicateVersions.length ? `duplicates: ${[...new Set(duplicateVersions)].join(', ')}` : 'no duplicate timestamp prefixes');
check('migration chronology', JSON.stringify(migrationFiles) === JSON.stringify(sortedMigrations),
  'directory order is chronological by timestamped filename');

const featureSource = read('src/config/features.ts');
const exampleEnv = read('.env.example');
const localEnvPath = resolve(root, '.env.local');
const localEnv = existsSync(localEnvPath) ? readFileSync(localEnvPath, 'utf8') : '';
let flagShapeValid = true;
const activeFlags = new Set();
for (const flag of requiredFlags) {
  const exportedName = featureKeys[flag];
  if (!featureSource.includes(`${exportedName}: enabled(import.meta.env.${flag})`)
      || !new RegExp(`^${flag}=false$`, 'm').test(exampleEnv)) {
    flagShapeValid = false;
  }
  const localValue = localEnv.match(new RegExp(`^\\s*${flag}\\s*=\\s*([^\\r\\n]*)`, 'm'))?.[1]
    ?.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (localValue === 'true' || process.env[flag]?.trim().toLowerCase() === 'true') activeFlags.add(flag);
}
check('central feature flags', flagShapeValid, 'all nine expected flags are centralized and false in .env.example');
check('local release flags', activeFlags.size === 0,
  activeFlags.size ? `enabled in .env.local or process environment: ${[...activeFlags].join(', ')}` : 'no release flag is enabled in .env.local or process environment');

const authSource = read('src/hooks/useSessionManager.ts');
const supabaseSource = read('src/lib/supabase.ts');
const paymentSource = read('src/lib/paymentService.ts');
check('Auth regression boundaries', authSource.includes('supabase.auth.getUser(session.access_token)')
  && authSource.includes('loadIdentity(authUser)') && supabaseSource.includes('clearSupabaseLocalAuthStorage'),
'bootstrap validates Auth before loading account identity and has local invalid-session cleanup');
check('payment rail boundaries', paymentSource.includes("'pesapal-checkout'")
  && paymentSource.includes("'mtn-checkout'"), 'PesaPal checkout exists; MTN remains separately wired');

const frontendFiles = [];
function visit(relativeDirectory) {
  for (const entry of readdirSync(resolve(root, relativeDirectory), { withFileTypes: true })) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) visit(relative);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) frontendFiles.push(relative);
  }
}
visit('src');
const frontendSecretPattern = /(?:VITE_(?:[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*|MTN_API_USER|MTN_API_KEY|MTN_COLLECTION_SUBSCRIPTION_KEY|PESAPAL_CONSUMER_KEY|PESAPAL_CONSUMER_SECRET)|SUPABASE_SERVICE_ROLE_KEY\s*=)/;
const secretReferences = frontendFiles.filter((file) => frontendSecretPattern.test(read(file)));
check('frontend secret boundary', secretReferences.length === 0,
  secretReferences.length ? `review source: ${secretReferences.join(', ')}` : 'no service-role/provider secret variable assignment or VITE secret name found');
const releaseArtifacts = [
  'docs/release/phase3-release-control-board.md',
  'tests/release/phase3-release-baseline.mjs',
];
const whitespaceProblems = releaseArtifacts.filter((file) => {
  const content = read(file);
  return !content.endsWith('\n') || content.split(/\r?\n/).some((line) => /[\t ]+$/.test(line));
});
check('release artifact whitespace', whitespaceProblems.length === 0,
  whitespaceProblems.length ? `review: ${whitespaceProblems.join(', ')}` : 'new release files end with newline and have no trailing whitespace');

for (const script of [
  'lint', 'build', 'test:trust-verification', 'test:lifecycle-deletion',
  'test:matchmaking-photos', 'test:support-coaching', 'test:counselling-gateway',
  'test:trust-verification:integration', 'test:lifecycle-deletion:integration',
]) {
  check(`package script ${script}`, typeof packageJson.scripts?.[script] === 'string');
}

run('ESLint (package lint script)', ['node_modules/eslint/bin/eslint.js', '.']);
run('TypeScript (npx tsc --noEmit equivalent)', ['node_modules/typescript/bin/tsc', '--noEmit']);
run('production build (package build script)', ['node_modules/vite/bin/vite.js', 'build']);
run('static Trust & Verification checks', ['--test', 'tests/trust-verification/*.spec.mjs']);
run('static Lifecycle & Deletion checks', ['--test', 'tests/lifecycle-deletion/*.spec.mjs']);

console.log('\nSkipped by design:');
console.log('- matchmaking photo E2E: requires disposable accounts and is mutation-enabled');
console.log('- Marriage Support/Coaching E2E: credentialed and mutates intake/journey state');
console.log('- Counselling E2E: credentialed and mutates request/journey state');
console.log('- Trust integration: credentialed Auth/RPC read-only check; not run without dedicated accounts');
console.log('- Lifecycle integration: destructive/irreversible Matchmaking removal; never part of baseline');
console.log('- SQL database contracts: require a trusted read-only TEST_DATABASE_URL and a deployed test schema');
console.log('- Photo image-normalization Playwright check: requires a running local app and installed browser');
console.log('- Supabase remote migration dry-run: Supabase CLI is not installed or linked in this checkout');

if (failures.length) {
  console.error(`\nRelease baseline failed: ${failures.join('; ')}`);
  process.exitCode = 1;
} else {
  console.log('\nRelease baseline completed successfully. This is not human acceptance or deployment evidence.');
}
