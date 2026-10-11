import { useState, type FormEvent } from 'react';
import type { OpenLoop } from './types/open-loop';

function validDay(text?:string|null) { return typeof text==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(text); }
function localDate(value:string|null|undefined){
 if(!value)return '';
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function localTime(value:string|null|undefined){
 if(!value)return '';
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function commitmentBadge(loop:OpenLoop, now=Date.now()){
 if(loop.status==='done'||loop.status==='dismissed')return null;
 const nowDay=localDate(new Date(now).toISOString());
 const task=loop.type!=='saved'&&loop.type!=='event'&&loop.kind!=='plan';
 const event=loop.type==='event'&&loop.kind==='plan'&&loop.agreementStatus==='confirmed';
 if(task){
  const at=loop.deadlineAt || (loop.status!=='snoozed'?loop.dueAt:undefined);
  const overdue=at && Number.isFinite(Date.parse(at)) ? Date.parse(at)<now : validDay(loop.deadlineDate)? nowDay>loop.deadlineDate! : false;
  return overdue?(loop.type==='waiting'?'Обещание задерживается':'Просрочено'):null;
 }
 if(event){
  const at=loop.eventAt||loop.dueAt;
  const past=at&&Number.isFinite(Date.parse(at))?Date.parse(at)<now:validDay(loop.eventDate)?nowDay>loop.eventDate!:false;
  return past?'Событие прошло':null;
 }
 return null;
}
export function timeLabel(loop:OpenLoop){
 return loop.deadlineDate||loop.eventDate||loop.whenText||
  (loop.deadlineAt||loop.eventAt||loop.dueAt?localDate(loop.deadlineAt||loop.eventAt||loop.dueAt):null);
}
export function ScheduleEditor({loop,onSave}:{
 loop:OpenLoop;
 onSave:(kind:'deadline'|'event',date:string|null,at:string|null)=>Promise<string|null>;
}){
 const isEvent=loop.type==='event'&&loop.kind==='plan'&&loop.agreementStatus==='confirmed';
 const kind=isEvent?'event':'deadline';
 const initialDate=kind==='event'?loop.eventDate||localDate(loop.eventAt||loop.dueAt):
  loop.deadlineDate||localDate(loop.deadlineAt||((loop.status!=='snoozed')?loop.dueAt:undefined));
 const initialAt=kind==='event'?loop.eventAt:loop.deadlineAt;
 const [date,setDate]=useState(initialDate??'');
 const [time,setTime]=useState(localTime(initialAt));
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  if(!date){setError('Выбери дату или нажми «Убрать»');return;}
  await save(date,time);
 }
 async function save(day:string,clock:string){
  setBusy(true);setError('');setSaved(false);
  const iso=day&&clock?new Date(`${day}T${clock}:00`).toISOString():null;
  try{
   const error=await onSave(kind,day||null,iso);
   if(error){setError(error);return;}
   setSaved(true);
   setDate(day);setTime(clock);
  }finally{setBusy(false);}
 }
 return <form className="detail-schedule" onSubmit={e=>void submit(e)}>
  <strong>{isEvent?'Когда состоится встреча':'Срок договорённости'}</strong>
  <div className="detail-schedule-inputs">
   <label>Дата<input type="date" value={date} onChange={e=>{setDate(e.target.value);setSaved(false);}} disabled={busy}/></label>
   <label>Время (если известно)<input type="time" value={time} onChange={e=>{setTime(e.target.value);setSaved(false);}} disabled={busy||!date}/></label>
  </div>
  <div className="detail-schedule-actions">
   <button type="submit" disabled={busy}>{busy?'Сохраняю…':'Сохранить дату'}</button>
   <button type="button" onClick={()=>void save('','')} disabled={busy}>Убрать</button>
  </div>
  {saved&&<small role="status">✓ {date?'Дата сохранена':'Дата убрана'}</small>}
  {error&&<small role="alert" className="spaces-form-error">{error}</small>}
 </form>;
}
