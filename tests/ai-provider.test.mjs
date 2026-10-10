import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAIConfig, estimateAIUSD, requestJSON } from '../server/ai-provider.mjs';

test('Groq remains default; OpenAI activates only when selected', () => {
 const oldProvider=process.env.AI_PROVIDER, oldKey=process.env.OPENAI_API_KEY;
 try{
  delete process.env.AI_PROVIDER;
  process.env.OPENAI_API_KEY='not-a-real-key';
  assert.equal(resolveAIConfig().provider,'groq');
  assert.equal(resolveAIConfig().model,'openai/gpt-oss-120b');
  const selected=resolveAIConfig({provider:'openai'});
  assert.equal(selected.provider,'openai');
  assert.equal(selected.model,'gpt-6-luna');
  assert.equal(selected.apiKey,'not-a-real-key');
  assert.throws(()=>resolveAIConfig({provider:'untrusted'}),/groq or openai/);
 }finally{
  if(oldProvider===undefined) delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=oldProvider;
  if(oldKey===undefined) delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
 }
});

test('Luna Chat Completions requests are JSON and have a usage estimate', async () => {
 const oldKey=process.env.OPENAI_API_KEY, oldFetch=globalThis.fetch;
 let called;
 process.env.OPENAI_API_KEY='fake-for-test';
 globalThis.fetch=async (url, init)=>{
  called={url,init};
  return {ok:true,json:async()=>({
   choices:[{message:{content:'{"loops":[]}'}}],
   usage:{prompt_tokens:1500,completion_tokens:200}
  })};
 };
 try{
  let usage;
  const result=await requestJSON('Верни JSON {"loops":[]}',{provider:'openai',onUsage:u=>{usage=u;}});
  assert.deepEqual(result,{loops:[]});
  assert.equal(called.url,'https://api.openai.com/v1/chat/completions');
  assert.equal(called.init.headers.Authorization,'Bearer fake-for-test');
  assert.equal(JSON.parse(called.init.body).reasoning_effort,'none');
  assert.equal(JSON.parse(called.init.body).response_format.type,'json_object');
  assert.equal(usage.provider,'openai');
  assert.ok(Math.abs(usage.estimatedCostUSD-0.00025)<1e-9);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
 }
});

test('Groq keeps same JSON mode and no unsupported reasoning settings', async () => {
 const oldKey=process.env.GROQ_API_KEY, oldFetch=globalThis.fetch;
 process.env.GROQ_API_KEY='fake-for-test';
 let called;
 globalThis.fetch=async (url,init)=>{
  called={url,init};
  return {ok:true,json:async()=>({choices:[{message:{content:'{"ids":[]}'}}],usage:{prompt_tokens:1000,completion_tokens:300}})};
 };
 try{
  const parsed=await requestJSON('Верни JSON {"ids":[]}',{provider:'groq'});
  assert.deepEqual(parsed,{ids:[]});
  assert.equal(called.url,'https://api.groq.com/openai/v1/chat/completions');
  const body=JSON.parse(called.init.body);
  assert.equal(body.temperature,0.1);
  assert.equal(body.reasoning_effort,undefined);
  assert.equal(estimateAIUSD({provider:'groq',model:'openai/gpt-oss-120b',usage:{prompt_tokens:1000,completion_tokens:300}}),0.00033);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;
 }
});

test('No key means no external request', async () => {
 const oldKey=process.env.OPENAI_API_KEY;
 delete process.env.OPENAI_API_KEY;
 try{await assert.rejects(()=>requestJSON('Верни JSON',{provider:'openai'}),/OPENAI_API_KEY/);}
 finally{if(oldKey!==undefined)process.env.OPENAI_API_KEY=oldKey;}
});
