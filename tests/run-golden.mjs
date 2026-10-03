import 'dotenv/config';
import fs from 'node:fs/promises';
import { classifyLoopsWithAI } from '../server/ai-classifier.mjs';
const path=process.argv[2]||new URL('./golden-hard.json',import.meta.url),cases=JSON.parse(await fs.readFile(path,'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),delay=Number(process.env.GOLDEN_DELAY_MS||6500),attempts=Number(process.env.GOLDEN_MAX_ATTEMPTS||4);
async function run(input){let last;for(let i=1;i<=attempts;i++){try{return await classifyLoopsWithAI(input)}catch(e){last=e;const m=String(e?.message||e);if(!m.includes('Groq API 429')||i===attempts)throw e;const x=m.match(/try again in ([\d.]+)s/i);await sleep(Math.max(delay,(x?Number(x[1])*1000:7000)+1000))}}throw last}
const types=x=>[...new Set((x||[]).map(v=>v.type))].sort(),same=(a,b)=>JSON.stringify(a.sort())===JSON.stringify([...b].sort());let passed=0;const rows=[];
for(let i=0;i<cases.length;i++){const c=cases[i];try{const actual=await run({text:c.text,author:c.author,messageId:c.id,chatId:'benchmark',receivedAt:'2026-09-20T12:00:00+05:00',person:{name:c.author},perspective:c.author==='Я'?'self':'other'}),got=types(actual),ok=same(got,c.expected);if(ok)passed++;rows.push({id:c.id,result:ok?'PASS':'FAIL',expected:c.expected.join(',')||'IGNORE',actual:got.join(',')||'IGNORE'})}catch(e){rows.push({id:c.id,result:'FAIL',expected:c.expected.join(',')||'IGNORE',actual:'ERROR',error:String(e?.message||e)})}if(i<cases.length-1)await sleep(delay)}
console.table(rows.map(({id,result,expected,actual})=>({id,result,expected,actual})));console.log(`\n${passed}/${cases.length} passed`);for(const r of rows.filter(x=>x.result==='FAIL'))console.log(`- ${r.id}: expected ${r.expected}, got ${r.actual}${r.error?` — ${r.error}`:''}`);process.exitCode=passed===cases.length?0:1;
