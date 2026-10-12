import { useState, type FormEvent } from 'react';
import type { OpenLoop } from './types/open-loop';

export function ParticipantsEditor({loop,candidates,onAdd,onRemove,onMerge,onUndoMerge}:{
 loop:OpenLoop;
 candidates:OpenLoop[];
 onAdd:(name:string)=>Promise<string|null>;
 onRemove:(name:string)=>Promise<string|null>;
 onMerge:(otherId:string)=>Promise<string|null>;
 onUndoMerge:()=>Promise<string|null>;
}){
 const [name,setName]=useState('');
 const [otherId,setOtherId]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 async function run(operation:()=>Promise<string|null>,success:string){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await operation();
   if(result)setError(result);
   else setNotice(success);
   return !result;
  }catch{setError('Не удалось сохранить изменения.');return false;}
  finally{setBusy(false);}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const value=name.trim();
  if(value.length<2){setError('Напиши имя участника.');return;}
  if(await run(()=>onAdd(value),`Участник «${value}» добавлен`))setName('');
 }
 async function merge(){
  const other=candidates.find(item=>item.id===otherId);
  if(!other)return;
  if(!window.confirm(`Объединить две договорённости в одну? Основной останется «${loop.title}», оба исходных сообщения сохранятся.`))return;
  if(await run(()=>onMerge(otherId),'Договорённости объединены'))setOtherId('');
 }
 return <div className="detail-participants">
  <strong>Участники</strong>
  <div className="detail-participants-list">
   {loop.person&&<span>{loop.person.name} · автор сообщения</span>}
   {(loop.participants??[]).map(person=><div key={person.name} className="detail-participant-row">
    <span>{person.name}</span>
    <button type="button" disabled={busy} onClick={()=>void run(()=>onRemove(person.name),`«${person.name}» убран из участников`)} aria-label={`Убрать участника ${person.name}`}>×</button>
   </div>)}
  </div>
  <form className="detail-participants-form" onSubmit={e=>void submit(e)}>
   <label>Добавить человека<input value={name} maxLength={70} disabled={busy} placeholder="Например, Кирилл" onChange={e=>{setName(e.target.value);setNotice('');}}/></label>
   <button type="submit" disabled={busy||name.trim().length<2}>Добавить</button>
  </form>
  {!!loop.mergeHistory?.length&&<div className="detail-merge">
   <small>Объединено карточек: {loop.mergeHistory.length}. Можно вернуть последнюю.</small>
   <button type="button" disabled={busy} onClick={()=>void run(onUndoMerge,'Последнее объединение отменено')}>Отменить последнее объединение</button>
  </div>}
  {!!candidates.length&&<div className="detail-merge">
   <label>Объединить с другой договорённостью<select value={otherId} disabled={busy} onChange={e=>setOtherId(e.target.value)}>
    <option value="">Выбери карточку…</option>
    {candidates.map(item=><option key={item.id} value={item.id}>{item.person?.name??'Из Telegram'} · {item.title.slice(0,48)}</option>)}
   </select></label>
   <button type="button" disabled={busy||!otherId} onClick={()=>void merge()}>Объединить карточки</button>
  </div>}
  {notice&&<small role="status" className="detail-participants-ok">✓ {notice}</small>}
  {error&&<small role="alert" className="spaces-form-error">{error}</small>}
  {(loop.relatedSources??[]).length>0&&<div className="detail-related-sources">
   <strong>Другие сообщения в договорённости</strong>
   {(loop.relatedSources??[]).map((source,index)=><blockquote key={`${source.chatId}-${source.messageId}-${index}`}>
    <small>{source.authorName??'Из Telegram'}</small>
    <p>{source.text??'Сообщение из Telegram'}</p>
   </blockquote>)}
  </div>}
 </div>;
}
