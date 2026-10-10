import { useState } from 'react';
import type { OpenLoop } from './types/open-loop';

type MeaningChoice = 'meeting-proposal' | 'meeting-confirmed' | 'todo' | 'reply' | 'waiting' | 'saved';
const options: {value:MeaningChoice;label:string}[] = [
 {value:'meeting-proposal',label:'Нужно договориться'},
 {value:'meeting-confirmed',label:'Встреча уже согласована'},
 {value:'todo',label:'Нужно сделать'},
 {value:'reply',label:'Нужно ответить'},
 {value:'waiting',label:'Жду другого человека'},
 {value:'saved',label:'Просто сохранить'}
];

function currentChoice(loop:OpenLoop):MeaningChoice {
 if(loop.kind==='plan'&&loop.agreementStatus==='proposed')return 'meeting-proposal';
 if(loop.kind==='plan'&&(loop.agreementStatus==='confirmed'||loop.agreementStatus==='unknown'))return 'meeting-confirmed';
 if(loop.type==='event')return 'meeting-confirmed';
 if(loop.type==='todo'||loop.type==='waiting'||loop.type==='saved')return loop.type;
 return 'reply';
}

export function MeaningEditor({loop,onSave,onCancel}:{
 loop:OpenLoop;
 onSave:(choice:MeaningChoice,title:string)=>Promise<string|null>;
 onCancel:()=>void;
}){
 const [choice,setChoice]=useState<MeaningChoice>(currentChoice(loop));
 const [title,setTitle]=useState(loop.title);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  if(title.trim().length<3){setError('Укажи понятное название');return;}
  setError('');setBusy(true);
  try{
   const result=await onSave(choice,title.trim());
   if(result){setError(result);return;}
   onCancel();
  }catch{setError('Не удалось сохранить, попробуй ещё раз');}
  finally{setBusy(false);}
 }
 return <form className="meaning-editor" onSubmit={e=>void submit(e)}>
  <strong>Как правильно понимать сообщение?</strong>
  <label>Смысл
   <select value={choice} onChange={e=>setChoice(e.target.value as MeaningChoice)}>
    {options.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}
   </select>
  </label>
  <label>Название карточки
   <input value={title} maxLength={110} onChange={e=>setTitle(e.target.value)} placeholder="Например, договориться о встрече в субботу" required/>
  </label>
  <p>Это исправление LOOP учтёт при разборе похожих сообщений.</p>
  {error&&<p role="alert" className="meaning-error">{error}</p>}
  <div className="meaning-editor-actions">
   <button type="button" className="meaning-cancel" onClick={onCancel} disabled={busy}>Отмена</button>
   <button type="submit" className="meaning-save" disabled={busy}>{busy?'Сохраняю…':'Сохранить исправление'}</button>
  </div>
 </form>;
}
