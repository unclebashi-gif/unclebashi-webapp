import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment configuration.');
}

const supabaseAuthStorageKey = 'sb-' + new URL(supabaseUrl).hostname.split('.')[0] + '-auth-token';
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: supabaseAuthStorageKey },
});

export const clearSupabaseLocalAuthStorage = (): void => {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(supabaseAuthStorageKey);
  window.localStorage.removeItem(supabaseAuthStorageKey + '-user');
  window.localStorage.removeItem(supabaseAuthStorageKey + '-code-verifier');
};

export { supabase };
