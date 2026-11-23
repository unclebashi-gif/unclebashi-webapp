import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
  'TEST_TRUST_VERIFICATION_VERIFIED_EMAIL', 'TEST_TRUST_VERIFICATION_VERIFIED_PASSWORD',
  'TEST_TRUST_VERIFICATION_UNVERIFIED_EMAIL', 'TEST_TRUST_VERIFICATION_UNVERIFIED_PASSWORD',
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (process.env.TEST_TRUST_VERIFICATION_ALLOW_AUTH !== 'true' || missing.length) {
  console.error(missing.length
    ? `Read-only Wave 7 integration not run; missing configuration: ${missing.join(', ')}.`
    : 'Read-only Wave 7 integration not run; set TEST_TRUST_VERIFICATION_ALLOW_AUTH=true for disposable non-production accounts.');
  process.exit(2);
}

const supabaseUrl = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const client = () => createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const assertSafeProjection = (row, user, expectedEmailVerified) => {
  const expectedKeys = [
    'email_verified', 'phone_status', 'masked_phone', 'identity_status', 'identity_rejection_reason',
  ].sort();
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('Owner RPC returned an unexpected field set.');
  }
  if (row.email_verified !== Boolean(user.email_confirmed_at)) throw new Error('Email verification status does not match Auth.');
  if (row.email_verified !== expectedEmailVerified) throw new Error('Test account does not match its configured verified/unverified role.');
  const expectedPhone = user.phone_confirmed_at ? 'verified' : 'unverified';
  if (row.phone_status !== expectedPhone) throw new Error('Phone verification status does not match Auth.');
  if (user.phone && row.masked_phone && row.masked_phone.includes(user.phone)) {
    throw new Error('Owner RPC exposed the complete phone number.');
  }
  if (user.phone_confirmed_at && user.phone?.length >= 4
      && row.masked_phone !== `•••• ${user.phone.slice(-4)}`) {
    throw new Error('Verified phone mask does not match Auth last-four value.');
  }
  if (row.phone_status !== 'verified' && row.masked_phone !== null) {
    throw new Error('Unverified phone returned a mask.');
  }
  if (!['not_submitted', 'pending', 'verified', 'rejected', 'expired'].includes(row.identity_status)) {
    throw new Error('Identity status is outside the allowed state set.');
  }
};

for (const [label, emailEnv, passwordEnv, expectedEmailVerified] of [
  ['verified', 'TEST_TRUST_VERIFICATION_VERIFIED_EMAIL', 'TEST_TRUST_VERIFICATION_VERIFIED_PASSWORD', true],
  ['unverified', 'TEST_TRUST_VERIFICATION_UNVERIFIED_EMAIL', 'TEST_TRUST_VERIFICATION_UNVERIFIED_PASSWORD', false],
]) {
  const userClient = client();
  const { data: authData, error: authError } = await userClient.auth.signInWithPassword({
    email: process.env[emailEnv], password: process.env[passwordEnv],
  });
  if (authError || !authData.user) throw new Error(`Could not authenticate dedicated ${label} test account.`);
  const { data: verifiedAuth, error: verifyError } = await userClient.auth.getUser();
  if (verifyError || !verifiedAuth.user) throw new Error(`Auth verification failed for dedicated ${label} test account.`);
  const { data, error } = await userClient.rpc('get_my_verification_status');
  if (error || !Array.isArray(data) || data.length !== 1) throw new Error(`Owner verification RPC failed for ${label} test account.`);
  assertSafeProjection(data[0], verifiedAuth.user, expectedEmailVerified);
  if (data[0].identity_status !== 'rejected' && data[0].identity_rejection_reason !== null) {
    throw new Error('Owner RPC returned a rejection reason outside rejected status.');
  }
  console.log(`${label} Auth account: owner verification projection matches Auth and contains only safe fields.`);
}

const anonymous = client();
const { error: rpcError } = await anonymous.rpc('get_my_verification_status');
if (!rpcError) throw new Error('Anonymous owner status RPC unexpectedly succeeded.');
const { error: tableError } = await anonymous.from('user_verifications').select('*').limit(1);
if (!tableError) throw new Error('Anonymous verification table read unexpectedly succeeded.');
console.log('Anonymous owner RPC and direct table read are denied. No mutation was attempted.');
