import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const json = (body, status = 200) =>
  Response.json(body, { status });

function getClients() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!url || !serviceKey || !openaiKey) {
    throw new Error(
      'Growth engine requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.'
    );
  }

  return {
    supabase: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    }),
    openai: new OpenAI({ apiKey: openaiKey })
  };
}

async function buildSnapshot(supabase) {
  const [profiles, businesses, offers, clicks, conversions] = await Promise.all([
    supabase.from('affiliate_profiles').select('id,role,created_at'),
    supabase.from('business_profiles').select('id,business_name,category,location,approved,created_at'),
    supabase.from('affiliate_offers').select('id,business_id,business_name,title,description,commission_rate,active,created_at'),
    supabase.from('affiliate_clicks').select('id,offer_id,affiliate_id,created_at'),
    supabase.from('affiliate_conversions').select('id,offer_id,affiliate_id,sale_amount,commission_amount,status,created_at')
  ]);

  const firstError = [profiles, businesses, offers, clicks, conversions].find(r => r.error);
  if (firstError) throw firstError.error;

  const rows = {
    members: profiles.data || [],
    businesses: businesses.data || [],
    offers: offers.data || [],
    clicks: clicks.data || [],
    conversions: conversions.data || []
  };

  const approvedBusinesses = rows.businesses.filter(b => b.approved);
  const activeOffers = rows.offers.filter(o => o.active);
  const approvedConversions = rows.conversions.filter(c => ['approved', 'paid'].includes(c.status));
  const sales = approvedConversions.reduce((sum, c) => sum + Number(c.sale_amount || 0), 0);
  const commissions = approvedConversions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

  return {
    generated_at: new Date().toISOString(),
    member_count: rows.members.length,
    affiliate_count: rows.members.filter(m => m.role === 'affiliate').length,
    business_member_count: rows.members.filter(m => m.role === 'business').length,
    business_count: rows.businesses.length,
    approved_business_count: approvedBusinesses.length,
    active_offer_count: activeOffers.length,
    click_count: rows.clicks.length,
    conversion_count: approvedConversions.length,
    sales_amount: sales,
    commission_amount: commissions,
    businesses: approvedBusinesses.slice(0, 50),
    active_offers: activeOffers.slice(0, 50)
  };
}

async function generateReport(openai, snapshot) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are BayLINK AI Growth Engine. Your job is to prepare a practical growth queue that can be reviewed by the owner each morning. You do not contact people, create fake leads, invent business details, or claim actions were completed. Use only the supplied platform data. Return JSON with exactly these keys: summary (string), recommendations (array of objects), priorities (array of strings). Each recommendation must have title, priority (high|medium|low), reason, action, and expected_outcome. Focus on increasing legitimate affiliates, active businesses, offer promotion, clicks, conversions and commission revenue. Prefer small measurable experiments over vague advice.`
      },
      {
        role: 'user',
        content: `Create the next growth queue from this current BayLINK snapshot:\n${JSON.stringify(snapshot)}`
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned no growth report.');

  const report = JSON.parse(content);
  return {
    summary: String(report.summary || 'No summary generated.'),
    recommendations: Array.isArray(report.recommendations) ? report.recommendations.slice(0, 12) : [],
    priorities: Array.isArray(report.priorities) ? report.priorities.slice(0, 8) : []
  };
}

export default async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  try {
    const { supabase, openai } = getClients();
    const snapshot = await buildSnapshot(supabase);
    const report = await generateReport(openai, snapshot);

    const { data, error } = await supabase
      .from('ai_growth_reports')
      .insert({
        report_type: 'overnight_growth',
        summary: report.summary,
        recommendations: report.recommendations,
        metrics: {
          ...snapshot,
          businesses: undefined,
          active_offers: undefined,
          priorities: report.priorities
        }
      })
      .select('id,report_type,generated_at,summary,recommendations,metrics')
      .single();

    if (error) throw error;

    return json({ ok: true, report: data });
  } catch (error) {
    console.error('growth-engine', error);
    return json({
      ok: false,
      error: error?.message || 'Growth engine failed.'
    }, 500);
  }
};

export const config = {
  path: '/api/growth-engine',
  schedule: '0 */6 * * *'
};
