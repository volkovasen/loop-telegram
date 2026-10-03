import 'dotenv/config';
import fs from 'node:fs/promises';
import { classifyWithAI } from '../server/ai-classifier.mjs';

const path = process.argv[2] || new URL('./golden-hard.json', import.meta.url);
const cases = JSON.parse(await fs.readFile(path, 'utf8'));

function typesOf(items) {
  return [...new Set((items || []).map((x) => x.type))].sort();
}
function same(a,b){ return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()); }
function sleep(ms){ return new Promise((resolve) => setTimeout(resolve, ms)); }

const interCaseDelayMs = Number(process.env.GOLDEN_DELAY_MS || 6500);
const maxAttempts = Number(process.env.GOLDEN_MAX_ATTEMPTS || 4);

async function classifyWithRetry(input) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await classifyWithAI(input);
    } catch (e) {
      lastError = e;
      const message = String(e?.message || e);
      if (!message.includes('Groq API 429') || attempt === maxAttempts) throw e;

      const waitMatch = message.match(/try again in ([\d.]+)s/i);
      const suggestedMs = waitMatch ? Math.ceil(Number(waitMatch[1]) * 1000) : 7000;
      const waitMs = Math.max(interCaseDelayMs, suggestedMs + 1000);
      console.log(`429 on attempt ${attempt}/${maxAttempts}, waiting ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

let passed=0;
const rows=[];
for (let index = 0; index < cases.length; index++) {
  const c = cases[index];
  try {
    const actual = await classifyWithRetry({
      text:c.text, author:c.author, messageId:c.id, chatId:'benchmark',
      receivedAt:'2026-09-20T12:00:00+05:00', person:{name:c.author}
    });
    const got=typesOf(actual);
    const ok=same(got,c.expected);
    if(ok) passed++;
    rows.push({id:c.id,ok,expected:c.expected.join(',')||'IGNORE',actual:got.join(',')||'IGNORE',note:c.note});
  } catch (e) {
    rows.push({id:c.id,ok:false,expected:c.expected.join(',')||'IGNORE',actual:'ERROR',note:String(e.message||e)});
  }

  if (index < cases.length - 1) await sleep(interCaseDelayMs);
}

console.table(rows.map(({id,ok,expected,actual})=>({id,result:ok?'PASS':'FAIL',expected,actual})));
console.log('\n' + passed + '/' + cases.length + ' passed');
console.log('\nFailures:');
for (const r of rows.filter(x=>!x.ok)) console.log('- ' + r.id + ': expected ' + r.expected + ', got ' + r.actual + ' — ' + r.note);
process.exitCode = passed === cases.length ? 0 : 1;
