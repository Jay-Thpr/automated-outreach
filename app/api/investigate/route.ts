import {NextRequest,NextResponse} from 'next/server';
import {investigate,portfolios,PortfolioId} from '../../../lib/analytics';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const body=await request.json();
  const question=typeof body.question==='string'?body.question.trim().slice(0,1200):'';
  const id:PortfolioId=['ai','balanced','transition'].includes(body.portfolioId)?body.portfolioId:'ai';
  if(!question)return NextResponse.json({error:'Question is required.'},{status:400});
  const p=portfolios[id];
  const computed=investigate(p,question);
  const key=process.env.OPENAI_API_KEY;
  if(!key)return NextResponse.json({...computed,mode:'demo',answer:null});
  const model=process.env.OPENAI_MODEL||'gpt-4.1-mini';
  try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),16000);
   const response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',signal:controller.signal,
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
    body:JSON.stringify({model,temperature:0.3,max_tokens:440,
      messages:[{role:'system',content:'You are Atlas, a diligent institutional portfolio research agent in a fictional product demo. Synthesize the provided DETERMINISTIC tool outputs into a short, engaging, analyst-quality narrative. Strict rules: all portfolios, values, betas and scenarios are SYNTHETIC examples, not live market data. Never invent figures, returns, correlations, benchmark comparisons, specific news, or attribution. Never state this is MSCI licensed output. Highlight ONE non-obvious insight, state uncertainty and what further data would improve confidence. Keep under 155 words. No investment recommendations or guarantees.'},
       {role:'user',content:JSON.stringify({question,portfolio:p.name,portfolioDescription:p.description,toolEvidence:computed})}]})
   });clearTimeout(timer);
   if(!response.ok)throw new Error('Model request failed');
   const payload=await response.json();
   const answer=payload?.choices?.[0]?.message?.content;
   if(typeof answer!=='string'||!answer.trim())throw new Error('Empty model response');
   return NextResponse.json({...computed,mode:'ai',answer:answer.trim()});
  }catch{return NextResponse.json({...computed,mode:'demo',answer:null,notice:'Live AI unavailable; verified demo analysis shown.'});}
 }catch{return NextResponse.json({error:'Unable to process this request.'},{status:400});}
}
