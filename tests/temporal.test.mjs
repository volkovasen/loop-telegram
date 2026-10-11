import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate,validInstant, temporalStatus,snoozeDue,reminderAt, acceptedSchedule } from '../server/temporal.mjs';

const now='2026-10-12T02:43:00+05:00';
const task={type:'todo',kind:'request',status:'open',nextAction:'do'};
const promise={type:'waiting',kind:'promise',status:'open',nextAction:'wait'};
const plan={type:'reply',kind:'plan',agreementStatus:'proposed',nextAction:'coordinate',status:'open'};
const event={type:'event',kind:'plan',agreementStatus:'confirmed',status:'open'};

test('date-only deadlines expire after the local day, not at invented noon',()=>{
 assert.equal(validDate('2026-10-11'),true);
 assert.equal(validDate('2026-02-30'),false);
 assert.equal(temporalStatus({...task,deadlineDate:'2026-10-11'},now,'Asia/Yekaterinburg'),'overdue');
 assert.equal(temporalStatus({...task,deadlineDate:'2026-10-12'},now,'Asia/Yekaterinburg'),null);
 assert.equal(temporalStatus({...task,deadlineDate:'2026-10-12'},'2026-10-13T00:01:00+05:00','Asia/Yekaterinburg'),'overdue');
 assert.equal(temporalStatus({...promise,deadlineDate:'2026-10-11'},now,'Asia/Yekaterinburg'),'overdue');
 assert.equal(temporalStatus({...task,deadlineDate:'2026-10-11',status:'done'},now,'Asia/Yekaterinburg'),null);
});

test('expired meeting is NOT overdue and proposed meeting never gets a deadline',()=>{
 assert.equal(temporalStatus({...event,eventDate:'2026-10-11'},now,'Asia/Yekaterinburg'),'past_event');
 assert.equal(temporalStatus({...event,eventDate:'2026-10-12'},now,'Asia/Yekaterinburg'),null);
 assert.equal(temporalStatus({...plan,deadlineDate:'2026-10-11'},now,'Asia/Yekaterinburg'),null);
 assert.equal(reminderAt({...plan,eventAt:'2026-10-11T10:00:00+05:00'}),null);
 assert.equal(reminderAt({...event,eventAt:'2026-10-11T10:00:00+05:00'}),'2026-10-11T10:00:00+05:00');
});

test('snoozing does not change original time or trigger premature reminder',()=>{
 const snoozed={...task,status:'snoozed',deadlineAt:'2026-10-11T10:00:00+05:00',snoozedUntil:'2026-10-13T09:00:00+05:00'};
 assert.equal(snoozeDue(snoozed,Date.parse(now)),false);
 assert.equal(reminderAt(snoozed),'2026-10-13T09:00:00+05:00');
 assert.equal(snoozeDue(snoozed,Date.parse('2026-10-13T10:00:00+05:00')),true);
 assert.equal(temporalStatus(snoozed,now,'Asia/Yekaterinburg'),'overdue');
});

test('model schedule fields require date evidence and correct agreement state',()=>{
 assert.deepEqual(acceptedSchedule({deadlineDate:'2026-10-16'},task,'Отправь документы до пятницы'),{deadlineDate:'2026-10-16'});
 assert.deepEqual(acceptedSchedule({deadlineDate:'2026-10-16'},task,'Пришли документы'),{});
 assert.deepEqual(acceptedSchedule({deadlineDate:'2026-10-16',eventDate:'2026-10-16'},plan,'Давай встретимся в пятницу'),{});
 assert.deepEqual(acceptedSchedule({deadlineDate:'2026-10-16',eventDate:'2026-10-16'},event,'Договорились, встречаемся в пятницу'),{eventDate:'2026-10-16'});
 assert.equal(validInstant('2026-10-16T19:00:00+05:00'),true);
 assert.equal(validInstant('2026-10-16'),false);
});

test('legacy dueAt is not safe evidence of a missed obligation',()=>{
 assert.equal(temporalStatus({...task,dueAt:'2026-10-11T10:00:00+05:00'},now,'Asia/Yekaterinburg'),null);
 assert.equal(temporalStatus({...task,status:'snoozed',dueAt:'2026-10-11T10:00:00+05:00'},now,'Asia/Yekaterinburg'),null);
});

test('date-only model output cannot sneak in a fabricated clock time',()=>{
 const item={deadlineDate:'2026-10-16',deadlineAt:'2026-10-16T12:00:00+05:00'};
 assert.deepEqual(acceptedSchedule(item,task,'Отправь документы до пятницы'),{deadlineDate:'2026-10-16'});
 assert.deepEqual(acceptedSchedule(item,task,'Отправь документы в пятницу к 18:00'),item);
 const meeting={eventDate:'2026-10-17',eventAt:'2026-10-17T12:00:00+05:00'};
 assert.deepEqual(acceptedSchedule(meeting,event,'Встречаемся в субботу'),{eventDate:'2026-10-17'});
 assert.deepEqual(acceptedSchedule(meeting,event,'Встречаемся в субботу в 12:00'),meeting);
});

test('day-month notation without a clock does not fabricate a timed event',()=>{
 const candidate={eventDate:'2026-12-10',eventAt:'2026-12-10T12:00:00+05:00'};
 assert.deepEqual(acceptedSchedule(candidate,event,'Договорились, встреча 10.12'),{eventDate:'2026-12-10'});
});
