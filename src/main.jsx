import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import './styles.css';

const money = n => `₦${Number(n || 0).toLocaleString()}`;

function normalizePhone(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('234')) return `+${raw}`;
  if (raw.startsWith('0')) return `+234${raw.slice(1)}`;
  return `+${raw}`;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState('home');
  const [authMode, setAuthMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('affiliate');
  const [message, setMessage] = useState('');
  const [offers, setOffers] = useState([]);
  const [stats, setStats] = useState({
    clicks: 0,
    conversions: 0,
    commission: 0
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadData();
    } else {
      setProfile(null);
    }
  }, [session]);

  async function loadData() {
    if (!supabase || !session) return;

    setLoading(true);

    const [profileRes, offersRes, statsRes] = await Promise.all([
      supabase
        .from('affiliate_profiles')
        .select('id,display_name,role,referral_code')
        .eq('id', session.user.id)
        .maybeSingle(),

      supabase
        .from('affiliate_offers')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false }),

      supabase
        .from('affiliate_stats')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()
    ]);

    if (profileRes.error) {
      setMessage(`Profile error: ${profileRes.error.message}`);
    }

    if (offersRes.error) {
      setMessage(`Offers error: ${offersRes.error.message}`);
    }

    if (statsRes.error) {
      setMessage(`Stats error: ${statsRes.error.message}`);
    }

    setProfile(profileRes.data || null);
    setOffers(offersRes.data || []);

    if (statsRes.data) {
      setStats(statsRes.data);
    }

    setLoading(false);
  }

  async function memberAuth() {
    setMessage('');

    if (!supabase) {
      setMessage('BayLINK is not connected to Supabase.');
      return;
    }

    const cleanPhone = normalizePhone(phone);

    if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) {
      setMessage(
        'Enter a valid phone number, for example 08012345678.'
      );
      return;
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }

    if (authMode === 'signup' && !name.trim()) {
      setMessage('Please enter your full name.');
      return;
    }

    setLoading(true);

    try {
      if (authMode === 'signup') {
        const requestedRole =
          role === 'business' ? 'merchant' : 'affiliate';

        const { data, error } = await supabase.auth.signUp({
          phone: cleanPhone,
          password,
          options: {
            data: {
              full_name: name.trim(),
              display_name: name.trim(),
              role: requestedRole,
              requested_role: role,
              phone: cleanPhone
            }
          }
        });

        if (error) throw error;

        if (!data?.user) {
          throw new Error('Account could not be created.');
        }

        /*
         * OTP-FREE SIGNUP
         *
         * Phone confirmation must be disabled in Supabase.
         * When it is disabled, signUp() returns a session immediately.
         *
         * We do NOT show or request an OTP here.
         */
        let nextSession = data.session;

        /*
         * Safety fallback:
         * If Supabase created the account but did not return a session,
         * attempt a normal phone + password login.
         *
         * This is still NOT an OTP flow.
         */
        if (!nextSession) {
          const loginResult =
            await supabase.auth.signInWithPassword({
              phone: cleanPhone,
              password
            });

          if (loginResult.error) {
            throw new Error(
              'Account was created, but automatic login could not be completed. Please try logging in with your phone number and password.'
            );
          }

          nextSession = loginResult.data?.session;
        }

        if (!nextSession) {
          throw new Error(
            'Account was created, but no login session was returned. Please try logging in with your phone number and password.'
          );
        }

        setSession(nextSession);
        setMode('dashboard');
        setAuthMode('login');
        setPassword('');
        setMessage('Account created successfully. Welcome to BayLINK!');
      } else {
        /*
         * MEMBER LOGIN
         * Phone number + password only.
         * No OTP.
         */
        const { data, error } =
          await supabase.auth.signInWithPassword({
            phone: cleanPhone,
            password
          });

        if (error) throw error;

        setSession(data.session);
        setMode('dashboard');
        setMessage('Welcome back.');
      }
    } catch (error) {
      const text = String(
        error?.message || 'Login failed.'
      );

      setMessage(
        text
          .toLowerCase()
          .includes('invalid login credentials')
          ? 'Incorrect phone number or password.'
          : text
      );
    } finally {
      setLoading(false);
    }
  }

  async function adminLogin() {
    setMessage('');

    if (!supabase) {
      setMessage('BayLINK is not connected to Supabase.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage(
        'Enter the administrator email and password.'
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

      if (error) throw error;

      const {
        data: adminProfile,
        error: profileError
      } = await supabase
        .from('affiliate_profiles')
        .select(
          'id,display_name,role,referral_code'
        )
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (adminProfile?.role !== 'admin') {
        await supabase.auth.signOut();

        throw new Error(
          'This account is not an administrator account.'
        );
      }

      setSession(data.session);
      setProfile(adminProfile);
      setMode('admin');
      setMessage('Administrator signed in.');
    } catch (error) {
      setMessage(
        error?.message ||
          'Administrator login failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function askAI() {
    if (!aiPrompt.trim()) return;

    setAiResult('');
    setLoading(true);

    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: aiPrompt.trim()
        })
      });

      const j = await r.json();

      setAiResult(
        j.response || j.error || 'No result.'
      );
    } catch {
      setAiResult(
        'AI service is temporarily unavailable.'
      );
    }

    setLoading(false);
  }

  async function referral(offer) {
    if (!supabase || !session) {
      setMessage('Please log in first.');
      return;
    }

    const code = `${session.user.id.slice(
      0,
      8
    )}-${offer.id}`;

    const { error } = await supabase
      .from('affiliate_clicks')
      .insert({
        offer_id: offer.id,
        affiliate_id: session.user.id,
        referral_code: code
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    const link =
      `${location.origin}/offer/${offer.id}` +
      `?ref=${encodeURIComponent(code)}`;

    try {
      await navigator.clipboard.writeText(link);
      setMessage('Referral link copied.');
    } catch {
      setMessage(link);
    }
  }

  async function loadAdmin() {
    if (!supabase || profile?.role !== 'admin') {
      return;
    }

    setLoading(true);
    setMessage('');

    const [
      users,
      businesses,
      offersRes,
      conversions
    ] = await Promise.all([
      supabase
        .from('affiliate_profiles')
        .select(
          'id,display_name,role,referral_code,created_at'
        )
        .order('created_at', {
          ascending: false
        }),

      supabase
        .from('business_profiles')
        .select('*')
        .order('created_at', {
          ascending: false
        }),

      supabase
        .from('affiliate_offers')
        .select('*')
        .order('created_at', {
          ascending: false
        }),

      supabase
        .from('affiliate_conversions')
        .select('*')
        .order('created_at', {
          ascending: false
        })
    ]);

    const error =
      users.error ||
      businesses.error ||
      offersRes.error ||
      conversions.error;

    if (error) {
      setMessage(error.message);
    }

    setAdminData({
      users: users.data || [],
      businesses: businesses.data || [],
      offers: offersRes.data || [],
      conversions: conversions.data || []
    });

    setLoading(false);
  }

  function AdminDashboard() {
    if (profile?.role !== 'admin') {
      return (
        <section className="card">
          <h2>Admin access required</h2>
          <p>
            Your account is not assigned the
            administrator role.
          </p>
        </section>
      );
    }

    if (!adminData) {
      return (
        <section className="card">
          <p className="eyebrow">
            ADMIN CONTROL CENTER
          </p>

          <h2>BayLINK Administration</h2>

          <p>
            Secure administrator area.
          </p>

          <button
            className="primary"
            onClick={loadAdmin}
          >
            {loading
              ? 'Loading…'
              : 'Open dashboard'}
          </button>
        </section>
      );
    }

    const totalCommission =
      adminData.conversions.reduce(
        (sum, c) =>
          sum +
          Number(
            c.commission_amount || 0
          ),
        0
      );

    const totalSales =
      adminData.conversions.reduce(
        (sum, c) =>
          sum +
          Number(
            c.sale_amount || 0
          ),
        0
      );

    return (
      <section>
        <div className="sectionHead">
          <p className="eyebrow">
            ADMIN CONTROL CENTER
          </p>

          <h2>BayLINK Administration</h2>
        </div>

        <div className="stats">
          <div>
            <span>Registered members</span>
            <strong>
              {adminData.users.length}
            </strong>
          </div>

          <div>
            <span>Businesses</span>
            <strong>
              {adminData.businesses.length}
            </strong>
          </div>

          <div>
            <span>Offers</span>
            <strong>
              {adminData.offers.length}
            </strong>
          </div>

          <div>
            <span>Tracked sales</span>
            <strong>
              {money(totalSales)}
            </strong>
          </div>

          <div>
            <span>
              Affiliate commissions
            </span>
            <strong>
              {money(totalCommission)}
            </strong>
          </div>
        </div>

        <div className="card">
          <h3>Recent members</h3>

          {adminData.users
            .slice(0, 20)
            .map(u => (
              <p key={u.id}>
                <b>
                  {u.display_name ||
                    'Member'}
                </b>{' '}
                — {u.role} —{' '}
                {u.referral_code}
              </p>
            ))}
        </div>

        <div className="card">
          <h3>Businesses</h3>

          {adminData.businesses.length ? (
            adminData.businesses.map(b => (
              <p key={b.id}>
                <b>{b.business_name}</b>{' '}
                —{' '}
                {b.approved
                  ? 'Approved'
                  : 'Pending'}
              </p>
            ))
          ) : (
            <p>No businesses yet.</p>
          )}
        </div>

        <div className="card">
          <h3>Conversions</h3>

          {adminData.conversions.length ? (
            adminData.conversions
              .slice(0, 20)
              .map(c => (
                <p key={c.id}>
                  {money(c.sale_amount)} sale
                  ·{' '}
                  {money(
                    c.commission_amount
                  )}{' '}
                  commission · {c.status}
                </p>
              ))
          ) : (
            <p>No conversions yet.</p>
          )}
        </div>
      </section>
    );
  }

  function MemberAuth() {
    return (
      <section className="auth card">
        <p className="eyebrow">
          MEMBER ACCOUNT
        </p>

        <h2>
          {authMode === 'signup'
            ? 'Create your BayLINK account'
            : 'Welcome back'}
        </h2>

        {authMode === 'signup' && (
          <>
            <input
              placeholder="Full name"
              value={name}
              onChange={e =>
                setName(e.target.value)
              }
            />

            <select
              value={role}
              onChange={e =>
                setRole(e.target.value)
              }
            >
              <option value="affiliate">
                Affiliate
              </option>

              <option value="business">
                Business
              </option>
            </select>
          </>
        )}

        <input
          type="tel"
          autoComplete="tel"
          placeholder="Phone number (08012345678)"
          value={phone}
          onChange={e =>
            setPhone(e.target.value)
          }
        />

        <input
          type="password"
          autoComplete={
            authMode === 'signup'
              ? 'new-password'
              : 'current-password'
          }
          placeholder="Password (6+ characters)"
          value={password}
          onChange={e =>
            setPassword(e.target.value)
          }
        />

        <button
          className="primary wide"
          disabled={loading}
          onClick={memberAuth}
        >
          {loading
            ? 'Please wait…'
            : authMode === 'signup'
            ? 'Create account'
            : 'Login'}
        </button>

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        <button
          className="link"
          onClick={() => {
            setMessage('');
            setAuthMode(
              authMode === 'signup'
                ? 'login'
                : 'signup'
            );
          }}
        >
          {authMode === 'signup'
            ? 'Already have an account? Login'
            : 'New here? Create an account'}
        </button>

        <button
          className="link"
          onClick={() => {
            setMessage('');
            setMode('admin-login');
            setPassword('');
          }}
        >
          Administrator login
        </button>
      </section>
    );
  }

  function AdminLogin() {
    return (
      <section className="auth card">
        <p className="eyebrow">
          ADMINISTRATOR ONLY
        </p>

        <h2>BayLINK Admin Login</h2>

        <p>
          Administrators use email and
          password. Members use phone and
          password.
        </p>

        <input
          type="email"
          autoComplete="email"
          placeholder="Administrator email"
          value={email}
          onChange={e =>
            setEmail(e.target.value)
          }
        />

        <input
          type="password"
          autoComplete="current-password"
          placeholder="Administrator password"
          value={password}
          onChange={e =>
            setPassword(e.target.value)
          }
        />

        <button
          className="primary wide"
          disabled={loading}
          onClick={adminLogin}
        >
          {loading
            ? 'Signing in…'
            : 'Admin Login'}
        </button>

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        <button
          className="link"
          onClick={() => {
            setMessage('');
            setMode('login');
            setPassword('');
          }}
        >
          Back to member login
        </button>
      </section>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          Bay<span>LINK</span>{' '}
          <small>Affiliate</small>
        </div>

        <nav>
          <button
            onClick={() =>
              setMode('home')
            }
          >
            Home
          </button>

          {session && (
            <button
              onClick={() =>
                setMode('dashboard')
              }
            >
              Dashboard
            </button>
          )}

          <button
            onClick={() =>
              setMode('businesses')
            }
          >
            Businesses
          </button>

          <button
            onClick={() =>
              setMode('ai')
            }
          >
            AI Scout
          </button>

          {profile?.role === 'admin' && (
            <button
              onClick={() => {
                setMode('admin');
                loadAdmin();
              }}
            >
              Admin
            </button>
          )}

          {session ? (
            <button
              className="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                setAdminData(null);
                setMode('home');
              }}
            >
              Logout
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => {
                setAuthMode('login');
                setPassword('');
                setMessage('');
                setMode('login');
              }}
            >
              Join / Login
            </button>
          )}
        </nav>
      </header>

      <main>
        {mode === 'home' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">
                  AFRICAN BUSINESS × AFFILIATE
                  GROWTH
                </p>

                <h1>
                  Turn connections into{' '}
                  <span>income.</span>
                </h1>

                <p>
                  BayLINK helps businesses find
                  customers and gives affiliates
                  tools to promote products and earn
                  commissions.
                </p>

                <div className="actions">
                  <button
                    className="primary"
                    onClick={() => {
                      setRole('affiliate');
                      setAuthMode('signup');
                      setMode('signup');
                    }}
                  >
                    Become an Affiliate
                  </button>

                  <button
                    className="outline"
                    onClick={() => {
                      setRole('business');
                      setAuthMode('signup');
                      setMode('signup');
                    }}
                  >
                    List My Business
                  </button>
                </div>
              </div>

              <div className="heroCard">
                <b>Affiliate engine</b>

                <strong>5%+</strong>

                <span>
                  Flexible commissions per offer
                </span>

                <hr />

                <span>
                  ✓ Referral tracking
                </span>

                <span>
                  ✓ Conversion reporting
                </span>

                <span>
                  ✓ Secure payouts
                </span>
              </div>
            </section>

            <section className="grid">
              <article>
                <b>For Affiliates</b>
                <h3>Discover offers</h3>
                <p>
                  Get unique referral links and
                  track clicks, conversions and
                  earnings.
                </p>
              </article>

              <article>
                <b>For Businesses</b>
                <h3>Find promoters</h3>
                <p>
                  Put your products in front of
                  motivated affiliates and customers.
                </p>
              </article>

              <article>
                <b>AI Scout</b>
                <h3>Find opportunities</h3>
                <p>
                  Use our AI assistant to identify
                  promising businesses and affiliate
                  opportunities.
                </p>
              </article>
            </section>
          </>
        )}

        {(mode === 'login' ||
          mode === 'signup') && (
          <MemberAuth />
        )}

        {mode === 'admin-login' && (
          <AdminLogin />
        )}

        {mode === 'dashboard' &&
          session && (
            <section>
              <div className="sectionHead">
                <p className="eyebrow">
                  YOUR DASHBOARD
                </p>

                <h2>
                  Welcome,{' '}
                  {profile?.display_name ||
                    'Member'}
                </h2>
              </div>

              <div className="stats">
                <div>
                  <span>Clicks</span>
                  <strong>
                    {stats.clicks}
                  </strong>
                </div>

                <div>
                  <span>Conversions</span>
                  <strong>
                    {stats.conversions}
                  </strong>
                </div>

                <div>
                  <span>Commission</span>
                  <strong>
                    {money(stats.commission)}
                  </strong>
                </div>
              </div>

              <h3>
                Available offers
              </h3>

              <div className="offers">
                {offers.length ? (
                  offers.map(o => (
                    <article
                      className="offer"
                      key={o.id}
                    >
                      <b>
                        {o.business_name}
                      </b>

                      <h3>
                        {o.title}
                      </h3>

                      <p>
                        {o.description}
                      </p>

                      <strong>
                        {o.commission_rate}%
                        commission
                      </strong>

                      <button
                        className="primary"
                        onClick={() =>
                          referral(o)
                        }
                      >
                        Get referral link
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="card">
                    <p>
                      No active offers
                      published yet.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

        {mode === 'businesses' && (
          <section>
            <p className="eyebrow">
              PARTNER BUSINESSES
            </p>

            <h2>
              Offers built for promotion
            </h2>

            <div className="offers">
              {offers.map(o => (
                <article
                  className="offer"
                  key={o.id}
                >
                  <b>
                    {o.business_name}
                  </b>

                  <h3>
                    {o.title}
                  </h3>

                  <p>
                    {o.description}
                  </p>

                  <strong>
                    {o.commission_rate}%
                    commission
                  </strong>
                </article>
              ))}

              {!offers.length && (
                <div className="card">
                  <p>
                    Business offers will
                    appear here when partners
                    publish them.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {mode === 'ai' && (
          <section className="ai">
            <p className="eyebrow">
              BAYLINK AI SCOUT
            </p>

            <h2>
              Find businesses & affiliate
              opportunities
            </h2>

            <p>
              Describe the market, location,
              product category or type of
              business you want to target.
            </p>

            <textarea
              value={aiPrompt}
              onChange={e =>
                setAiPrompt(e.target.value)
              }
              placeholder="Example: Find small businesses in Nigeria that could benefit from affiliate marketing for fashion and beauty products."
            />

            <button
              className="primary"
              disabled={
                !aiPrompt.trim() ||
                loading
              }
              onClick={askAI}
            >
              {loading
                ? 'Researching…'
                : 'Ask BayLINK AI'}
            </button>

            {aiResult && (
              <pre className="aiResult">
                {aiResult}
              </pre>
            )}
          </section>
        )}

        {mode === 'admin' && (
          <AdminDashboard />
        )}
      </main>

      <footer>
        © 2026 BayLINK Affiliate · Built
        for businesses and affiliates.
      </footer>
    </div>
  );
}

createRoot(
  document.getElementById('root')
).render(<App />);
