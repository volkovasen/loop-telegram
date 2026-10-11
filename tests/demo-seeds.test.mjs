import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoLoops, DEMO_TAGS } from '../server/demo-seeds.mjs';
import { temporalStatus } from '../server/temporal.mjs';

test('Telegram /demo generates exactly two private, clearly labeled local examples', () => {
 const now=new Date('2026-10-12T03:46:00+05:00');
 const items=makeDemoLoops('123456789',{now,timeZone:'Asia/Yekaterinburg'});
 assert.equal(items.length,2);
 assert.deepEqual(items.map(item=>item.seedTag),DEMO_TAGS);
 assert.ok(items.every(item=>item.ownerId==='123456789'));
 assert.ok(items.every(item=>item.title.startsWith('ТЕСТ · ')));
 assert.ok(items.every(item=>item.source.text.includes('ТЕСТОВОЕ СООБЩЕНИЕ')));
 assert.ok(items.every(item=>item.status==='open'));
 assert.ok(items.every(item=>item.source.messageId<0));
 assert.notEqual(items[0].id,items[1].id);
 assert.equal(items[0].type,'reply');
 assert.equal(items[0].kind,'plan');
 assert.equal(items[0].agreementStatus,'proposed');
 assert.equal(items[0].nextAction,'coordinate');
 assert.equal(items[0].participants[0].name,'Тестовый Кирилл');
 assert.equal(items[0].deadlineDate,undefined);
 assert.equal(items[1].type,'todo');
 assert.equal(items[1].deadlineDate,'2026-10-11');
 assert.equal(items[1].nextAction,'do');
 assert.equal(temporalStatus(items[0],now.getTime(),'Asia/Yekaterinburg'),null);
 assert.equal(temporalStatus(items[1],now.getTime(),'Asia/Yekaterinburg'),'overdue');
});

test('/demo never accepts an unknown owner identity', () => {
 assert.throws(()=>makeDemoLoops('local-dev'),/Telegram owner ID/);
 assert.throws(()=>makeDemoLoops(''),/Telegram owner ID/);
 assert.throws(()=>makeDemoLoops('not-a-number'),/Telegram owner ID/);
});
