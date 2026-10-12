import { ArrowUpRight, CalendarDays, Clock3 } from 'lucide-react';
import type { OpenLoop } from './types/open-loop';
import { commitmentBadge, timeLabel } from './schedule-ui';

function displayDate(loop: OpenLoop): string | null {
 const raw = timeLabel(loop);
 if (!raw) return null;
 if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? raw :
   new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'short', timeZone:'UTC' }).format(parsed);
 }
 return raw;
}

function uniquePeople(loop: OpenLoop): string[] {
 return [...new Set([loop.person?.name,...(loop.participants??[]).map(p=>p.name)].filter((v):v is string=>Boolean(v)))];
}

export function LoopCard({ loop, onOpen }: { loop:OpenLoop; onOpen:()=>void }) {
 const badge = commitmentBadge(loop);
 const kind = loop.kind==='plan'
  ? loop.agreementStatus==='confirmed' ? 'Встреча согласована' : 'Нужно договориться'
  : loop.type==='waiting' ? 'Ждём ответа'
  : loop.type==='reply' ? 'Нужно ответить'
  : loop.type==='event' ? 'Событие'
  : 'Нужно сделать';
 const people = uniquePeople(loop);
 const when = displayDate(loop);
 const isMeeting = loop.kind==='plan'||loop.type==='event';
 return <article className={`loop-task-card${badge ? ' loop-task-card--late' : ''}`}>
  <button type="button" className="loop-task-open" onClick={onOpen} aria-label={`Открыть задачу «${loop.title}» и прочитать сообщение`}>
   <div className="loop-task-top">
    <div className="loop-task-tags">
     <span className={`loop-task-pill ${badge ? 'loop-task-pill--late' : 'loop-task-pill--type'}`}>
      {badge ?? kind}
     </span>
     {loop.space&&<span className="loop-task-pill loop-task-pill--space">{loop.space}</span>}
    </div>
    <span className="loop-task-dots" aria-hidden="true">···</span>
   </div>
   <h2>{loop.title}</h2>
   <div className="loop-task-context">
    {people.length>0&&<div className="loop-task-person-row">
     <span className="loop-task-avatars" aria-hidden="true">
      {people.slice(0,3).map((name,index)=><span className="loop-task-avatar" key={name} data-slot={index}>{name[0]?.toLocaleUpperCase('ru-RU')}</span>)}
     </span>
     <span className="loop-task-person-names">{people.slice(0,2).join(', ')}{people.length>2?` +${people.length-2}`:''}</span>
    </div>}
    {when&&<span className="loop-task-when">
      {isMeeting?<CalendarDays size={14}/>:<Clock3 size={14}/>}
      {when}
    </span>}
    {!people.length&&!when&&<span className="loop-task-when">Из Telegram</span>}
   </div>
   <span className="loop-task-cta">
    <span>{isMeeting ? 'Посмотреть детали' : 'Открыть задачу'}</span>
    <span className="loop-task-arrow"><ArrowUpRight size={23} strokeWidth={1.9}/></span>
   </span>
  </button>
 </article>;
}
