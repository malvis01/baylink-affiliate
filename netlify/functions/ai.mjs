import OpenAI from 'openai';
export default async (req) => {
  if(req.method !== 'POST') return new Response('Method not allowed',{status:405});
  try {
    const {prompt}=await req.json();
    if(!prompt || typeof prompt!=='string') return Response.json({error:'A research request is required.'},{status:400});
    const client=new OpenAI();
    const completion=await client.chat.completions.create({model:'gpt-4o-mini',temperature:.2,messages:[
      {role:'system',content:'You are BayLINK AI Scout. Help affiliates and businesses identify legitimate business prospects and affiliate opportunities. Produce practical prospecting ideas, target customer profiles, outreach angles, qualification criteria, and ethical next steps. Never claim you contacted a business, found private contact data, or verified a company unless that information is supplied by the user or a connected data source.'},
      {role:'user',content:prompt}
    ]});
    return Response.json({response:completion.choices?.[0]?.message?.content||'No result.'});
  } catch(error){ console.error(error); return Response.json({error:'AI service is temporarily unavailable.'},{status:500}); }
};
export const config={path:'/api/ai',method:'POST'};
