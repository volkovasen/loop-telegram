import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR || 'server/data');
const dataFile = path.join(dataDir, 'loops.json');
let writeChain = Promise.resolve();
async function ensureStore(){await fs.mkdir(dataDir,{recursive:true});try{await fs.access(dataFile)}catch{await fs.writeFile(dataFile,'[]','utf8')}}
async function readAll(){await ensureStore();try{return JSON.parse(await fs.readFile(dataFile,'utf8'))}catch{return[]}}
async function writeAll(loops){const tmp=`${dataFile}.tmp`;await fs.writeFile(tmp,JSON.stringify(loops,null,2),'utf8');await fs.rename(tmp,dataFile)}
function enqueueWrite(task){writeChain=writeChain.then(task,task);return writeChain}
export async function readLoops(ownerId){const loops=await readAll();if(!ownerId||ownerId==='*')return loops;return loops.filter(loop=>String(loop.ownerId??'local-dev')===String(ownerId))}
export async function addLoop(loop){return enqueueWrite(async()=>{const loops=await readAll();const duplicate=loops.find(item=>item.ownerId===loop.ownerId&&item.source?.messageId===loop.source?.messageId&&item.type===loop.type&&item.title===loop.title);if(duplicate)return duplicate;loops.unshift(loop);await writeAll(loops);return loop})}
const allowedStatus=new Set(['suggested','open','snoozed','done','dismissed']);
const allowedType=new Set(['reply','todo','waiting','event','saved']);
const allowedSpace=new Set(['Дом','Работа','Личное']);
export async function updateLoop(id,patch,ownerId){return enqueueWrite(async()=>{const loops=await readAll();const index=loops.findIndex(loop=>loop.id===id&&(!ownerId||ownerId==='*'||String(loop.ownerId??'local-dev')===String(ownerId)));if(index===-1)return null;const safe={};if(allowedStatus.has(patch.status))safe.status=patch.status;if(allowedType.has(patch.type))safe.type=patch.type;if(allowedSpace.has(patch.space))safe.space=patch.space;if(typeof patch.title==='string'&&patch.title.trim())safe.title=patch.title.trim().slice(0,240);if(patch.dueAt===null||patch.dueAt==='')safe.dueAt=undefined;else if(typeof patch.dueAt==='string'&&!Number.isNaN(new Date(patch.dueAt).getTime()))safe.dueAt=patch.dueAt;if(typeof patch.memoryCategory==='string')safe.memoryCategory=patch.memoryCategory.trim().slice(0,80)||undefined;if(typeof patch.completedAt==='string'||patch.completedAt===null)safe.completedAt=patch.completedAt??undefined;if(typeof patch.remindedAt==='string'||patch.remindedAt===null)safe.remindedAt=patch.remindedAt??undefined;if('dueAt'in safe&&safe.dueAt!==loops[index].dueAt)safe.remindedAt=undefined;loops[index]={...loops[index],...safe,updatedAt:new Date().toISOString()};await writeAll(loops);return loops[index]})}
