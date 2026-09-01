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

function normalizePhone(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('234')) return `+${raw}`;
  if (raw.startsWith('0')) return `+234${raw.slice(1)}`;
  return `+${raw}`;
}

async function memberAuthRequest(action, phone, password, name, role) {
  const response = await fetch('/api/member-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, phone, password, name, role })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { error: 'Authentication service returned an invalid response.' };
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Authentication failed.');
  }

  return payload;
}

try {
  if (!url || !key) {
    throw new Error('Supabase URL or publishable key is missing.');
  }

  const client = createClient(url, key);
  const originalSignUp = client.auth.signUp.bind(client.auth);
  const originalSignInWithPassword = client.auth.signInWithPassword.bind(client.auth);

  /*
   * BayLINK member authentication deliberately does NOT use Supabase's
   * phone provider. That provider requires an SMS/OTP configuration.
   *
   * Instead, /api/member-auth maps a normalized phone number to an internal
   * non-deliverable email identity and creates/signs in the Supabase user.
   * The browser still receives a normal Supabase session, so RLS and all
   * existing authenticated database operations continue to work.
   *
   * Email/password admin authentication continues to use Supabase directly.
   */
  client.auth.signUp = async (credentials) => {
    if (!credentials?.phone) return originalSignUp(credentials);

    try {
      const cleanPhone = normalizePhone(credentials.phone);
      const metadata = credentials.options?.data || {};
      const payload = await memberAuthRequest(
        'signup',
        cleanPhone,
        credentials.password,
        metadata.display_name || metadata.full_name || '',
        metadata.requested_role || (metadata.role === 'merchant' ? 'business' : 'affiliate')
      );

      const { error: sessionError } = await client.auth.setSession(payload.session);
      if (sessionError) throw sessionError;

      return {
        data: {
          user: payload.user,
          session: payload.session,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: { user: null, session: null },
        error: { message: error?.message || 'Account creation failed.' },
      };
    }
  };

  client.auth.signInWithPassword = async (credentials) => {
    if (!credentials?.phone) return originalSignInWithPassword(credentials);

    try {
      const cleanPhone = normalizePhone(credentials.phone);
      const payload = await memberAuthRequest(
        'login',
        cleanPhone,
        credentials.password,
        '',
        ''
      );

      const { error: sessionError } = await client.auth.setSession(payload.session);
      if (sessionError) throw sessionError;

      return {
        data: {
          user: payload.user,
          session: payload.session,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: { user: null, session: null },
        error: { message: error?.message || 'Login failed.' },
      };
    }
  };

  supabase = client;
} catch (error) {
  supabaseConfigError = error?.message || 'Supabase configuration is invalid.';
  console.error('BayLINK Supabase initialization failed:', error);
}

export { supabase, supabaseConfigError };
export const isSupabaseConfigured = Boolean(supabase);
