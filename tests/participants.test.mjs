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
