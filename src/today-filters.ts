import { commitmentBadge } from './schedule-ui';
import type { OpenLoop } from './types/open-loop';

export type TodayStatusFilter = 'active' | 'overdue' | 'done';

// A past event is not an overdue obligation. Respect existing deadline semantics.
export function isOverdueTask(loop: OpenLoop, now = Date.now()): boolean {
 const label = commitmentBadge(loop, now);
 return label === 'Просрочено' || label === 'Обещание задерживается';
}

export function filterTodayStatus(
 openLoops: OpenLoop[],
 completedLoops: OpenLoop[],
 filter: TodayStatusFilter,
 now = Date.now()
): OpenLoop[] {
 if (filter === 'done') {
  return completedLoops.filter(loop => loop.status === 'done' && loop.type !== 'saved' && !loop.mergedInto);
 }
 const active = openLoops.filter(loop => loop.type !== 'saved' && !loop.mergedInto);
 return filter === 'overdue' ? active.filter(loop => isOverdueTask(loop, now)) : active;
}
