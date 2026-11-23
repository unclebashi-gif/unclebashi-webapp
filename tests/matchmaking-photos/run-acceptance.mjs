import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

const required = [
  'TEST_BASE_URL', 'TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY',
  'TEST_MATCHMAKING_OWNER_EMAIL', 'TEST_MATCHMAKING_OWNER_PASSWORD',
  'TEST_MATCHMAKING_OTHER_EMAIL', 'TEST_MATCHMAKING_OTHER_PASSWORD',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_MATCHMAKING_PHOTOS_ALLOW_MUTATIONS',
];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length || process.env.TEST_MATCHMAKING_PHOTOS_ALLOW_MUTATIONS !== 'true') {
  const details = missing.length ? `Missing test configuration: ${missing.join(', ')}.` : 'Set TEST_MATCHMAKING_PHOTOS_ALLOW_MUTATIONS=true only for a disposable test project with dedicated test accounts.';
  console.error(`${details} Copy .env.test.example to .env.test and fill it locally.`);
  process.exit(1);
}

process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${process.cwd()}\\.playwright-browsers`;

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'playwright', 'test', '--config=playwright.config.mjs',
], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
process.exit(result.status ?? 1);
