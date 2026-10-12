import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeDemoLoops } from '../server/demo-seeds.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
function eventLoop(id,ownerId,name){
 const stamp='2026-10-12T10:00:00Z';
 return {
  id,ownerId,type:'reply',kind:'plan',agreementStatus:'proposed',nextAction:'coordinate',
  status:'open',title:'Встретиться с друзьями',person:{name},
  source:{messageId:name==='Арина'?201:202,chatId:123,text:'Давай встретимся в субботу',authorName:name,receivedAt:stamp},
  confidence:0.9,createdAt:stamp
 };
}
async function findPort(){
 const socket=net.createServer();
 await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
 const port=socket.address().port;
 await new Promise(resolve=>socket.close(resolve));
 return port;
}
test('HTTP server performs real CRUD, deadlines and safe meeting merges', {timeout:25000},async t=>{
 const owner='123456789',foreign='987654321';
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-http-test-'));
 const demos=makeDemoLoops(owner,{now:new Date('2026-10-12T03:46:00+05:00'),timeZone:'Asia/Yekaterinburg'});
 const [meeting,task]=demos;
 const realA=eventLoop('real-a',owner,'Арина');
 const realB=eventLoop('real-b',owner,'Кирилл');
 const anotherOwner=eventLoop('other-owner',foreign,'Никита');
 await fs.writeFile(path.join(dir,'loops.json'),JSON.stringify([meeting,task,realA,realB,anotherOwner]));
 const port=await findPort();
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server/api.mjs'],{
  cwd:root,
  env:{...process.env,PORT:String(port),DATA_DIR:dir,NODE_ENV:'development',LOOP_DEV_USER_ID:owner,
   GROQ_API_KEY:'',OPENAI_API_KEY:'',RAILWAY_PROJECT_ID:'',RAILWAY_VOLUME_MOUNT_PATH:''},
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';
 child.stderr.on('data',chunk=>{stderr+=String(chunk).slice(0,1600)});
 t.after(async()=>{
  if(child.exitCode===null){
   child.kill('SIGTERM');
   await Promise.race([
    new Promise(resolve=>child.once('exit',resolve)),
    new Promise(resolve=>setTimeout(resolve,3000))
   ]);
  }
  if(child.exitCode===null)child.kill('SIGKILL');
  await fs.rm(dir,{recursive:true,force:true});
 });
 let healthy=false;
 for(let n=0;n<70;n++){
  if(child.exitCode!==null)throw new Error('API server unexpectedly stopped: '+stderr);
  try{
   const response=await fetch(base+'/health');
   if(response.ok){healthy=true;break;}
  }catch{/* not listening yet */}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(healthy,true,'API server did not become healthy: '+stderr);
 const call=async(method,url,data)=>{
  const res=await fetch(base+url,{
   method,
   headers:{'Content-Type':'application/json'},
   ...(data!==undefined?{body:JSON.stringify(data)}:{})
  });
  const json=await res.json();
  return {status:res.status,json};
 };
 const initial=await call('GET','/loops');
 assert.equal(initial.status,200);
 assert.equal(initial.json.length,4);
 assert.ok(initial.json.every(loop=>loop.ownerId===owner));

 const invalidEvent=await call('POST','/loops/'+meeting.id+'/schedule',{kind:'event',date:'2026-10-18',at:null});
 assert.equal(invalidEvent.status,400);
 const deadline=await call('POST','/loops/'+task.id+'/schedule',{kind:'deadline',date:'2026-10-15',at:null});
 assert.equal(deadline.status,200);
 assert.equal(deadline.json.deadlineDate,'2026-10-15');
 assert.equal(deadline.json.deadlineAt,null);
 const invalidDate=await call('POST','/loops/'+task.id+'/schedule',{kind:'deadline',date:'2026-02-30',at:null});
 assert.equal(invalidDate.status,400);
 const foreignDate=await call('POST','/loops/'+anotherOwner.id+'/schedule',{kind:'deadline',date:'2026-10-16',at:null});
 assert.equal(foreignDate.status,404);

 const person=await call('POST','/loops/'+meeting.id+'/participants',{name:'Маша'});
 assert.equal(person.status,200);
 assert.ok(person.json.participants.some(x=>x.name==='Маша'));
 const repeatedPerson=await call('POST','/loops/'+meeting.id+'/participants',{name:'маша'});
 assert.equal(repeatedPerson.json.participants.filter(x=>x.name.toLowerCase()==='маша').length,1);
 const removed=await call('DELETE','/loops/'+meeting.id+'/participants/'+encodeURIComponent('Маша'));
 assert.equal(removed.status,200);
 assert.equal(removed.json.participants.some(x=>x.name.toLowerCase()==='маша'),false);

 const unsafe=await call('POST','/loops/'+meeting.id+'/merge',{otherId:realA.id});
 assert.equal(unsafe.status,400);
 assert.match(unsafe.json.error,/Тестовую карточку/);
 const merged=await call('POST','/loops/'+realA.id+'/merge',{otherId:realB.id});
 assert.equal(merged.status,200);
 assert.equal(merged.json.relatedSources.length,1);
 assert.equal(merged.json.participants[0].name,'Кирилл');
 const afterMerge=await call('GET','/loops');
 assert.equal(afterMerge.json.find(x=>x.id===realB.id).status,'dismissed');
 assert.equal(afterMerge.json.find(x=>x.id===realB.id).mergedInto,realA.id);
 const corrected=await call('POST','/loops/'+task.id+'/correct',{choice:'saved',title:'Сохранить документы'});
 assert.equal(corrected.status,200);
 assert.equal(corrected.json.deadlineDate,null);
 assert.equal(corrected.json.kind,'note');

 const after=await call('GET','/loops');
 assert.equal(after.status,200);
 assert.equal(after.json.length,4);
 assert.ok(after.json.some(x=>x.id===meeting.id));
 assert.ok(after.json.some(x=>x.id===task.id));
});

test('production API denies unauthenticated access to real user records', {timeout:25000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loop-prod-api-'));
 const owner='123456789', [meeting]=makeDemoLoops(owner,{now:new Date('2026-10-12T03:46:00+05:00')});
 const filepath=path.join(dir,'loops.json');
 await fs.writeFile(filepath,JSON.stringify([meeting]),'utf8');
 const port=await findPort();
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server/api.mjs'],{
  cwd:root,
  env:{...process.env,PORT:String(port),NODE_ENV:'production',DATA_DIR:dir,
   BOT_TOKEN:'test-only-token',TELEGRAM_BOT_TOKEN:'',RAILWAY_PROJECT_ID:'',RAILWAY_VOLUME_MOUNT_PATH:''
  },
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';
 child.stderr.on('data',data=>{stderr+=String(data).slice(0,1000)});
 t.after(async()=>{
  if(child.exitCode===null){
   child.kill('SIGTERM');
   await Promise.race([
    new Promise(resolve=>child.once('exit',resolve)),
    new Promise(resolve=>setTimeout(resolve,3000))
   ]);
  }
  if(child.exitCode===null)child.kill('SIGKILL');
  await fs.rm(dir,{recursive:true,force:true});
 });
 let ready=false;
 for(let n=0;n<70;n++){
  if(child.exitCode!==null)throw new Error('API exited: '+stderr);
  try{
   const health=await fetch(base+'/health');
   if(health.ok){ready=true;break;}
  }catch{/* API starting */}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(ready,true,'production health check: '+stderr);
 const privateGet=await fetch(base+'/loops');
 assert.equal(privateGet.status,401);
 const spacesGet=await fetch(base+'/spaces');
 assert.equal(spacesGet.status,401);
 const unauthorizedChange=await fetch(base+'/loops/'+meeting.id+'/correct',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({choice:'saved',title:'Not allowed'})
 });
 assert.equal(unauthorizedChange.status,401);
 const stored=JSON.parse(await fs.readFile(filepath,'utf8'));
 assert.equal(stored.length,1);
 assert.equal(stored[0].id,meeting.id);
 assert.equal(stored[0].kind,'plan');
});
