import type { OpenLoop, SpaceDefinition } from './types/open-loop';

/**
 * One scrollable folder rail, matching Telegram's compact folder navigation.
 * The active filter is a real tab, and the badge counts only active records.
 */
export function SpaceTabs({ spaces, active, loops, onSelect }: {
 spaces: SpaceDefinition[];
 active: string;
 loops: OpenLoop[];
 onSelect: (name: string) => void;
}) {
 const defaultOrder = new Map([['default-home',0],['default-personal',1],['default-work',2]]);
 const ordered = [...spaces].sort((a,b)=>
  (defaultOrder.get(a.id)??10)-(defaultOrder.get(b.id)??10)||a.name.localeCompare(b.name,'ru'));
 const counts = new Map(ordered.map(item => [
  item.name, loops.filter(loop => loop.space===item.name).length
 ]));
 return <div className="telegram-folders" role="tablist" aria-label="Папки LOOP">
  <div className="telegram-folders-scroll">
   <button type="button" role="tab" aria-selected={active==='Все'}
    className={active==='Все'?'selected':''}
    onClick={()=>onSelect('Все')}>Все</button>
   {ordered.map(item => {
    const count = counts.get(item.name)??0;
    return <button type="button" role="tab" aria-selected={active===item.name}
     className={active===item.name?'selected':''} key={item.id}
     onClick={()=>onSelect(item.name)}>
     <span className="telegram-folder-name">{item.name}</span>
     {count>0&&<span className="telegram-folder-count" aria-label={`${count} активных задач`}>
      {count>99?'99+':count}
     </span>}
    </button>;
   })}
  </div>
 </div>;
}
