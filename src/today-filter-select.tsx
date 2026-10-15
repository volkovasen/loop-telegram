import { CalendarCheck2 } from 'lucide-react';
import type { TodayStatusFilter } from './today-filters';

export function TodayFilterSelect({ value, onChange }: {
 value: TodayStatusFilter;
 onChange: (value: TodayStatusFilter) => void;
}) {
 return <label className="today-filter-pill">
  <span className="sr-only">Показывать задачи</span>
  <select value={value} onChange={event=>onChange(event.target.value as TodayStatusFilter)}>
   <option value="active">Активные</option>
   <option value="overdue">Просроченные</option>
   <option value="done">Выполненные</option>
  </select>
  <CalendarCheck2 size={17} strokeWidth={1.9} aria-hidden="true"/>
 </label>;
}
