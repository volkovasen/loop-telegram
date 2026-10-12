import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mergePlanRecords } from '../server/participants.mjs';

const source=(id,text,name)=>({messageId:id,chatId:100,text,receivedAt:'2026-10-12T10:00:00Z',authorName:name});
const base=(id,ownerId,name)=>({
 id,ownerId,type:'reply',kind:'plan',status:'open',title:'Встреча в субботу',person:{name},
 source:source(Number(id.replace(/\D/g,'')), 'Встретимся в субботу',name),
 confidence:.9,createdAt:'2026-10-12T10:00:00Z'
});
test('merge combines sources and people without inventing a different date',()=>{
 const a={...base('a1','u1','Арина'),eventDate:'2026-10-17'};
 const b={...base('b2','u1','Кирилл'),eventDate:'2026-10-18',participants:[{name:'Маша'}]};
 const combined=mergePlanRecords(a,b);
 assert.equal(combined.eventDate,'2026-10-17');
 assert.deepEqual(combined.participants.map(person=>person.name),['Кирилл','Маша']);
 assert.deepEqual(combined.relatedSources.map(s=>s.authorName),['Кирилл']);
 assert.deepEqual(combined.mergedFrom,['b2']);
 assert.equal(combined.source.authorName,'Арина');
 assert.throws(()=>mergePlanRecords(a,{...b,ownerId:'u2'}),/чужие/);
});

test('participants, merges and full sources remain private and durable',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-people-'));
 const old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;await fs.rm(dir,{recursive:true,force:true})});
 const store=await import(`../server/store.mjs?participants_test=${Date.now()}`);
 const u='100',v='200';
 const a=base('a1',u,'Арина'),b=base('b2',u,'Кирилл'),external=base('c3',v,'Игорь');
 await store.addLoop(a);await store.addLoop(b);await store.addLoop(external);
 await assert.rejects(()=>store.addLoopParticipant(v,a.id,'Саша'),/не найдена/i);
 await assert.rejects(()=>store.mergeLoopPlans(v,a.id,b.id),/не найдена/i);
 await assert.rejects(()=>store.mergeLoopPlans(u,a.id,external.id),/не найдена/i);
 await assert.rejects(()=>store.addLoopParticipant(u,a.id,'<script>'),/Имя/);
 const withPerson=await store.addLoopParticipant(u,a.id,'Маша');
 assert.equal(withPerson.participants[0].name,'Маша');
 assert.equal((await store.addLoopParticipant(u,a.id,'маша')).participants.length,1);
 assert.equal((await store.addLoopParticipant(u,a.id,'Арина')).participants.length,1);
 await store.removeLoopParticipant(u,a.id,'Маша');
 assert.equal((await store.readLoops(u)).find(x=>x.id===a.id).participants.length,0);
 await store.addLoopParticipant(u,a.id,'Маша');
 const combined=await store.mergeLoopPlans(u,a.id,b.id);
 assert.equal(combined.participants.length,2);
 assert.equal(combined.relatedSources.length,1);
 const loops=await store.readLoops(u);
 assert.equal(loops.find(x=>x.id===b.id).status,'dismissed');
 assert.equal(loops.find(x=>x.id===b.id).mergedInto,a.id);
 assert.equal(loops.find(x=>x.id===a.id).source.authorName,'Арина');
 assert.equal((await store.mergeLoopPlans(u,a.id,b.id)).mergedFrom.length,1);
 assert.equal((await store.readLoops(v))[0].status,'open');
 await assert.rejects(()=>store.mergeLoopPlans(u,b.id,a.id),/объединена/);
});

test('merging a real meeting with a demo is rejected in either direction',async (t)=>{
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-real-vs-demo-'));
 const previous=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?demo_merge=${Date.now()}`);
 const owner='123456789';
 const [demo] = await store.seedDemoLoops(owner);
 const real=base('real100',owner,'Настоящая Арина');
 await store.addLoop(real);
 await assert.rejects(()=>store.mergeLoopPlans(owner,demo.id,real.id),/Тестовую карточку нельзя объединять/);
 await assert.rejects(()=>store.mergeLoopPlans(owner,real.id,demo.id),/Тестовую карточку нельзя объединять/);
 assert.equal(await store.clearDemoLoops(owner),2);
 const remaining=await store.readLoops(owner);
 assert.equal(remaining.length,1);
 assert.equal(remaining[0].id,real.id);
 assert.equal(remaining[0].status,'open');
});

test('undo last merge restores both cards while preserving primary title and date',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-unmerge-'));
 const previous=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 t.after(async()=>{
  if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;
  await fs.rm(dir,{recursive:true,force:true});
 });
 const store=await import(`../server/store.mjs?unmerge_test=${Date.now()}`);
 const owner='888888';
 const a={...base('a10',owner,'Арина'),eventDate:'2026-10-17',participants:[{name:'Маша'}]};
 const b={...base('b11',owner,'Кирилл'),title:'Кирилл уточняет встречу'};
 const c={...base('c12',owner,'Вера'),title:'Вера прислала время'};
 await store.addLoop(a);await store.addLoop(b);await store.addLoop(c);
 await store.mergeLoopPlans(owner,a.id,b.id);
 await store.mergeLoopPlans(owner,a.id,c.id);
 await store.updateLoop(a.id,{title:'Субботняя встреча',eventDate:'2026-10-18'},owner);
 const result=await store.undoLastLoopMerge(owner,a.id);
 assert.equal(result.primary.title,'Субботняя встреча');
 assert.equal(result.primary.eventDate,'2026-10-18');
 assert.deepEqual(result.primary.participants.map(p=>p.name),['Маша','Кирилл']);
 assert.deepEqual(result.primary.mergedFrom,[b.id]);
 assert.equal(result.restored.id,c.id);
 assert.equal(result.restored.status,'open');
 assert.equal(result.restored.mergedInto,null);
 assert.equal(result.primary.mergeHistory.length,1);
 const previousMerge=await store.undoLastLoopMerge(owner,a.id);
 assert.deepEqual(previousMerge.primary.participants.map(p=>p.name),['Маша']);
 assert.equal(previousMerge.primary.mergedFrom.length,0);
 assert.equal(previousMerge.restored.status,'open');
 assert.equal((await store.readLoops(owner)).filter(x=>x.status==='open').length,3);
 await assert.rejects(()=>store.undoLastLoopMerge(owner,a.id),/Нет объединения/);
 await assert.rejects(()=>store.undoLastLoopMerge('999999',a.id),/не найдена/);
});
