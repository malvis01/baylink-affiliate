import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import './styles.css';

const money = n => `₦${Number(n || 0).toLocaleString()}`;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('affiliate');
  const [message, setMessage] = useState('');
  const [offers, setOffers] = useState([]);
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, commission: 0 });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadData();
    else setProfile(null);
  }, [session]);

  async function loadData() {
    if (!supabase || !session) return;
    const [{ data: p }, { data: activeOffers }, { data: s }] = await Promise.all([
      supabase.from('affiliate_profiles').select('id,display_name,role,referral_code').eq('id', session.user.id).maybeSingle(),
      supabase.from('affiliate_offers').select('*').eq('active', true).order('created_at', { ascending: false }),
      supabase.from('affiliate_stats').select('*').eq('user_id', session.user.id).maybeSingle()
    ]);
    setProfile(p || null);
    setOffers(activeOffers || []);
    if (s) setStats(s);
  }

  async function auth() {
    setMessage('');
    if (!supabase) { setMessage('BayLINK is not connected to Supabase yet.'); return; }
    if (!email || !password || (mode === 'signup' && !name)) { setMessage('Please complete all required fields.'); return; }
    setLoading(true);
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim(), requested_role: role } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === 'signup') {
      if (result.data?.session) {
        setSession(result.data.session);
        setMode('dashboard');
        setMessage('Account created successfully.');
      } else {
        setMessage('Account created. Please check your email and confirm your account before logging in.');
      }
    } else {
      if (result.data?.session) { setSession(result.data.session); setMode('dashboard'); }
      setMessage('Welcome back.');
    }
  }

  async function askAI() {
    if (!aiPrompt.trim()) return;
    setAiResult(''); setLoading(true);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt.trim() }) });
      const j = await r.json();
      setAiResult(j.response || j.error || 'No result.');
    } catch { setAiResult('AI service is temporarily unavailable.'); }
    setLoading(false);
  }

  async function referral(offer) {
    if (!supabase || !session) return;
    const code = `${session.user.id.slice(0, 8)}-${offer.id}`;
    const { error } = await supabase.from('affiliate_clicks').insert({ offer_id: offer.id, affiliate_id: session.user.id, referral_code: code });
    if (error) { setMessage(error.message); return; }
    const link = `${location.origin}/offer/${offer.id}?ref=${code}`;
    try { await navigator.clipboard.writeText(link); setMessage('Referral link copied.'); } catch { setMessage(link); }
  }

  async function loadAdmin() {
    if (!supabase || profile?.role !== 'admin') return;
    setLoading(true); setMessage('');
    const [users, businesses, offersRes, conversions] = await Promise.all([
      supabase.from('affiliate_profiles').select('id,display_name,role,referral_code,created_at').order('created_at', { ascending: false }),
      supabase.from('business_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('affiliate_offers').select('*').order('created_at', { ascending: false }),
      supabase.from('affiliate_conversions').select('*').order('created_at', { ascending: false })
    ]);
    const error = users.error || businesses.error || offersRes.error || conversions.error;
    if (error) setMessage(error.message);
    setAdminData({ users: users.data || [], businesses: businesses.data || [], offers: offersRes.data || [], conversions: conversions.data || [] });
    setLoading(false);
  }

  function AdminDashboard() {
    if (profile?.role !== 'admin') return <section className="card"><h2>Admin access required</h2><p>Your account is not assigned the administrator role.</p></section>;
    if (!adminData) return <section className="card"><h2>Admin dashboard</h2><p>Secure administrator area.</p><button className="primary" onClick={loadAdmin}>{loading ? 'Loading…' : 'Load platform data'}</button></section>;
    return <section><div className="sectionHead"><p className="eyebrow">ADMIN CONTROL CENTER</p><h2>BayLINK Affiliate Administration</h2></div><div className="stats"><div><span>Registered members</span><strong>{adminData.users.length}</strong></div><div><span>Businesses</span><strong>{adminData.businesses.length}</strong></div><div><span>Offers</span><strong>{adminData.offers.length}</strong></div></div><div className="card"><h3>Recent members</h3>{adminData.users.slice(0, 20).map(u => <p key={u.id}><b>{u.display_name || 'Member'}</b> — {u.role} — {u.referral_code}</p>)}</div><div className="card"><h3>Businesses</h3>{adminData.businesses.length ? adminData.businesses.map(b => <p key={b.id}><b>{b.business_name}</b> — {b.approved ? 'Approved' : 'Pending'}</p>) : <p>No businesses yet.</p>}</div><div className="card"><h3>Conversions</h3>{adminData.conversions.length ? adminData.conversions.slice(0, 20).map(c => <p key={c.id}>{money(c.sale_amount)} sale · {money(c.commission_amount)} commission · {c.status}</p>) : <p>No conversions yet.</p>}</div></section>;
  }

  return <div className="app">
    <header><div className="brand">Bay<span>LINK</span> <small>Affiliate</small></div><nav>
      <button onClick={() => setMode('home')}>Home</button>
      {session && <button onClick={() => setMode('dashboard')}>Dashboard</button>}
      <button onClick={() => setMode('businesses')}>Businesses</button>
      <button onClick={() => setMode('ai')}>AI Scout</button>
      {profile?.role === 'admin' && <button onClick={() => { setMode('admin'); loadAdmin(); }}>Admin</button>}
      {session ? <button className="outline" onClick={() => supabase.auth.signOut()}>Logout</button> : <button className="primary" onClick={() => setMode('login')}>Join / Login</button>}
    </nav></header>
    <main>
      {mode === 'home' && <><section className="hero"><div><p className="eyebrow">AFRICAN BUSINESS × AFFILIATE GROWTH</p><h1>Turn connections into <span>income.</span></h1><p>BayLINK helps businesses find customers and gives affiliates tools to promote products and earn commissions.</p><div className="actions"><button className="primary" onClick={() => { setRole('affiliate'); setMode('signup'); }}>Become an Affiliate</button><button className="outline" onClick={() => { setRole('business'); setMode('signup'); }}>List My Business</button></div></div><div className="heroCard"><b>Affiliate engine</b><strong>5%+</strong><span>Flexible commissions per offer</span><hr/><span>✓ Referral tracking</span><span>✓ Conversion reporting</span><span>✓ Secure payouts</span></div></section><section className="grid"><article><b>For Affiliates</b><h3>Discover offers</h3><p>Get unique referral links and track clicks, conversions and earnings.</p></article><article><b>For Businesses</b><h3>Find promoters</h3><p>Put your products in front of motivated affiliates and customers.</p></article><article><b>AI Scout</b><h3>Find opportunities</h3><p>Use our AI assistant to identify promising businesses and affiliate opportunities.</p></article></section></>}
      {(mode === 'login' || mode === 'signup') && <section className="auth card"><h2>{mode === 'signup' ? 'Create your BayLINK account' : 'Welcome back'}</h2>{mode === 'signup' && <><input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} /><select value={role} onChange={e => setRole(e.target.value)}><option value="affiliate">Affiliate</option><option value="business">Business</option></select></>}<input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><button className="primary wide" disabled={loading} onClick={auth}>{loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Login'}</button><p>{message}</p><button className="link" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Already have an account? Login' : 'New here? Create an account'}</button></section>}
      {mode === 'dashboard' && session && <section><div className="sectionHead"><p className="eyebrow">YOUR DASHBOARD</p><h2>Welcome, {profile?.display_name || session.user.email}</h2></div><div className="stats"><div><span>Clicks</span><strong>{stats.clicks}</strong></div><div><span>Conversions</span><strong>{stats.conversions}</strong></div><div><span>Commission</span><strong>{money(stats.commission)}</strong></div></div><h3>Available offers</h3><div className="offers">{offers.length ? offers.map(o => <article className="offer" key={o.id}><b>{o.business_name}</b><h3>{o.title}</h3><p>{o.description}</p><strong>{o.commission_rate}% commission</strong><button className="primary" onClick={() => referral(o)}>Get referral link</button></article>) : <div className="card"><p>No active offers published yet.</p></div>}</div></section>}
      {mode === 'businesses' && <section><p className="eyebrow">PARTNER BUSINESSES</p><h2>Offers built for promotion</h2><div className="offers">{offers.map(o => <article className="offer" key={o.id}><b>{o.business_name}</b><h3>{o.title}</h3><p>{o.description}</p><strong>{o.commission_rate}% commission</strong></article>)}{!offers.length && <div className="card"><p>Business offers will appear here when partners publish them.</p></div>}</div></section>}
      {mode === 'ai' && <section className="ai"><p className="eyebrow">BAYLINK AI SCOUT</p><h2>Find businesses & affiliate opportunities</h2><p>Describe the market, location, product category or type of business you want to target.</p><textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Example: Find small businesses in Nigeria that could benefit from affiliate marketing for fashion and beauty products."/><button className="primary" disabled={!aiPrompt.trim() || loading} onClick={askAI}>{loading ? 'Researching…' : 'Ask BayLINK AI'}</button>{aiResult && <pre className="aiResult">{aiResult}</pre>}</section>}
      {mode === 'admin' && <AdminDashboard />}
    </main><footer>© 2026 BayLINK Affiliate · Built for businesses and affiliates.</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
