import { Plus } from 'lucide-react';
import type { OpenLoop, SpaceDefinition } from './types/open-loop';

/**
 * LOOP folder strip: a compact, horizontally scrollable rail matching
 * the product's custom light mockup, not a copy of Telegram's dark theme.
 * Counts represent active items that still require attention.
 */
export function SpaceTabs({ spaces, active, loops, onSelect, onManage }: {
 spaces: SpaceDefinition[];
 active: string;
 loops: OpenLoop[];
 onSelect: (name: string) => void;
 onManage: () => void;
}) {
 const defaultOrder = new Map([['default-home', 0], ['default-personal', 1], ['default-work', 2]]);
 const ordered = [...spaces].sort((a, b) =>
  (defaultOrder.get(a.id) ?? 10) - (defaultOrder.get(b.id) ?? 10) || a.name.localeCompare(b.name, 'ru'));
 const counts = new Map(ordered.map(item => [
  item.name, loops.filter(loop => loop.space === item.name).length
 ]));

 return <div className="space-strip" aria-label="Папки LOOP">
  <button type="button" className="space-strip__manage" onClick={onManage}
   aria-label="Создать или изменить тему" title="Создать или изменить тему">
   <Plus size={18} strokeWidth={2.1} aria-hidden="true"/>
  </button>
  <div className="space-strip__scroller" role="tablist" aria-label="Фильтр по темам">
   <button type="button" role="tab" aria-selected={active === 'Все'}
    className={`space-strip__tab${active === 'Все' ? ' space-strip__tab--active' : ''}`}
    onClick={() => onSelect('Все')}>
    <span className="space-strip__name">Все</span>
   </button>
   {ordered.map(item => {
    const count = counts.get(item.name) ?? 0;
    const selected = active === item.name;
    return <button type="button" role="tab" aria-selected={selected} key={item.id}
     className={`space-strip__tab${selected ? ' space-strip__tab--active' : ''}`}
     aria-label={selected ? `Сбросить фильтр «${item.name}»` : `Показать тему «${item.name}»`}
     onClick={() => onSelect(selected ? 'Все' : item.name)}>
     <span className="space-strip__name">{item.name}</span>
     {count > 0 && <span className="space-strip__count" aria-label={`${count} открытых задач`}>
      {count > 99 ? '99+' : count}
     </span>}
    </button>;
   })}
  </div>
 </div>;
}
