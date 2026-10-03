import 'dotenv/config';
import fs from 'node:fs/promises';
import { classifyWithAI } from '../server/ai-classifier.mjs';

const path = process.argv[2] || new URL('./golden-hard.json', import.meta.url);
const cases = JSON.parse(await fs.readFile(path, 'utf8'));

function typesOf(items) {
  return [...new Set((items || []).map((x) => x.type))].sort();
}
function same(a,b){ return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()); }

let passed=0;
const rows=[];
for (const c of cases) {
  try {
    const actual = await classifyWithAI({
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
}
console.table(rows.map(({id,ok,expected,actual})=>({id,result:ok?'PASS':'FAIL',expected,actual})));
console.log('\n' + passed + '/' + cases.length + ' passed');
console.log('\nFailures:');
for (const r of rows.filter(x=>!x.ok)) console.log('- ' + r.id + ': expected ' + r.expected + ', got ' + r.actual + ' — ' + r.note);
process.exitCode = passed === cases.length ? 0 : 1;
