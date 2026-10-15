import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Brain, CalendarPlus, Check, ChevronRight, Clock3, MessageSquareText, Search, ShieldCheck, Users, X } from 'lucide-react';
import type { LoopSpace, OpenLoop, SpaceDefinition } from './types/open-loop';
import { SpacesSheet, UnassignedCard } from './spaces-ui';
import { MeaningEditor } from './meaning-editor';
import { ScheduleEditor, commitmentBadge } from './schedule-ui';
import { ParticipantsEditor } from './participants-ui';
import { LoopCard } from './loop-card';
import { SpaceTabs } from './space-tabs';
import { TodayFilterSelect } from './today-filter-select';
import { filterTodayStatus, type TodayStatusFilter } from './today-filters';

// Prefer the same origin. Ignore legacy localhost overrides that break on a phone.
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const API_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\/?$/i.test(configuredApiUrl)
  ? ''
  : configuredApiUrl.replace(/\/$/, '');
const telegram = (window as typeof window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void; openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
function authHeaders(): Record<string, string> { return telegram?.initData ? { 'X-Telegram-Init-Data': telegram.initData } : {}; }
const BOT_URL = 'https://t.me/loop_attention_bot';
type Tab = 'today' | 'people' | 'memory';
type SpaceFilter = 'Все' | LoopSpace;
const meta = { reply:{icon:'↩',label:'Нужно ответить'}, todo:{icon:'✓',label:'Нужно сделать'}, waiting:{icon:'←',label:'Ждём обещанного'}, event:{icon:'◷',label:'Событие'}, saved:{icon:'◇',label:'В памяти'} };
function loopLabel(loop:OpenLoop){
 if(loop.kind==='plan'&&loop.agreementStatus==='proposed')return 'Договориться';
 if(loop.kind==='plan'&&loop.agreementStatus==='confirmed')return 'Договорились';
 if(loop.kind==='plan'&&loop.agreementStatus==='unknown')return 'Детали не подтверждены';
 return ({reply:'Ответить',todo:'Сделать',waiting:'Ждём',event:'Событие',saved:'Сохранено'} as Record<OpenLoop['type'],string>)[loop.type];
}
function actionHint(loop:OpenLoop){return loop.nextActionText??(loop.type==='reply'?'Ответить на сообщение':loop.type==='waiting'?'Дождаться обещанного':loop.type==='todo'?'Выполнить просьбу':null);}

// Local-only visual fixtures. They are never sent to the server or Telegram.
const demoLoops: OpenLoop[] = [
 {id:'demo-documents',type:'todo',kind:'request',nextAction:'do',status:'open',
  title:'Отправить документы',person:{name:'Саша'},space:'Работа',confidence:1,
  deadlineDate:new Date(Date.now()-86400000).toISOString().slice(0,10),
  source:{messageId:-1,receivedAt:new Date().toISOString(),text:'[ТЕСТ] Скинь мне документы до завтра, пожалуйста. Нужен договор и паспортные данные.'},createdAt:new Date().toISOString()},
 {id:'demo-meeting',type:'reply',kind:'plan',agreementStatus:'proposed',nextAction:'coordinate',status:'open',
  title:'Встреча в субботу',person:{name:'Арина'},participants:[{name:'Кирилл'}],
  whenText:'В субботу',space:'Личное',confidence:1,
  source:{messageId:-2,receivedAt:new Date().toISOString(),text:'[ТЕСТ] Давайте в субботу встретимся в кофейне? Напишите, кто сможет и когда удобно.'},createdAt:new Date().toISOString()},
 {id:'demo-groceries',type:'todo',kind:'request',nextAction:'do',status:'open',
  title:'Купить продукты к ужину',person:{name:'Маша'},space:'Дом',confidence:1,
  source:{messageId:-3,receivedAt:new Date().toISOString(),text:'[ТЕСТ] Возьми, пожалуйста, помидоры, сыр, молоко и хлеб. Спасибо!'},createdAt:new Date().toISOString()},
 {id:'demo-completed',type:'todo',kind:'request',nextAction:'do',status:'done',
  title:'Забрать посылку',person:{name:'Кира'},space:'Личное',confidence:1,
  completedAt:new Date().toISOString(),
  source:{messageId:-4,receivedAt:new Date().toISOString(),text:'[ТЕСТ] Забери, пожалуйста, посылку из пункта выдачи.'},createdAt:new Date().toISOString()}
];

function attentionText(count:number){if(count===1)return'1 вещь требует внимания';if(count>=2&&count<=4)return`${count} вещи требуют внимания`;return`${count} вещей требуют внимания`}
function formatDate(value?:string|null){if(!value)return;const date=new Date(value);if(Number.isNaN(date.getTime()))return;return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date)}
function telegramLink(loop:OpenLoop){const username=loop.person?.username?.replace(/^@/,'');if(username)return`https://t.me/${username}`;if(loop.person?.telegramUserId)return`tg://user?id=${loop.person.telegramUserId}`}
function googleCalendarLink(loop:OpenLoop){if(loop.agreementStatus==='proposed'||loop.agreementStatus==='unknown')return;const when=loop.eventAt||loop.deadlineAt||loop.dueAt;if(!when)return;const start=new Date(when);if(Number.isNaN(start.getTime()))return;const end=new Date(start.getTime()+30*60*1000);const stamp=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');const params=new URLSearchParams({action:'TEMPLATE',text:loop.title,dates:`${stamp(start)}/${stamp(end)}`,details:loop.source.text?`Из Telegram: ${loop.source.text}`:'Добавлено из LOOP'});return`https://calendar.google.com/calendar/render?${params.toString()}`}

export function App(){
 const demoMode=import.meta.env.DEV&&new URLSearchParams(window.location.search).has('demo');
 const[loops,setLoops]=useState<OpenLoop[]>([]),[spaceDefinitions,setSpaceDefinitions]=useState<SpaceDefinition[]>([]),[spaceSheet,setSpaceSheet]=useState(false),[actionError,setActionError]=useState(''),[connected,setConnected]=useState(false),[hasLoaded,setHasLoaded]=useState(false),[tab,setTab]=useState<Tab>('today'),[space,setSpace]=useState<SpaceFilter>('Все'),[selected,setSelected]=useState<OpenLoop|null>(null),[personName,setPersonName]=useState<string|null>(null),[memoryQuery,setMemoryQuery]=useState(''),[memoryResults,setMemoryResults]=useState<OpenLoop[]|null>(null),[memorySearching,setMemorySearching]=useState(false),[topNotice,setTopNotice]=useState('');
 const [todayStatus,setTodayStatus]=useState<TodayStatusFilter>('active');
 async function loadLoops(){try{const res=await fetch(`${API_URL}/loops`,{headers:authHeaders()});if(!res.ok)throw new Error();setLoops(await res.json());setConnected(true)}catch{setConnected(false)}finally{setHasLoaded(true)}}
 async function loadSpaces(){try{const res=await fetch(`${API_URL}/spaces`,{headers:authHeaders()});if(!res.ok)throw new Error();setSpaceDefinitions(await res.json())}catch{setActionError('Не удалось загрузить Spaces. Проверь соединение.')}}
 useEffect(()=>{
  if(!topNotice)return;
  const timer=window.setTimeout(()=>setTopNotice(''),3200);
  return()=>window.clearTimeout(timer);
 },[topNotice]);
 async function saveSpace(draft:{id?:string;name:string;description:string}):Promise<string|null>{
  try{
   const original=spaceDefinitions.find(item=>item.id===draft.id);
   const res=await fetch(`${API_URL}/spaces${draft.id?'/'+encodeURIComponent(draft.id):''}`,{method:draft.id?'PATCH':'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({name:draft.name,description:draft.description})});
   const result=await res.json();
   if(!res.ok)return result.error??'Не получилось сохранить Space.';
   if(original&&space===original.name)setSpace(result.name);
   await Promise.all([loadSpaces(),loadLoops()]);
   return null;
  }catch{return 'Соединение потеряно. Попробуй ещё раз.'}
 }
 async function removeSpace(id:string):Promise<string|null>{
  try{
   const original=spaceDefinitions.find(item=>item.id===id);
   const res=await fetch(`${API_URL}/spaces/${encodeURIComponent(id)}`,{method:'DELETE',headers:authHeaders()});
   const result=await res.json();
   if(!res.ok)return result.error??'Не получилось удалить Space.';
   if(original&&space===original.name)setSpace('Все');
   await Promise.all([loadSpaces(),loadLoops()]);
   return null;
  }catch{return 'Соединение потеряно. Попробуй ещё раз.'}
 }
 useEffect(()=>{
  telegram?.ready?.();telegram?.expand?.();
  if(demoMode){
   setHasLoaded(true);setConnected(true);
   setSpaceDefinitions([
    {id:'demo-work',name:'Работа',description:'Рабочие задачи',isDefault:true},
    {id:'demo-personal',name:'Личное',description:'Личные планы',isDefault:true},
    {id:'demo-home',name:'Дом',description:'Домашние дела',isDefault:true}
   ]);
   return;
  }
  loadLoops();loadSpaces();
  const timer=setInterval(loadLoops,2000);
  return()=>clearInterval(timer);
 },[demoMode]);
 useEffect(()=>{const q=memoryQuery.trim();if(!q){setMemoryResults(null);setMemorySearching(false);return}const controller=new AbortController();const timer=setTimeout(async()=>{setMemorySearching(true);try{const res=await fetch(`${API_URL}/memory/search?q=${encodeURIComponent(q)}`,{signal:controller.signal,headers:authHeaders()});if(res.ok)setMemoryResults(await res.json())}catch(error){if((error as Error).name!=='AbortError')setMemoryResults([])}finally{if(!controller.signal.aborted)setMemorySearching(false)}},300);return()=>{clearTimeout(timer);controller.abort()}},[memoryQuery]);

 const attention=useMemo(()=>{const now=Date.now();return loops.filter(l=>l.type!=='saved'&&!l.mergedInto&&((l.status==='open'||l.status==='suggested')||(l.status==='snoozed'&&(l.snoozedUntil||l.dueAt)&&new Date(l.snoozedUntil||l.dueAt||'').getTime()<=now)))},[loops]);
 const history=useMemo(()=>loops.filter(l=>l.status==='done'&&l.type!=='saved'&&!l.mergedInto).sort((a,b)=>(b.completedAt??'').localeCompare(a.completedAt??'')),[loops]);
 const attentionSource=useMemo(()=>demoMode?demoLoops.filter(l=>l.status==='open'||l.status==='suggested'):attention,[demoMode,attention]);
 const completedSource=useMemo(()=>demoMode?demoLoops.filter(l=>l.status==='done'):history,[demoMode,history]);
 const statusAttention=useMemo(()=>filterTodayStatus(attentionSource,completedSource,todayStatus),[attentionSource,completedSource,todayStatus]);
 const visibleAttention=useMemo(()=>statusAttention.filter(l=>space==='Все'||l.space===space),[statusAttention,space]);
 const snoozed=useMemo(()=>loops.filter(l=>l.status==='snoozed'&&!l.mergedInto && !(attention.some(active=>active.id===l.id))),[loops,attention]);
 const dismissed=useMemo(()=>loops.filter(l=>l.status==='dismissed'&&!l.mergedInto),[loops]);
 const allMemory=useMemo(()=>loops.filter(l=>l.type==='saved'&&l.status!=='dismissed'),[loops]);
 const memory=memoryQuery.trim()?memoryResults??[]:allMemory;
 const people=useMemo(()=>{const map=new Map<string,OpenLoop[]>();for(const loop of loops){
  if(loop.mergedInto)continue;
  const names=new Set([loop.person?.name,...(loop.participants??[]).map(p=>p.name)].filter((x):x is string=>Boolean(x)));
  for(const name of names)map.set(name,[...(map.get(name)??[]),loop]);
 }return[...map.entries()].sort((a,b)=>{const oa=a[1].filter(x=>x.status==='open'||x.status==='suggested').length,ob=b[1].filter(x=>x.status==='open'||x.status==='suggested').length;return ob-oa||a[0].localeCompare(b[0],'ru')})},[loops]);
 async function patchLoop(id:string,patch:Partial<OpenLoop>):Promise<boolean>{
  setActionError('');
  try{
   const res=await fetch(`${API_URL}/loops/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(patch)});
   if(!res.ok){const err=await res.json().catch(()=>({error:'Не удалось сохранить.'}));throw new Error(err.error??'Не удалось сохранить.')}
   const updated:OpenLoop=await res.json();
   setLoops(items=>items.map(item=>item.id===id?updated:item));
   setSelected(item=>item?.id===id?updated:item);
   return true;
  }catch(error){setActionError(error instanceof Error?error.message:'Не удалось сохранить.');await loadLoops();return false}
 }
 async function correctMeaning(loop:OpenLoop,choice:string,title:string):Promise<string|null>{
  try{
   const response=await fetch(`${API_URL}/loops/${encodeURIComponent(loop.id)}/correct`,{
    method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({choice,title})
   });
   const result=await response.json();
   if(!response.ok)return result.error??'Не удалось исправить карточку';
   const updated=result as OpenLoop;
   setLoops(items=>items.map(item=>item.id===updated.id?updated:item));
   setSelected(item=>item?.id===updated.id?updated:item);
   return null;
  }catch{return 'Проблема с соединением. Повтори попытку.';}
 }
 async function assignSpace(loop:OpenLoop,name:string){if(loop.id.startsWith('demo-'))return;await patchLoop(loop.id,{space:name||null,spaceConfidence:name?1:0})}
 async function done(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;const completedAt=new Date().toISOString();if(await patchLoop(loop.id,{status:'done',completedAt}))setSelected(null)}
 async function snooze(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;const until=new Date();until.setDate(until.getDate()+1);until.setHours(9,0,0,0);if(await patchLoop(loop.id,{status:'snoozed',snoozedUntil:until.toISOString(),remindedAt:null}))setSelected(null)}
 async function saveParticipant(loop:OpenLoop,name:string):Promise<string|null>{
  return updatePeople(loop,'POST','participants',{name});
 }
 async function removeParticipant(loop:OpenLoop,name:string):Promise<string|null>{
  return updatePeople(loop,'DELETE','participants/'+encodeURIComponent(name));
 }
 async function mergeMeeting(loop:OpenLoop,otherId:string):Promise<string|null>{
  const error=await updatePeople(loop,'POST','merge',{otherId});
  if(!error)await loadLoops();
  return error;
 }
 async function updatePeople(loop:OpenLoop,method:'POST'|'DELETE',action:string,payload?:object):Promise<string|null>{
  try{
   const res=await fetch(`${API_URL}/loops/${encodeURIComponent(loop.id)}/${action}`,{
    method,headers:{'Content-Type':'application/json',...authHeaders()},
    ...(payload?{body:JSON.stringify(payload)}:{})
   });
   const result=await res.json();
   if(!res.ok)return result.error??'Не удалось обновить участников';
   const updated=result as OpenLoop;
   setLoops(items=>items.map(item=>item.id===updated.id?updated:item));
   setSelected(item=>item?.id===updated.id?updated:item);
   return null;
  }catch{return 'Не удалось связаться с LOOP. Повтори попытку.';}
 }
 async function saveSchedule(loop:OpenLoop,kind:'deadline'|'event',date:string|null,at:string|null):Promise<string|null>{
  try{
   const res=await fetch(`${API_URL}/loops/${encodeURIComponent(loop.id)}/schedule`,{
    method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},
    body:JSON.stringify({kind,date,at})
   });
   const result=await res.json();
   if(!res.ok)return result.error??'Не удалось сохранить дату';
   const updated=result as OpenLoop;
   setLoops(items=>items.map(item=>item.id===updated.id?updated:item));
   setSelected(item=>item?.id===updated.id?updated:item);
   return null;
  }catch{return 'Не удалось связаться с LOOP. Попробуй ещё раз.'}
 }
 async function confirmPlan(loop:OpenLoop){
  if(loop.id.startsWith('demo-'))return;
  try{
   const res=await fetch(`${API_URL}/loops/${encodeURIComponent(loop.id)}/confirm`,{method:'POST',headers:authHeaders()});
   const result=await res.json();
   if(!res.ok){setActionError(result.error??'Не удалось подтвердить встречу');return;}
   setLoops(items=>items.map(item=>item.id===result.id?result:item));
   setSelected(item=>item?.id===result.id?result:item);
  }catch{setActionError('Нет соединения. Не удалось подтвердить встречу.')}
 }
 async function reopenLoop(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;await patchLoop(loop.id,{status:'open'});}
 async function undoMerge(loop:OpenLoop):Promise<string|null>{
  try{
   const res=await fetch(`${API_URL}/loops/${encodeURIComponent(loop.id)}/unmerge`,{
    method:'POST',headers:authHeaders()
   });
   const result=await res.json();
   if(!res.ok)return result.error??'Не удалось отменить объединение';
   const {primary,restored}=result as {primary:OpenLoop;restored:OpenLoop};
   setLoops(items=>items.map(item=>item.id===primary.id?primary:item.id===restored.id?restored:item));
   setSelected(item=>item?.id===primary.id?primary:item);
   return null;
  }catch{return 'Нет соединения. Не удалось восстановить встречу.'}
 }
 async function dismissPlan(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;if(await patchLoop(loop.id,{status:'dismissed'}))setSelected(null)}
 const firstRun=hasLoaded&&connected&&loops.length===0&&!demoMode;
 const title=tab==='today'?'Сегодня':tab==='people'?'Люди':'Память';
 const todayHint=todayStatus==='overdue'? `Просроченных задач: ${statusAttention.length}`
  :todayStatus==='done'? `Выполнено задач: ${statusAttention.length}`
  :attentionSource.length?attentionText(attentionSource.length):'Хвостов нет. Красиво.';
 return <main className="shell">{topNotice&&<div className="loop-top-toast" role="status" aria-live="polite"><span className="loop-top-toast-check"><Check size={19}/></span><strong>{topNotice}</strong><button type="button" aria-label="Закрыть уведомление" onClick={()=>setTopNotice('')}><X size={19}/></button></div>}<header><div className="eyebrow">LOOP</div><div className={tab==='today'?'today-heading':''}><h1>{title}</h1>{tab==='today'&&<TodayFilterSelect value={todayStatus} onChange={setTodayStatus}/>}</div><p>{tab==='today'&&demoMode?'Демо · карточки для просмотра на телефоне':!hasLoaded?'Загружаем сообщения…':!connected?'LOOP не подключён':firstRun?'Твои важные сообщения будут здесь':tab==='today'?todayHint:tab==='people'?`${people.length} человек в контексте`:`${allMemory.length} сохранено`}</p></header>
 {actionError&&<div className="action-error" role="alert">{actionError}<button type="button" onClick={()=>setActionError('')} aria-label="Скрыть ошибку"><X size={15}/></button></div>}
 {tab==='today'&&(hasLoaded&&!connected&&!loops.length&&!demoMode?<div className="empty"><strong>Не удалось загрузить сообщения</strong><span>Проверь соединение и открой LOOP через Telegram.</span></div>:<TodayView loops={visibleAttention} allLoops={attentionSource} snoozed={snoozed} dismissed={dismissed} space={space} spaces={spaceDefinitions} firstRun={firstRun} onSpace={setSpace} onManage={()=>setSpaceSheet(true)} onSelect={setSelected} onAssign={assignSpace} statusFilter={todayStatus} />)} 
 {tab==='people'&&<PeopleView people={people} selectedName={personName} onSelectName={setPersonName} onSelectLoop={setSelected}/>} 
 {tab==='memory'&&<MemoryView query={memoryQuery} onQuery={setMemoryQuery} loops={memory} searching={memorySearching} onSelect={setSelected}/>} 
 <nav><button className={tab==='today'?'active':''} onClick={()=>setTab('today')}><Clock3/>Сегодня</button><button className={tab==='people'?'active':''} onClick={()=>setTab('people')}><Users/>Люди</button><button className={tab==='memory'?'active':''} onClick={()=>setTab('memory')}><Brain/>Память</button></nav>
 {selected&&<LoopDetail loop={selected} candidates={loops.filter(l=>l.id!==selected.id&&!l.mergedInto&&l.status!=='dismissed'&&l.status!=='done'&&(l.kind==='plan'||l.type==='event'))} spaces={spaceDefinitions} onAssign={assignSpace} onCorrect={correctMeaning} onSchedule={saveSchedule} onAddParticipant={saveParticipant} onRemoveParticipant={removeParticipant} onMerge={mergeMeeting} onUndoMerge={undoMerge} onReopen={reopenLoop} onConfirm={confirmPlan} onDismiss={dismissPlan} onClose={()=>setSelected(null)} onDone={done} onSnooze={snooze}/>}
 {spaceSheet&&<SpacesSheet spaces={spaceDefinitions} onClose={()=>setSpaceSheet(false)} onSave={saveSpace} onDelete={removeSpace} onNotice={setTopNotice}/>}</main>
}
function FirstRunEmpty(){
 return <section className="first-run" aria-labelledby="first-run-title">
  <div className="first-run-icon"><MessageSquareText size={28}/></div>
  <div className="first-run-eyebrow">ПЕРВОЕ СООБЩЕНИЕ</div>
  <h2 id="first-run-title">Не теряй важное в переписках</h2>
  <p className="first-run-description">Пересылай сообщения и голосовые в LOOP. Он поможет понять, что сделать, кому ответить и что сохранить.</p>
  <a className="first-run-cta" href={BOT_URL} onClick={event=>{if(telegram?.openTelegramLink){event.preventDefault();telegram.openTelegramLink(BOT_URL)}}}>Открыть бота <ArrowUpRight size={19}/></a>
  <ol className="first-run-steps">
   <li><span>1</span><p>Открой нужное сообщение в любом чате.</p></li>
   <li><span>2</span><p>Нажми «Переслать» и выбери LOOP.</p></li>
   <li><span>3</span><p>Вернись сюда. Карточка появится автоматически.</p></li>
  </ol>
  <div className="first-run-privacy"><ShieldCheck size={17}/><span>LOOP видит только то, что ты ему пересылаешь.</span></div>
 </section>
}
function TodayView({loops,allLoops,snoozed,dismissed,space,spaces,firstRun,onSpace,onManage,onSelect,onAssign,statusFilter}:{loops:OpenLoop[];allLoops:OpenLoop[];snoozed:OpenLoop[];dismissed:OpenLoop[];space:SpaceFilter;spaces:SpaceDefinition[];firstRun:boolean;onSpace:(s:SpaceFilter)=>void;onManage:()=>void;onSelect:(l:OpenLoop)=>void;onAssign:(l:OpenLoop,name:string)=>void;statusFilter:TodayStatusFilter}){
 const unassigned=statusFilter==='active'&&space==='Все'?loops.filter(loop=>!loop.space):[];
 const assigned=(statusFilter==='active'?loops.filter(loop=>Boolean(loop.space)):[...loops]).sort((a,b)=>{
  const rank=(loop:OpenLoop)=>commitmentBadge(loop)==='Просрочено'||commitmentBadge(loop)==='Обещание задерживается'?0:commitmentBadge(loop)==='Событие прошло'?2:1;
  return rank(a)-rank(b);
 });
 return <>
  <SpaceTabs spaces={spaces} active={space} loops={allLoops} onSelect={onSpace} onManage={onManage}/>
  {firstRun?<FirstRunEmpty/>:<>
   {unassigned.length>0&&<section className="unassigned-section">
    <div className="unassigned-title"><div><span className="unassigned-title-icon">?</span><strong>Нужно распределить</strong></div><small>{unassigned.length}</small></div>
    <p className="unassigned-hint">LOOP не уверен, к какой теме относятся эти сообщения.</p>
    {unassigned.map(loop=><UnassignedCard key={loop.id} loop={loop} spaces={spaces} onAssign={onAssign} onOpen={onSelect}/>)}
   </section>}
   {assigned.length>0&&<div className="loop-list-heading"><h2>{statusFilter==='done'?'Выполненные':statusFilter==='overdue'?'Просроченные':'Требуют внимания'}</h2><span>{assigned.length}</span></div>}
   <section className="stack">{assigned.map(loop=><LoopCard key={loop.id} loop={loop} onOpen={()=>onSelect(loop)}/>)}</section>
   {!loops.length&&<div className="empty"><Check size={26}/><strong>{statusFilter==='done'?'Выполненных задач пока нет':statusFilter==='overdue'?'Просроченных задач нет':space==='Все'?'Сейчас ничего не требует внимания':'В этом разделе пусто'}</strong><span>{space!=='Все'?'Попробуй выбрать «Все», чтобы увидеть остальные задачи.':statusFilter==='done'?'Когда завершишь задачу, она появится здесь.':statusFilter==='overdue'?'Все сроки пока в порядке.':'Все задачи выполнены или отложены. Новые появятся после пересылки боту.'}</span></div>}
   {!!snoozed.length&&space==='Все'&&statusFilter==='active'&&<section className="history-block"><div className="section-title">Отложено · {snoozed.length}</div>{snoozed.slice(0,8).map(loop=><button key={loop.id} className="history-row" onClick={()=>onSelect(loop)}><span className="history-check">◷</span><span><strong>{loop.title}</strong><small>Вернуть раньше · {formatDate(loop.snoozedUntil||loop.dueAt)}</small></span><ChevronRight size={16}/></button>)}</section>}
   {!!dismissed.length&&space==='Все'&&statusFilter==='active'&&<section className="history-block"><div className="section-title">Неактуально · {dismissed.length}</div>{dismissed.slice(0,8).map(loop=><button key={loop.id} className="history-row" onClick={()=>onSelect(loop)}><span className="history-check">↩</span><span><strong>{loop.title}</strong><small>Можно вернуть в работу</small></span><ChevronRight size={16}/></button>)}</section>}
  </>}
 </>;
}
function PeopleView({people,selectedName,onSelectName,onSelectLoop}:{people:[string,OpenLoop[]][];selectedName:string|null;onSelectName:(n:string|null)=>void;onSelectLoop:(l:OpenLoop)=>void}){if(selectedName){const items=people.find(([n])=>n===selectedName)?.[1]??[],open=items.filter(l=>l.status==='open'||l.status==='suggested'||l.status==='snoozed'),saved=items.filter(l=>l.type==='saved'),done=items.filter(l=>l.status==='done'),chatLoop=items.find(l=>l.person?.name===selectedName&&telegramLink(l)),chat=chatLoop?telegramLink(chatLoop):undefined;return <section className="person-page"><button className="back" onClick={()=>onSelectName(null)}>← Все люди</button><div className="person-hero"><div className="avatar">{selectedName.slice(0,1).toUpperCase()}</div><div><h2>{selectedName}</h2><p>{open.length} открыто · {saved.length} в памяти</p></div></div>{chat&&<a className="wide-action" href={chat}>Открыть чат в Telegram</a>}<PersonSection title="Незакрыто" loops={open.filter(x=>x.type!=='saved')} onSelect={onSelectLoop}/><PersonSection title="Советовал / сохранено" loops={saved} onSelect={onSelectLoop}/><PersonSection title="Закрыто" loops={done.slice(0,6)} onSelect={onSelectLoop}/></section>}return <section className="people-list">{people.map(([name,items])=>{const openCount=items.filter(l=>l.status==='open'||l.status==='suggested').length,savedCount=items.filter(l=>l.type==='saved').length;return <button key={name} className="person-row" onClick={()=>onSelectName(name)}><div className="avatar">{name.slice(0,1).toUpperCase()}</div><span><strong>{name}</strong><small>{openCount} открыто · {savedCount} сохранено</small></span><ChevronRight size={18}/></button>})}{!people.length&&<div className="empty"><Users size={26}/><strong>Людей пока нет</strong><span>Перешли сообщение от человека, и LOOP соберёт контекст.</span></div>}</section>}
function PersonSection({title,loops,onSelect}:{title:string;loops:OpenLoop[];onSelect:(l:OpenLoop)=>void}){if(!loops.length)return null;return <div className="person-section"><div className="section-title">{title}</div>{loops.map(loop=><button key={loop.id} className="mini-loop" onClick={()=>onSelect(loop)}><span>{meta[loop.type].icon}</span><span><strong>{loop.title}</strong><small>{loop.space??'Без темы'}{loop.dueAt?` · ${formatDate(loop.dueAt)}`:''}</small></span><ChevronRight size={16}/></button>)}</div>}
function MemoryView({query,onQuery,loops,searching,onSelect}:{query:string;onQuery:(v:string)=>void;loops:OpenLoop[];searching:boolean;onSelect:(l:OpenLoop)=>void}){return <><label className="search-box"><Search size={18}/><input value={query} onChange={e=>onQuery(e.target.value)} placeholder="Берлин, фильм, где поесть…"/></label><div className="memory-hint">{searching?'LOOP вспоминает…':'Пиши хоть одно слово, имя, место или обычный вопрос.'}</div><section className="memory-grid">{loops.map(loop=><button key={loop.id} className="memory-card" onClick={()=>onSelect(loop)}><div className="memory-top"><span>{loop.memoryCategory??'Сохранено'}</span><span>{loop.space??'Без темы'}</span></div><strong>{loop.title}</strong><small>{loop.person?.name?`От ${loop.person.name}`:'Из Telegram'}</small><span className="memory-open-hint">Открыть подробности <ChevronRight size={15}/></span></button>)}</section>{!searching&&!loops.length&&<div className="empty"><Brain size={26}/><strong>Ничего не нашлось</strong><span>Попробуй другое слово или формулировку.</span></div>}</>}
function LoopDetail({loop,candidates,spaces,onAssign,onCorrect,onSchedule,onAddParticipant,onRemoveParticipant,onMerge,onUndoMerge,onReopen,onConfirm,onDismiss,onClose,onDone,onSnooze}:{loop:OpenLoop;candidates:OpenLoop[];spaces:SpaceDefinition[];onAssign:(loop:OpenLoop,name:string)=>void;onCorrect:(loop:OpenLoop,choice:string,title:string)=>Promise<string|null>;onSchedule:(loop:OpenLoop,kind:'deadline'|'event',date:string|null,at:string|null)=>Promise<string|null>;
 onAddParticipant:(loop:OpenLoop,name:string)=>Promise<string|null>;
 onRemoveParticipant:(loop:OpenLoop,name:string)=>Promise<string|null>;
 onMerge:(loop:OpenLoop,otherId:string)=>Promise<string|null>;
 onUndoMerge:(loop:OpenLoop)=>Promise<string|null>;
 onReopen:(loop:OpenLoop)=>void;
 onConfirm:(l:OpenLoop)=>void;onDismiss:(l:OpenLoop)=>void;onClose:()=>void;onDone:(l:OpenLoop)=>void;onSnooze:(l:OpenLoop)=>void}){
 const chat=telegramLink(loop),calendar=googleCalendarLink(loop),m=meta[loop.type],isDone=loop.status==='done',isDemo=loop.id.startsWith('demo-');
 const proposal=loop.kind==='plan'&&(loop.agreementStatus==='proposed'||loop.agreementStatus==='unknown');
 const nextStep=actionHint(loop);
 const [editMeaning,setEditMeaning]=useState(false);
 return <div className="sheet-backdrop" onClick={onClose}><section className="sheet" onClick={e=>e.stopPropagation()}>
  <button className="sheet-close" onClick={onClose} aria-label="Закрыть"><X size={20}/></button>
  <div className="detail-badge"><span>{m.icon}</span>{loopLabel(loop)}</div><h2>{loop.title}</h2>
  <div className="detail-meta">{loop.space&&<span>{loop.space}</span>}{loop.whenText&&<span>🗓 {loop.whenText}</span>}{loop.memoryCategory&&<span>{loop.memoryCategory}</span>}{(loop.deadlineDate||loop.eventDate)&&<span>📅 {loop.deadlineDate||loop.eventDate}</span>}{(loop.deadlineAt||loop.eventAt)&&<span>⏰ {formatDate(loop.deadlineAt||loop.eventAt)}</span>}{loop.dueAt&&!loop.whenText&&!loop.deadlineDate&&!loop.eventDate&&<span>⏰ {formatDate(loop.dueAt)}</span>}{isDone&&<span>✓ Закрыто {formatDate(loop.completedAt)}</span>}</div>
  {commitmentBadge(loop)&&<p className="agreement-state">{commitmentBadge(loop)}</p>}
 {loop.kind==='plan'&&<p className="agreement-state">{proposal?'Встреча или передача пока предложена, но не подтверждена.':loop.agreementStatus==='confirmed'?'Договорённость подтверждена.':'Не удалось установить, подтверждены ли детали.'}</p>}
  {nextStep&&<div className="detail-next-step"><small>Следующий шаг</small><strong>{nextStep}</strong></div>}
  {!isDemo&&<div className="meaning-edit-area">
   {editMeaning?<MeaningEditor loop={loop} onSave={(choice,title)=>onCorrect(loop,choice,title)} onCancel={()=>setEditMeaning(false)}/>
   :<button type="button" className="meaning-edit-toggle" onClick={()=>setEditMeaning(true)}>Исправить смысл или название <span aria-hidden="true">✎</span></button>}
  </div>}
  {!isDemo&&((loop.type==='event'&&loop.kind==='plan'&&loop.agreementStatus==='confirmed')||(loop.type!=='event'&&loop.type!=='saved'&&loop.kind!=='plan'))&&
   <ScheduleEditor key={loop.id} loop={loop} onSave={(kind,date,at)=>onSchedule(loop,kind,date,at)}/>}
  {!isDemo&&<label className="detail-space-select">Тема<select value={loop.space??''} onChange={e=>onAssign(loop,e.target.value)}>
   <option value="">Без темы</option>{spaces.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}
  </select><small>Исправления помогают LOOP точнее распределять следующие сообщения.</small></label>}
  {loop.person&&<div className="detail-person"><div className="avatar">{loop.person.name.slice(0,1).toUpperCase()}</div><div><small>Человек</small><strong>{loop.person.name}</strong></div></div>}
  {!isDemo&&loop.type!=='saved'&&<ParticipantsEditor loop={loop} candidates={(loop.kind==='plan'||loop.type==='event')?candidates:[]}
   onAdd={name=>onAddParticipant(loop,name)}
   onRemove={name=>onRemoveParticipant(loop,name)}
   onMerge={id=>onMerge(loop,id)}
   onUndoMerge={()=>onUndoMerge(loop)}/>}
  {loop.source.text&&<div className="source-block"><small>{loop.source.mediaKind?'Расшифровка':'Исходное сообщение'}</small><p>“{loop.source.text}”</p></div>}
  <div className="detail-actions">{chat&&<a href={chat}>Открыть чат в Telegram</a>}{calendar&&<a href={calendar} target="_blank" rel="noreferrer"><CalendarPlus size={17}/>В календарь</a>}</div>
  {isDemo&&<p style={{color:'#9da29b',fontSize:12}}>Демо-карточка. Действия не сохраняются.</p>}
  {!isDemo&&!isDone&&loop.status!=='dismissed'&&proposal&&<div className="sheet-footer"><button className="primary" onClick={()=>onConfirm(loop)}>Договорились</button><button className="ghost" onClick={()=>onDismiss(loop)}>Неактуально</button></div>}
  {!isDemo&&['done','dismissed','snoozed'].includes(loop.status)&&!loop.mergedInto&&<div className="sheet-footer"><button className="primary" onClick={()=>onReopen(loop)}>Вернуть в работу</button></div>}
  {!isDemo&&!isDone&&loop.status!=='dismissed'&&!proposal&&loop.type!=='saved'&&loop.status!=='snoozed'&&<div className="sheet-footer"><button className="primary" onClick={()=>onDone(loop)}>{loop.type==='waiting'?'Получено':'Готово'}</button><button className="ghost" onClick={()=>onSnooze(loop)}>До завтра</button></div>}
 </section></div>;
}
