import { ChevronDown } from 'lucide-react';
import type { TodayStatusFilter } from './today-filters';

export function TodayFilterSelect({ value, onChange }: {
 value: TodayStatusFilter;
 onChange: (value: TodayStatusFilter) => void;
}) {
 return <label className="today-filter-pill">
  <span className="sr-only">Показывать задачи</span>
  <select value={value} onChange={event=>onChange(event.target.value as TodayStatusFilter)}>
   <option value="active">активные</option>
   <option value="overdue">просроченные</option>
   <option value="done">выполненные</option>
  </select>
  <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true"/>
 </label>;
}
