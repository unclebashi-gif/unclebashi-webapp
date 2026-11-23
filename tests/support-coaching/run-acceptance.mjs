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
  'TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY',
  'TEST_SUPPORT_USER_EMAIL', 'TEST_SUPPORT_USER_PASSWORD',
  'TEST_SUPPORT_OTHER_EMAIL', 'TEST_SUPPORT_OTHER_PASSWORD',
  'TEST_SUPPORT_COACHING_ALLOW_MUTATIONS',
];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length || process.env.TEST_SUPPORT_COACHING_ALLOW_MUTATIONS !== 'true') {
  const message = missing.length
    ? `Missing test configuration: ${missing.join(', ')}.`
    : 'Set TEST_SUPPORT_COACHING_ALLOW_MUTATIONS=true only for a non-production project with dedicated disposable accounts.';
  console.error(`${message} Copy .env.test.example to .env.test and fill it locally.`);
  process.exit(1);
}

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'playwright', 'test', '--config=playwright.support-coaching.config.mjs',
], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
process.exit(result.status ?? 1);
