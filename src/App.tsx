import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Brain, Briefcase, CalendarPlus, Check, ChevronRight, Clock3, FolderPlus, House, MessageSquareText, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import type { LoopSpace, OpenLoop, SpaceDefinition } from './types/open-loop';
import { SpacesSheet, UnassignedCard } from './spaces-ui';
import { MeaningEditor } from './meaning-editor';

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

// Only local Vite preview uses these cards. They are never written to the API.
const demoLoops: OpenLoop[] = [
 {id:'demo-reply',type:'reply',status:'open',title:'Сдать доклад по окружающему миру',person:{name:'Арина'},space:'Личное',confidence:1,dueAt:new Date(Date.now()+86400000).toISOString(),source:{messageId:-1,receivedAt:new Date().toISOString(),text:'Слушай, пожалуйста, не забудь отправить мне доклад по окружающему миру. Он нужен до завтра, и ещё уточни, какие картинки ты хочешь добавить. Если будет время, напиши вечером, вместе посмотрим финальную версию.'},createdAt:new Date().toISOString()},
 {id:'demo-todo',type:'todo',status:'open',title:'Купить продукты к ужину',person:{name:'Маша'},space:'Дом',confidence:1,dueAt:new Date(Date.now()+172800000).toISOString(),source:{messageId:-2,receivedAt:new Date().toISOString(),text:'Возьми, пожалуйста, помидоры, сыр, молоко и хлеб. Спасибо!'},createdAt:new Date().toISOString()},
 {id:'demo-waiting',type:'waiting',status:'open',title:'Дождаться ответа по встрече',person:{name:'Никита'},space:'Работа',confidence:1,source:{messageId:-3,receivedAt:new Date().toISOString(),text:'Я уточню у ребят по времени и обязательно вернусь с ответом, когда все подтвердят, что смогут прийти.'},createdAt:new Date().toISOString()}
];

