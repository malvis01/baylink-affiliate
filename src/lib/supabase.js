import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

let supabase = null;
let supabaseConfigError = '';

if (url && key) {
  try {
    supabase = createClient(url, key);
  } catch (error) {
    supabaseConfigError = error?.message || 'Supabase configuration is invalid.';
    console.error('BayLINK Supabase initialization failed:', error);
  }
} else {
  supabaseConfigError = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.';
}

export { supabase, supabaseConfigError };
export const isSupabaseConfigured = Boolean(supabase);
