import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoLoops, DEMO_TAGS } from '../server/demo-seeds.mjs';
import { temporalStatus } from '../server/temporal.mjs';

test('Telegram /demo generates exactly two private, clearly labeled local examples', () => {
 const now=new Date('2026-10-12T03:46:00+05:00');
 const items=makeDemoLoops('123456789',{now,timeZone:'Asia/Yekaterinburg'});
 assert.equal(items.length,2);
 assert.deepEqual(items.map(item=>item.seedTag),DEMO_TAGS);
 assert.ok(items.every(item=>item.ownerId==='123456789'));
 assert.ok(items.every(item=>item.title.startsWith('ТЕСТ · ')));
 assert.ok(items.every(item=>item.source.text.includes('ТЕСТОВОЕ СООБЩЕНИЕ')));
 assert.ok(items.every(item=>item.status==='open'));
 assert.ok(items.every(item=>item.source.messageId<0));
 assert.notEqual(items[0].id,items[1].id);
 assert.equal(items[0].type,'reply');
 assert.equal(items[0].kind,'plan');
 assert.equal(items[0].agreementStatus,'proposed');
 assert.equal(items[0].nextAction,'coordinate');
 assert.equal(items[0].participants[0].name,'Тестовый Кирилл');
 assert.equal(items[0].deadlineDate,undefined);
 assert.equal(items[1].type,'todo');
 assert.equal(items[1].deadlineDate,'2026-10-11');
 assert.equal(items[1].nextAction,'do');
 assert.equal(temporalStatus(items[0],now.getTime(),'Asia/Yekaterinburg'),null);
 assert.equal(temporalStatus(items[1],now.getTime(),'Asia/Yekaterinburg'),'overdue');
});

test('/demo never accepts an unknown owner identity', () => {
 assert.throws(()=>makeDemoLoops('local-dev'),/Telegram owner ID/);
 assert.throws(()=>makeDemoLoops(''),/Telegram owner ID/);
 assert.throws(()=>makeDemoLoops('not-a-number'),/Telegram owner ID/);
});

test('/demo clear removes only tagged records owned by the requesting Telegram account', async (t) => {
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-demo-'));
 const old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?demo_test=${Date.now()}`);
 const records=makeDemoLoops('123456789',{now:new Date('2026-10-12T03:46:00+05:00'),timeZone:'Asia/Yekaterinburg'});
 for(const item of records)await store.addLoop(item);
 const otherOwner=makeDemoLoops('987654321',{now:new Date('2026-10-12T03:46:00+05:00'),timeZone:'Asia/Yekaterinburg'});
 for(const item of otherOwner)await store.addLoop(item);
 const actual={...records[1],id:crypto.randomUUID(),seedTag:undefined,source:{...records[1].source,messageId:55},title:'Настоящие документы'};
 await store.addLoop(actual);
 assert.equal((await store.readLoops('123456789')).length,3);
 assert.equal(await store.clearDemoLoops('123456789'),2);
 const remaining=await store.readLoops('123456789');
 assert.equal(remaining.length,1);
 assert.equal(remaining[0].title,'Настоящие документы');
 assert.equal((await store.readLoops('987654321')).length,2);
 assert.equal(await store.clearDemoLoops('123456789'),0);
 await assert.rejects(()=>store.clearDemoLoops('local-dev'),/Telegram-аккаунт/);
});

test('/demo stays idempotent across edits and simultaneous requests',async (t)=>{
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-demo-atomic-'));
 const old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?seed_atomic=${Date.now()}`);
 const options={now:new Date('2026-10-12T03:46:00+05:00'),timeZone:'Asia/Yekaterinburg'};
 const initial=await store.seedDemoLoops('123456789',options);
 assert.equal(initial.length,2);
 const edited=await store.updateLoop(initial[0].id,{title:'Изменённое пользователем название',type:'saved'},'123456789');
 assert.equal(edited.type,'saved');
 const attempts=await Promise.all(Array.from({length:6},()=>store.seedDemoLoops('123456789',options)));
 assert.ok(attempts.every(created=>created.length===0));
 const all=await store.readLoops('123456789');
 assert.equal(all.length,2);
 assert.equal(all.find(item=>item.id===initial[0].id).title,'Изменённое пользователем название');
 assert.deepEqual(new Set(all.map(item=>item.seedTag)),new Set(DEMO_TAGS));
 assert.equal((await store.seedDemoLoops('987654321',options)).length,2);
 assert.equal((await store.readLoops('987654321')).length,2);
});

test('cleaning demo also removes private AI correction examples but not real messages',async (t)=>{
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-demo-corrections-'));
 const old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?demo_corrections=${Date.now()}`);
 const owner='123456789',other='987654321';
 const options={now:new Date('2026-10-12T03:46:00+05:00'),timeZone:'Asia/Yekaterinburg'};
 const [meeting,task]=await store.seedDemoLoops(owner,options);
 const [differentOwner] = await store.seedDemoLoops(other,options);
 const realText='Проверить расписание врача до четверга';
 await store.rememberMeaningCorrection(owner,meeting);
 await store.rememberMeaningCorrection(owner,{...meeting,source:{...meeting.source,text:realText}});
 await store.rememberMeaningCorrection(other,differentOwner);
 await store.recordSpaceCorrection(owner,'Личное',meeting.source.text,meeting.source.authorName);
 await store.recordSpaceCorrection(owner,'Работа',task.source.text,task.source.authorName);
 await store.recordSpaceCorrection(owner,'Личное',realText,'Арина');
 await store.recordSpaceCorrection(other,'Личное',differentOwner.source.text,differentOwner.source.authorName);
 assert.equal((await store.readMeaningCorrections(owner)).length,2);
 assert.equal(await store.clearDemoLoops(owner),2);
 assert.deepEqual((await store.readMeaningCorrections(owner)).map(item=>item.text),[realText]);
 assert.equal((await store.readMeaningCorrections(other)).length,1);
 const ownerSpaces=await store.readSpaces(owner);
 const examples=ownerSpaces.flatMap(item=>item.examples??[]);
 assert.ok(examples.some(example=>example.text===realText));
 assert.ok(examples.every(example=>!example.text.includes('ТЕСТОВОЕ СООБЩЕНИЕ')));
 const otherSpaces=await store.readSpaces(other);
 assert.ok(otherSpaces.flatMap(item=>item.examples??[]).some(example=>example.text.includes('ТЕСТОВОЕ СООБЩЕНИЕ')));
 assert.equal(await store.clearDemoLoops(owner),0);
});

test('broken JSON is rejected, not silently overwritten by /demo',async (t)=>{
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-demo-corrupt-'));
 const old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?demo_corrupt=${Date.now()}`);
 const filename=path.join(dir,'loops.json');
 await fs.writeFile(filename,'[{"id":"not-a-closed-array"','utf8');
 const before=await fs.readFile(filename,'utf8');
 await assert.rejects(()=>store.readLoops('123456789'),SyntaxError);
 await assert.rejects(()=>store.seedDemoLoops('123456789'),SyntaxError);
 assert.equal(await fs.readFile(filename,'utf8'),before);
});

test('yesterday is previous local calendar day even after a DST spring-forward',()=>{
 const now=new Date('2026-03-09T00:30:00-04:00');
 const items=makeDemoLoops('123456789',{now,timeZone:'America/New_York'});
 assert.equal(items[1].deadlineDate,'2026-03-08');
});
