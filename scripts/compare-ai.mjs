import 'dotenv/config';
import fs from 'node:fs/promises';
import { classifyWithAI } from '../server/ai-classifier.mjs';
import { resolveAIConfig, MODEL_PRICES_USD_PER_MILLION } from '../server/ai-provider.mjs';

const args = process.argv.slice(2);
function flag(name, fallback) {
 const arg = args.find(item => item.startsWith(`--${name}=`));
 return arg ? arg.slice(name.length + 3) : fallback;
}
const live = args.includes('--live');
const providerOption = flag('provider', 'both');
if (!['both','groq','openai'].includes(providerOption)) throw new Error('Use --provider=groq|openai|both');
const providers = providerOption === 'both' ? ['groq','openai'] : [providerOption];
const all = JSON.parse(await fs.readFile(new URL('../tests/ai-eval.json',import.meta.url),'utf8'));
const max = Number(flag('max', '5'));
const maxUSD = Number(flag('max-usd','0.05'));
const delayMs = Number(flag('delay-ms','22000'));
if(!Number.isInteger(max)||max<1||max>all.length||!Number.isFinite(maxUSD)||maxUSD<=0||maxUSD>5||!Number.isFinite(delayMs)||delayMs<0||delayMs>120000)
 throw new Error('Invalid limits. max:1..'+all.length+'; max-usd:0..5; delay-ms:0..120000');
const cases = all.slice(0,max);
function identity(x){return [x.type,x.kind,x.agreementStatus,x.nextAction].map(v=>v??'-').join('/')}
function matches(expected,actual){
 return Object.entries(expected).every(([key,value])=>actual?.[key]===value);
}
function evaluate(c,result) {
 const actual=[...result];
 const miss=[];
 for(const expected of c.expected){
  const at=actual.findIndex(x=>matches(expected,x));
  if(at<0)miss.push(identity(expected));else actual.splice(at,1);
 }
 const correct=miss.length===0&&actual.length===0&&(c.dueAt!==false||result.every(x=>!x.dueAt));
 return {ok:correct,issues:[...miss.map(x=>'missing:'+x),...actual.map(x=>'extra:'+identity(x)),...(c.dueAt===false&&result.some(x=>x.dueAt)?['unexpected dueAt']:[])]};
}
console.log('LOOP AI model comparison. Cases:',cases.length);
console.log('This command NEVER sends real Telegram messages: only local test fixtures.');
for(const provider of providers) {
 const config = resolveAIConfig({provider});
 console.log(`\n${provider}/${config.model} | published estimate: `,MODEL_PRICES_USD_PER_MILLION[`${provider}:${config.model}`]??'unpriced model');
 if(!live) continue;
 if(!config.apiKey){console.log(`SKIPPED: ${provider==='groq'?'GROQ_API_KEY':'OPENAI_API_KEY'} not set`);continue;}
 if(!MODEL_PRICES_USD_PER_MILLION[`${provider}:${config.model}`]){console.log('SKIPPED: unknown token price. Select a priced model before a paid benchmark.');continue;}
 let score=0,cost=0,known=0,attempted=0;
 for(let i=0;i<cases.length;i++) {
  if(cost>=maxUSD){console.log('Stopping: estimated cost ceiling reached');break;}
  const c=cases[i];let usage=null,raw=null;attempted++;
  try{
   const result = await classifyWithAI({
    text:c.text,author:c.author,messageId:i+1,chatId:100,receivedAt:'2026-10-11T09:00:00+05:00',
    person:{name:c.author}
   },{provider,onUsage:u=>{usage=u},onRaw:r=>{raw=r}});
   const evaluation=evaluate(c,result??[]);
   if(evaluation.ok)score++;
   const charge=usage?.estimatedCostUSD;
   if(typeof charge==='number'){cost+=charge;known++}
   console.log(JSON.stringify({
    id:c.id,ok:evaluation.ok,issues:evaluation.issues,
    predicted:(result??[]).map(x=>({type:x.type,kind:x.kind,agreementStatus:x.agreementStatus,nextAction:x.nextAction,title:x.title,dueAt:x.dueAt??null})),
    rawAI:(raw?.loops??[]).map(x=>({type:x.type,kind:x.kind,agreementStatus:x.agreementStatus})),
    tokens:usage?.usage??null,estimatedCostUSD:charge??null
   }));
  }catch(error){console.log(JSON.stringify({id:c.id,error:String(error.message??error).slice(0,260)}))}
  if(i<cases.length-1)await new Promise(resolve=>setTimeout(resolve,delayMs));
 }
 console.log(`RESULT ${provider}: ${score}/${attempted} passed; estimated text cost ${cost.toFixed(5)} (${known} measured requests)`);
}
if(!live) console.log('\nDRY RUN: no API calls made. Use --live --provider=groq|openai|both --max=5 to spend API tokens deliberately.');
