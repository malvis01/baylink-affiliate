import { createClient } from '@supabase/supabase-js';

function normalizePhone(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('234')) return `+${raw}`;
  if (raw.startsWith('0')) return `+234${raw.slice(1)}`;
  return `+${raw}`;
}

function phoneEmail(phone) {
  const digits = phone.replace(/\D/g, '');
  return `phone_${digits}@auth.baylink.local`;
}

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Server authentication is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Netlify.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function getPublicClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Public Supabase configuration is missing.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    const action = body?.action;
    const phone = normalizePhone(body?.phone);
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim();
    const role = body?.role === 'business' ? 'business' : 'affiliate';

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return Response.json({ error: 'Enter a valid phone number, for example 08012345678.' }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const email = phoneEmail(phone);
    const admin = getAdminClient();

    if (action === 'signup') {
      if (!name) return Response.json({ error: 'Please enter your full name.' }, { status: 400 });

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          display_name: name,
          role,
          requested_role: role,
          phone
        }
      });

      if (createError) {
        const duplicate = /already|exists|registered/i.test(createError.message || '');
        return Response.json({ error: duplicate ? 'An account already exists for this phone number.' : createError.message }, { status: duplicate ? 409 : 400 });
      }

      const publicClient = getPublicClient();
      const { data: loginData, error: loginError } = await publicClient.auth.signInWithPassword({ email, password });
      if (loginError || !loginData.session) {
        return Response.json({ error: 'Account was created, but automatic login could not be completed. Please log in with your phone number and password.' }, { status: 500 });
      }

      return Response.json({ user: created.user, session: loginData.session });
    }

    if (action === 'login') {
      const publicClient = getPublicClient();
      const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
      if (error) return Response.json({ error: 'Incorrect phone number or password.' }, { status: 401 });
      return Response.json({ user: data.user, session: data.session });
    }

    return Response.json({ error: 'Unsupported authentication action.' }, { status: 400 });
  } catch (error) {
    console.error('BayLINK member auth error:', error);
    return Response.json({ error: error?.message || 'Authentication service is temporarily unavailable.' }, { status: 500 });
  }
};

export const config = { path: '/api/member-auth', method: 'POST' };
