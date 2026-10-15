import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Today filters distinguish active overdue completed, not past meetings', { timeout: 25000 }, async t => {
 const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
 t.after(async () => vite.close());
 const { filterTodayStatus, isOverdueTask } = await vite.ssrLoadModule('/src/today-filters.ts');
 const { TodayFilterSelect } = await vite.ssrLoadModule('/src/today-filter-select.tsx');
 const now = Date.parse('2026-10-16T12:00:00Z');
 function make(id, type, status, extra = {}) {
  return { id, type, status, title:id, confidence:1, space:'Дом',
   kind:'request',source:{messageId:1,receivedAt:'2026-10-15T10:00:00Z'},createdAt:'2026-10-15T10:00:00Z',
   ...extra };
 }
 const overdue = make('overdue','todo','open',{deadlineDate:'2026-10-01'});
 const waiting = make('waiting','waiting','suggested',{deadlineAt:'2026-10-12T10:00:00Z'});
 const upcoming = make('upcoming','todo','open',{deadlineDate:'2026-10-20'});
 const pastEvent = make('past-event','event','open',{kind:'plan',agreementStatus:'confirmed',eventDate:'2026-10-01'});
 const unscheduledPlan = make('proposal','reply','open',{kind:'plan',agreementStatus:'proposed',whenText:'вчера'});
 const completed = make('completed','todo','done',{completedAt:'2026-10-15T12:00:00Z'});
 const merged = make('merged','todo','done',{mergedInto:'another'});
 const saved = make('saved','saved','done');
 const allActive=[overdue,waiting,upcoming,pastEvent,unscheduledPlan];
 assert.deepEqual(filterTodayStatus(allActive,[completed,merged,saved],'active',now).map(x=>x.id),
  ['overdue','waiting','upcoming','past-event','proposal']);
 assert.deepEqual(filterTodayStatus(allActive,[completed,merged,saved],'overdue',now).map(x=>x.id),
  ['overdue','waiting']);
 assert.deepEqual(filterTodayStatus(allActive,[completed,merged,saved],'done',now).map(x=>x.id),
  ['completed']);
 assert.equal(isOverdueTask(pastEvent,now),false,'A past meeting is not an overdue obligation');
 assert.equal(isOverdueTask(unscheduledPlan,now),false,'A vague proposed meeting is not overdue');
 for(const value of ['active','overdue','done']) {
  const html=renderToStaticMarkup(createElement(TodayFilterSelect,{value,onChange:()=>{}}));
  assert.match(html,/class="today-filter-pill"/);
  assert.match(html,/<select/);
  assert.match(html,/lucide-calendar-check-2/);
  assert.match(html,/<option value="active">Активные<\/option>/);
  assert.match(html,/<option value="overdue">Просроченные<\/option>/);
  assert.match(html,/<option value="done">Выполненные<\/option>/);
  assert.match(html,/value="active"/);
  assert.match(html,/value="overdue"/);
  assert.match(html,/value="done"/);
  assert.match(html,new RegExp('<option value="'+value+'" selected=""'));
 }
});
