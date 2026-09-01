import { createClient } from '@supabase/supabase-js';

// Netlify normally injects these Vite variables at build time. The public
// Supabase URL and publishable key are also safe to use as frontend fallbacks.
const url = (
  import.meta.env.VITE_SUPABASE_URL ||
  'https://tqcuhkprbwejkgoqckgb.supabase.co'
).trim();

const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_TgS6nWMUMNDT040BQRqe-g_kfmeaQ8U'
).trim();

let supabase = null;
let supabaseConfigError = '';

try {
  if (!url || !key) {
    throw new Error('Supabase URL or publishable key is missing.');
  }
  supabase = createClient(url, key);
} catch (error) {
  supabaseConfigError = error?.message || 'Supabase configuration is invalid.';
  console.error('BayLINK Supabase initialization failed:', error);
}

export { supabase, supabaseConfigError };
export const isSupabaseConfigured = Boolean(supabase);
