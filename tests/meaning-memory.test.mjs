import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { meaningPatch, relevantMeaningCorrections } from '../server/meaning-memory.mjs';

test('explicit correction has a coherent type/action/stage with validation',()=>{
 const old={type:'saved',kind:'recommendation',status:'open',title:'Сохранить фильм',source:{text:'Давай посмотрим фильм в субботу',authorName:'Арина'}};
 const proposal=meaningPatch('meeting-proposal','Договориться о встрече в субботу',old);
 assert.equal(proposal.type,'reply');
 assert.equal(proposal.kind,'plan');
 assert.equal(proposal.agreementStatus,'proposed');
 assert.equal(proposal.nextAction,'coordinate');
 assert.equal(proposal.dueAt,null);
 const memory=meaningPatch('saved','Посмотреть сериал Тьма',{...old,whenText:'суббота'});
 assert.equal(memory.whenText,null);
 assert.equal(memory.nextAction,'none');
 assert.equal(memory.type,'saved');
 assert.throws(()=>meaningPatch('admin','Неизвестный тип',old),/Неизвестный/);
 assert.throws(()=>meaningPatch('todo','x',old),/110 символов/);
});

test('corrections are private per Telegram owner, persisted, and capped',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-meaning-'));
 const original=process.env.DATA_DIR;
 process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(original===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=original;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?meaning_test=${Date.now()}`);
 const ownerA='123456',ownerB='789012';
 const base={
  id:'correction-1',ownerId:ownerA,type:'saved',status:'open',
  title:'Сохранить фильм',kind:'recommendation',confidence:0.9,space:'Личное',
  createdAt:'2026-10-10T10:00:00Z',
  source:{text:'Давай посмотрим фильм в субботу',authorName:'Арина',messageId:77,receivedAt:'2026-10-10T10:00:00Z'}
 };
 await store.addLoop(base);
 const patch=meaningPatch('meeting-proposal','Договориться о встрече в субботу',base);
 const updated=await store.updateLoop(base.id,patch,ownerA);
 await store.rememberMeaningCorrection(ownerA,updated);
 assert.equal((await store.readLoops(ownerA))[0].nextAction,'coordinate');
 const a=await store.readMeaningCorrections(ownerA),b=await store.readMeaningCorrections(ownerB);
 assert.equal(a.length,1);
 assert.equal(b.length,0);
 assert.equal(a[0].corrected.type,'reply');
 assert.equal(a[0].corrected.kind,'plan');
 const relevant=relevantMeaningCorrections(base.source.text,'Арина',a);
 assert.equal(relevant.length,1);
 assert.equal(relevant[0].corrected.agreementStatus,'proposed');
 assert.ok(!JSON.stringify(relevant).includes('ownerId'));
 for(let i=0;i<25;i++){
  await store.rememberMeaningCorrection(ownerA,{...updated,source:{...base.source,text:`Приглашение ${i} в субботу`}});
 }
 assert.equal((await store.readMeaningCorrections(ownerA)).length,20);
 assert.equal((await store.readMeaningCorrections(ownerB)).length,0);
 // Redoing one correction replaces the obsolete example.
 const replacement=await store.updateLoop(base.id,meaningPatch('saved','Просто сохранить сообщение',updated),ownerA);
 await store.rememberMeaningCorrection(ownerA,replacement);
 const final=await store.readMeaningCorrections(ownerA);
 assert.equal(final.find(item=>item.text===base.source.text).corrected.type,'saved');
});
