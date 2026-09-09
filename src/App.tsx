import { useMemo, useState } from 'react';
import { Check, Clock3, MessageCircle, MoreHorizontal } from 'lucide-react';
import { demoLoops } from './data/demo';
import type { OpenLoop } from './types/open-loop';

const meta = {
  reply: { icon:'↩', label:'Ждёт ответа' }, todo:{ icon:'✓', label:'Ты обещала' }, waiting:{ icon:'←', label:'Ждёшь' }, event:{ icon:'◷', label:'Событие' }, saved:{ icon:'◇', label:'Сохранено' }
};

export function App(){
  const [loops,setLoops]=useState(demoLoops);
  const open=useMemo(()=>loops.filter(x=>x.status==='open'),[loops]);
  const done=(id:string)=>setLoops(xs=>xs.map(x=>x.id===id?{...x,status:'done' as const,completedAt:new Date().toISOString()}:x));
  return <main className="shell">
    <header><div className="eyebrow">LOOP</div><h1>Сегодня</h1><p>{open.length ? `${open.length} вещи требуют внимания` : 'Хвостов нет. Красиво.'}</p></header>
    <section className="stack">{open.map(loop=><LoopCard key={loop.id} loop={loop} onDone={()=>done(loop.id)}/>)}</section>
    {!open.length && <div className="empty"><Check size={26}/><strong>Всё закрыто</strong><span>Telegram сегодня тебя не победил.</span></div>}
    <nav><button className="active"><Clock3/>Сегодня</button><button><MessageCircle/>Люди</button><button><MoreHorizontal/>Ещё</button></nav>
  </main>
}

function LoopCard({loop,onDone}:{loop:OpenLoop;onDone:()=>void}){
 const m=meta[loop.type];
 return <article className={`card ${loop.type}`}>
   <div className="row"><span className="badge"><b>{m.icon}</b>{m.label}</span><span className="confidence">{Math.round(loop.confidence*100)}%</span></div>
   <h2>{loop.title}</h2>
   {loop.person && <div className="person">{loop.person.name}</div>}
   {loop.source.text && <blockquote>“{loop.source.text}”</blockquote>}
   <div className="actions"><button className="primary" onClick={onDone}>{loop.type==='waiting'?'Получено':'Готово'}</button><button className="ghost">Позже</button></div>
 </article>
}