function attentionText(count:number){if(count===1)return'1 вещь требует внимания';if(count>=2&&count<=4)return`${count} вещи требуют внимания`;return`${count} вещей требуют внимания`}
function formatDate(value?:string){if(!value)return;const date=new Date(value);if(Number.isNaN(date.getTime()))return;return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date)}
function telegramLink(loop:OpenLoop){const username=loop.person?.username?.replace(/^@/,'');if(username)return`https://t.me/${username}`;if(loop.person?.telegramUserId)return`tg://user?id=${loop.person.telegramUserId}`}
function googleCalendarLink(loop:OpenLoop){if(!loop.dueAt||loop.agreementStatus==='proposed'||loop.agreementStatus==='unknown')return;const start=new Date(loop.dueAt);if(Number.isNaN(start.getTime()))return;const end=new Date(start.getTime()+30*60*1000);const stamp=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');const params=new URLSearchParams({action:'TEMPLATE',text:loop.title,dates:`${stamp(start)}/${stamp(end)}`,details:loop.source.text?`Из Telegram: ${loop.source.text}`:'Добавлено из LOOP'});return`https://calendar.google.com/calendar/render?${params.toString()}`}

export function App(){
 const[loops,setLoops]=useState<OpenLoop[]>([]),[spaceDefinitions,setSpaceDefinitions]=useState<SpaceDefinition[]>([]),[spaceSheet,setSpaceSheet]=useState(false),[actionError,setActionError]=useState(''),[connected,setConnected]=useState(false),[hasLoaded,setHasLoaded]=useState(false),[tab,setTab]=useState<Tab>('today'),[space,setSpace]=useState<SpaceFilter>('Все'),[selected,setSelected]=useState<OpenLoop|null>(null),[personName,setPersonName]=useState<string|null>(null),[memoryQuery,setMemoryQuery]=useState(''),[memoryResults,setMemoryResults]=useState<OpenLoop[]|null>(null),[memorySearching,setMemorySearching]=useState(false);
 async function loadLoops(){try{const res=await fetch(`${API_URL}/loops`,{headers:authHeaders()});if(!res.ok)throw new Error();setLoops(await res.json());setConnected(true)}catch{setConnected(false)}finally{setHasLoaded(true)}}
 async function loadSpaces(){try{const res=await fetch(`${API_URL}/spaces`,{headers:authHeaders()});if(!res.ok)throw new Error();setSpaceDefinitions(await res.json())}catch{setActionError('Не удалось загрузить Spaces. Проверь соединение.')}}
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
 useEffect(()=>{telegram?.ready?.();telegram?.expand?.();loadLoops();loadSpaces();const timer=setInterval(loadLoops,2000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const q=memoryQuery.trim();if(!q){setMemoryResults(null);setMemorySearching(false);return}const controller=new AbortController();const timer=setTimeout(async()=>{setMemorySearching(true);try{const res=await fetch(`${API_URL}/memory/search?q=${encodeURIComponent(q)}`,{signal:controller.signal,headers:authHeaders()});if(res.ok)setMemoryResults(await res.json())}catch(error){if((error as Error).name!=='AbortError')setMemoryResults([])}finally{if(!controller.signal.aborted)setMemorySearching(false)}},300);return()=>{clearTimeout(timer);controller.abort()}},[memoryQuery]);
 const demoMode=import.meta.env.DEV&&new URLSearchParams(window.location.search).has('demo');
 const attention=useMemo(()=>{const now=Date.now();return loops.filter(l=>l.type!=='saved'&&((l.status==='open'||l.status==='suggested')||(l.status==='snoozed'&&l.dueAt&&new Date(l.dueAt).getTime()<=now)))},[loops]);
 const visibleAttention=useMemo(()=>(demoMode?demoLoops:attention).filter(l=>space==='Все'||l.space===space),[attention,space,demoMode]);
 const history=useMemo(()=>loops.filter(l=>l.status==='done').sort((a,b)=>(b.completedAt??'').localeCompare(a.completedAt??'')),[loops]);
 const allMemory=useMemo(()=>loops.filter(l=>l.type==='saved'&&l.status!=='dismissed'),[loops]);
 const memory=memoryQuery.trim()?memoryResults??[]:allMemory;
 const people=useMemo(()=>{const map=new Map<string,OpenLoop[]>();for(const loop of loops){const name=loop.person?.name;if(!name)continue;map.set(name,[...(map.get(name)??[]),loop])}return[...map.entries()].sort((a,b)=>{const oa=a[1].filter(x=>x.status==='open'||x.status==='suggested').length,ob=b[1].filter(x=>x.status==='open'||x.status==='suggested').length;return ob-oa||a[0].localeCompare(b[0],'ru')})},[loops]);
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
 async function snooze(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;const until=new Date();until.setDate(until.getDate()+1);until.setHours(9,0,0,0);if(await patchLoop(loop.id,{status:'snoozed',dueAt:until.toISOString()}))setSelected(null)}
 async function confirmPlan(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;await patchLoop(loop.id,{type:'event',kind:'plan',agreementStatus:'confirmed',nextAction:'none',nextActionText:null,status:'open'})}
 async function dismissPlan(loop:OpenLoop){if(loop.id.startsWith('demo-'))return;if(await patchLoop(loop.id,{status:'dismissed'}))setSelected(null)}
 const firstRun=hasLoaded&&connected&&loops.length===0&&!demoMode;
 const title=tab==='today'?'Сегодня':tab==='people'?'Люди':'Память';
 return <main className="shell"><header><div className="eyebrow">LOOP</div><h1>{title}</h1><p>{tab==='today'&&demoMode?'Демо · карточки для просмотра на телефоне':!hasLoaded?'Загружаем сообщения…':!connected?'LOOP не подключён':firstRun?'Твои важные сообщения будут здесь':tab==='today'?(attention.length?attentionText(attention.length):'Хвостов нет. Красиво.'):tab==='people'?`${people.length} человек в контексте`:`${allMemory.length} сохранено`}</p></header>
 {actionError&&<div className="action-error" role="alert">{actionError}<button type="button" onClick={()=>setActionError('')} aria-label="Скрыть ошибку"><X size={15}/></button></div>}
 {tab==='today'&&(hasLoaded&&!connected&&!loops.length&&!demoMode?<div className="empty"><strong>Не удалось загрузить сообщения</strong><span>Проверь соединение и открой LOOP через Telegram.</span></div>:<TodayView loops={visibleAttention} history={history} space={space} spaces={spaceDefinitions} firstRun={firstRun} onSpace={setSpace} onManage={()=>setSpaceSheet(true)} onSelect={setSelected} onAssign={assignSpace}/>)} 
 {tab==='people'&&<PeopleView people={people} selectedName={personName} onSelectName={setPersonName} onSelectLoop={setSelected}/>} 
 {tab==='memory'&&<MemoryView query={memoryQuery} onQuery={setMemoryQuery} loops={memory} searching={memorySearching} onSelect={setSelected}/>} 
 <nav><button className={tab==='today'?'active':''} onClick={()=>setTab('today')}><Clock3/>Сегодня</button><button className={tab==='people'?'active':''} onClick={()=>setTab('people')}><Users/>Люди</button><button className={tab==='memory'?'active':''} onClick={()=>setTab('memory')}><Brain/>Память</button></nav>
 {selected&&<LoopDetail loop={selected} spaces={spaceDefinitions} onAssign={assignSpace} onCorrect={correctMeaning} onConfirm={confirmPlan} onDismiss={dismissPlan} onClose={()=>setSelected(null)} onDone={done} onSnooze={snooze}/>}
 {spaceSheet&&<SpacesSheet spaces={spaceDefinitions} onClose={()=>setSpaceSheet(false)} onSave={saveSpace} onDelete={removeSpace}/>}</main>
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
function TodayView({loops,history,space,spaces,firstRun,onSpace,onManage,onSelect,onAssign}:{loops:OpenLoop[];history:OpenLoop[];space:SpaceFilter;spaces:SpaceDefinition[];firstRun:boolean;onSpace:(s:SpaceFilter)=>void;onManage:()=>void;onSelect:(l:OpenLoop)=>void;onAssign:(l:OpenLoop,name:string)=>void}){
 const unassigned=space==='Все'?loops.filter(loop=>!loop.space):[];
 const assigned=loops.filter(loop=>Boolean(loop.space));
 const filterNames=['Все',...spaces.map(item=>item.name)];
 return <>
  <div className="spaces-bar">
   <div className="spaces">{filterNames.map(item=><button type="button" key={item} className={space===item?'selected':''} onClick={()=>onSpace(item)}>{item==='Дом'&&<House size={14}/>} {item==='Работа'&&<Briefcase size={14}/>} {item==='Личное'&&<UserRound size={14}/>} {item}</button>)}</div>
   <button type="button" className="space-manage-button" onClick={onManage}><FolderPlus size={15}/> + Space</button>
  </div>
  {firstRun?<FirstRunEmpty/>:<>
   {unassigned.length>0&&<section className="unassigned-section">
    <div className="unassigned-title"><div><span className="unassigned-title-icon">?</span><strong>Нужно распределить</strong></div><small>{unassigned.length}</small></div>
    <p className="unassigned-hint">LOOP не уверен, к какой теме относятся эти сообщения.</p>
    {unassigned.map(loop=><UnassignedCard key={loop.id} loop={loop} spaces={spaces} onAssign={onAssign} onOpen={onSelect}/>)}
   </section>}
   <section className="stack">{assigned.map(loop=><LoopCard key={loop.id} loop={loop} onOpen={()=>onSelect(loop)}/>)}</section>
   {!loops.length&&<div className="empty"><Check size={26}/><strong>{space==='Все'?'Сейчас ничего не требует внимания':'В этом разделе пусто'}</strong><span>{space==='Все'?'Все задачи выполнены или отложены. Новые появятся после пересылки боту.':'Попробуй выбрать «Все», чтобы увидеть остальные задачи.'}</span></div>}
   {!!history.length&&<section className="history-block"><div className="section-title">Выполнено</div>{history.slice(0,8).map(loop=><button key={loop.id} className="history-row" onClick={()=>onSelect(loop)}><span className="history-check">✓</span><span><strong>{loop.title}</strong><small>{loop.person?.name??loop.space??'LOOP'} · {formatDate(loop.completedAt)}</small></span><ChevronRight size={16}/></button>)}</section>}
  </>}
 </>;
}
function PeopleView({people,selectedName,onSelectName,onSelectLoop}:{people:[string,OpenLoop[]][];selectedName:string|null;onSelectName:(n:string|null)=>void;onSelectLoop:(l:OpenLoop)=>void}){if(selectedName){const items=people.find(([n])=>n===selectedName)?.[1]??[],open=items.filter(l=>l.status==='open'||l.status==='suggested'||l.status==='snoozed'),saved=items.filter(l=>l.type==='saved'),done=items.filter(l=>l.status==='done'),chatLoop=items.find(l=>telegramLink(l)),chat=chatLoop?telegramLink(chatLoop):undefined;return <section className="person-page"><button className="back" onClick={()=>onSelectName(null)}>← Все люди</button><div className="person-hero"><div className="avatar">{selectedName.slice(0,1).toUpperCase()}</div><div><h2>{selectedName}</h2><p>{open.length} открыто · {saved.length} в памяти</p></div></div>{chat&&<a className="wide-action" href={chat}>Открыть чат в Telegram</a>}<PersonSection title="Незакрыто" loops={open.filter(x=>x.type!=='saved')} onSelect={onSelectLoop}/><PersonSection title="Советовал / сохранено" loops={saved} onSelect={onSelectLoop}/><PersonSection title="Закрыто" loops={done.slice(0,6)} onSelect={onSelectLoop}/></section>}return <section className="people-list">{people.map(([name,items])=>{const openCount=items.filter(l=>l.status==='open'||l.status==='suggested').length,savedCount=items.filter(l=>l.type==='saved').length;return <button key={name} className="person-row" onClick={()=>onSelectName(name)}><div className="avatar">{name.slice(0,1).toUpperCase()}</div><span><strong>{name}</strong><small>{openCount} открыто · {savedCount} сохранено</small></span><ChevronRight size={18}/></button>})}{!people.length&&<div className="empty"><Users size={26}/><strong>Людей пока нет</strong><span>Перешли сообщение от человека, и LOOP соберёт контекст.</span></div>}</section>}
function PersonSection({title,loops,onSelect}:{title:string;loops:OpenLoop[];onSelect:(l:OpenLoop)=>void}){if(!loops.length)return null;return <div className="person-section"><div className="section-title">{title}</div>{loops.map(loop=><button key={loop.id} className="mini-loop" onClick={()=>onSelect(loop)}><span>{meta[loop.type].icon}</span><span><strong>{loop.title}</strong><small>{loop.space??'Без темы'}{loop.dueAt?` · ${formatDate(loop.dueAt)}`:''}</small></span><ChevronRight size={16}/></button>)}</div>}
function MemoryView({query,onQuery,loops,searching,onSelect}:{query:string;onQuery:(v:string)=>void;loops:OpenLoop[];searching:boolean;onSelect:(l:OpenLoop)=>void}){return <><label className="search-box"><Search size={18}/><input value={query} onChange={e=>onQuery(e.target.value)} placeholder="Берлин, фильм, где поесть…"/></label><div className="memory-hint">{searching?'LOOP вспоминает…':'Пиши хоть одно слово, имя, место или обычный вопрос.'}</div><section className="memory-grid">{loops.map(loop=><button key={loop.id} className="memory-card" onClick={()=>onSelect(loop)}><div className="memory-top"><span>{loop.memoryCategory??'Сохранено'}</span><span>{loop.space??'Без темы'}</span></div><strong>{loop.title}</strong><small>{loop.person?.name?`От ${loop.person.name}`:'Из Telegram'}</small>{loop.source.text&&<p>“{loop.source.text}”</p>}</button>)}</section>{!searching&&!loops.length&&<div className="empty"><Brain size={26}/><strong>Ничего не нашлось</strong><span>Попробуй другое слово или формулировку.</span></div>}</>}
function LoopCard({loop,onOpen}:{loop:OpenLoop;onOpen:()=>void}){
 const [expanded,setExpanded]=useState(false);
 const chat=telegramLink(loop);
 const message=loop.source.text;
 const date=loop.dueAt?new Date(loop.dueAt):null;
 const dateLabel=loop.whenText??(date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(date):null);
 const typeLabel=loopLabel(loop);
 const nextStep=actionHint(loop);
 return <article className="card attention-card">
  <div className="attention-head">
   <div className="attention-avatar">{(loop.person?.name??'L').slice(0,1).toUpperCase()}</div>
   <div className="attention-identity">
    <strong>{loop.person?.name??'Из Telegram'}</strong>
    <div className="attention-tags"><span>{typeLabel}</span><span>{loop.space??'Без темы'}</span>{dateLabel&&<time className="attention-date" dateTime={loop.dueAt}>{dateLabel}</time>}</div>
   </div>
   <button type="button" className="attention-menu" aria-label="Открыть детали задачи" onClick={onOpen}><span aria-hidden="true">···</span></button>
  </div>
  <h2>{loop.title}</h2>
  {nextStep&&<div className="attention-next-step"><strong>Следующий шаг</strong><span>{nextStep}</span></div>}
  {message&&<div className="attention-source">
   <div className="attention-source-label">{loop.source.mediaKind?'РАСШИФРОВКА':'В ЧАТЕ'}</div>
   <p className={expanded?'attention-message expanded':'attention-message'}>{message}</p>
   <div className="attention-source-actions">
    {message.length>85&&<button type="button" className="attention-expand" onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть':'Показать полностью'}</button>}
    {loop.id.startsWith('demo-')?<button type="button" className="attention-telegram" title="Демо: ссылки на чат нет" onClick={()=>window.alert('Демо-карточка: переход в Telegram недоступен')}>В Telegram <span aria-hidden="true">↗</span></button>:chat&&<a className="attention-telegram" href={chat} onClick={e=>e.stopPropagation()}>В Telegram <span aria-hidden="true">↗</span></a>}
   </div>
  </div>}
 </article>
}
function LoopDetail({loop,spaces,onAssign,onCorrect,onConfirm,onDismiss,onClose,onDone,onSnooze}:{loop:OpenLoop;spaces:SpaceDefinition[];onAssign:(loop:OpenLoop,name:string)=>void;onCorrect:(loop:OpenLoop,choice:string,title:string)=>Promise<string|null>;onConfirm:(l:OpenLoop)=>void;onDismiss:(l:OpenLoop)=>void;onClose:()=>void;onDone:(l:OpenLoop)=>void;onSnooze:(l:OpenLoop)=>void}){
 const chat=telegramLink(loop),calendar=googleCalendarLink(loop),m=meta[loop.type],isDone=loop.status==='done',isDemo=loop.id.startsWith('demo-');
 const proposal=loop.kind==='plan'&&(loop.agreementStatus==='proposed'||loop.agreementStatus==='unknown');
 const nextStep=actionHint(loop);
 const [editMeaning,setEditMeaning]=useState(false);
 return <div className="sheet-backdrop" onClick={onClose}><section className="sheet" onClick={e=>e.stopPropagation()}>
  <button className="sheet-close" onClick={onClose} aria-label="Закрыть"><X size={20}/></button>
  <div className="detail-badge"><span>{m.icon}</span>{loopLabel(loop)}</div><h2>{loop.title}</h2>
  <div className="detail-meta">{loop.space&&<span>{loop.space}</span>}{loop.whenText&&<span>🗓 {loop.whenText}</span>}{loop.memoryCategory&&<span>{loop.memoryCategory}</span>}{loop.dueAt&&!loop.whenText&&<span>⏰ {formatDate(loop.dueAt)}</span>}{isDone&&<span>✓ Закрыто {formatDate(loop.completedAt)}</span>}</div>
  {loop.kind==='plan'&&<p className="agreement-state">{proposal?'Встреча или передача пока предложена, но не подтверждена.':loop.agreementStatus==='confirmed'?'Договорённость подтверждена.':'Не удалось установить, подтверждены ли детали.'}</p>}
  {nextStep&&<div className="detail-next-step"><small>Следующий шаг</small><strong>{nextStep}</strong></div>}
  {!isDemo&&<div className="meaning-edit-area">
   {editMeaning?<MeaningEditor loop={loop} onSave={(choice,title)=>onCorrect(loop,choice,title)} onCancel={()=>setEditMeaning(false)}/>
   :<button type="button" className="meaning-edit-toggle" onClick={()=>setEditMeaning(true)}>Исправить смысл или название <span aria-hidden="true">✎</span></button>}
  </div>}
  {!isDemo&&<label className="detail-space-select">Тема<select value={loop.space??''} onChange={e=>onAssign(loop,e.target.value)}>
   <option value="">Без темы</option>{spaces.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}
  </select><small>Исправления помогают LOOP точнее распределять следующие сообщения.</small></label>}
  {loop.person&&<div className="detail-person"><div className="avatar">{loop.person.name.slice(0,1).toUpperCase()}</div><div><small>Человек</small><strong>{loop.person.name}</strong></div></div>}
  {loop.source.text&&<div className="source-block"><small>{loop.source.mediaKind?'Расшифровка':'Исходное сообщение'}</small><p>“{loop.source.text}”</p></div>}
  <div className="detail-actions">{chat&&<a href={chat}>Открыть чат в Telegram</a>}{calendar&&<a href={calendar} target="_blank" rel="noreferrer"><CalendarPlus size={17}/>В календарь</a>}</div>
  {isDemo&&<p style={{color:'#9da29b',fontSize:12}}>Демо-карточка. Действия не сохраняются.</p>}
  {!isDemo&&!isDone&&loop.status!=='dismissed'&&proposal&&<div className="sheet-footer"><button className="primary" onClick={()=>onConfirm(loop)}>Договорились</button><button className="ghost" onClick={()=>onDismiss(loop)}>Неактуально</button></div>}
  {!isDemo&&!isDone&&loop.status!=='dismissed'&&!proposal&&loop.type!=='saved'&&<div className="sheet-footer"><button className="primary" onClick={()=>onDone(loop)}>{loop.type==='waiting'?'Получено':'Готово'}</button><button className="ghost" onClick={()=>onSnooze(loop)}>До завтра</button></div>}
 </section></div>;
}
