import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSignals, normalizeAIItems, normalizeMeaning } from '../server/meaning.mjs';
import { classifyMessage } from '../server/classifier.mjs';

const when = '2026-10-11T10:00:00+05:00';
const makeInput = (text, author='Саша') => ({text, author, messageId:1, chatId:2, receivedAt:when, spaces:[]});

test('movie invitation is one pending agreement, not memory or confirmed event', () => {
 const input = makeInput('Давай в субботу встретимся, посмотрим фильм или сериал', 'Арина');
 const incorrectAI = [
  {type:'saved',title:'Посмотреть фильм',confidence:0.92,memoryCategory:'Фильмы'},
  {type:'event',title:'Просмотр фильма с Ариной',confidence:0.96,dueAt:'2026-10-17T12:00:00+05:00'}
 ];
 const result = normalizeAIItems(incorrectAI, input);
 assert.equal(result.length, 1);
 assert.equal(result[0].type,'reply');
 assert.equal(result[0].kind,'plan');
 assert.equal(result[0].agreementStatus,'proposed');
 assert.equal(result[0].nextAction,'coordinate');
 assert.match(result[0].title,/Договориться о встрече в субботу/i);
 assert.equal(result[0].whenText,'в субботу');
 assert.equal(result[0].dueAt,undefined);
 assert.match(result[0].nextActionText,/согласовать детали встречи/);
 const fallback=classifyMessage(input);
 assert.equal(fallback.type,'reply');
 assert.equal(fallback.agreementStatus,'proposed');
 assert.equal(fallback.dueAt,undefined);
});

test('Sasha offers to bring an unspecified thing tomorrow, one agreement without hallucinated station', () => {
 const input=makeInput('Ксюш, сегодня у мамы день рождения, неудобно встретиться сегодня, давай мы тебе завтра его привезём', 'Саша');
 const result=normalizeAIItems([
  {type:'event',title:'Встретиться с Сашей на вокзале сегодня',confidence:0.99,dueAt:'2026-10-11T12:00:00+05:00'},
  {type:'waiting',title:'Ждать посылку с вокзала',confidence:0.8}
 ], input);
 assert.equal(result.length,1);
 assert.equal(result[0].type,'reply');
 assert.equal(result[0].agreementStatus,'proposed');
 assert.equal(result[0].kind,'plan');
 assert.equal(result[0].whenText,'завтра');
 assert.equal(result[0].nextAction,'coordinate');
 assert.equal(result[0].title,'Согласовать передачу вещи');
 assert.equal(result[0].dueAt,undefined);
 assert.doesNotMatch(result[0].title+result[0].nextActionText,/вокзал|сегодня|посылку/i);
 const fallback=classifyMessage(input);
 assert.equal(fallback.type,'reply');
 assert.equal(fallback.agreementStatus,'proposed');
 assert.equal(fallback.whenText,'завтра');
});

test('a plain movie recommendation remains memory, never a meeting', () => {
 const input=makeInput('Посмотри сериал Тьма, советую');
 assert.equal(detectSignals(input.text).proposal,false);
 const normalized=normalizeAIItems([{type:'saved',title:'Сериал Тьма',kind:'recommendation',confidence:0.94}],input);
 assert.equal(normalized.length,1);
 assert.equal(normalized[0].type,'saved');
 assert.equal(normalized[0].nextAction,'none');
 assert.equal(normalized[0].kind,'recommendation');
 const fallback=classifyMessage(input);
 assert.equal(fallback.type,'saved');
});

test('confirmed event is distinct from a tentative invitation', () => {
 const input=makeInput('Договорились, встречаемся в субботу в 19:00');
 const result=normalizeAIItems([{type:'event',title:'Встреча в субботу',agreementStatus:'confirmed',kind:'plan',dueAt:'2026-10-17T19:00:00+05:00'}],input);
 assert.equal(result.length,1);
 assert.equal(result[0].type,'event');
 assert.equal(result[0].agreementStatus,'confirmed');
 assert.equal(result[0].nextAction,'none');
 assert.equal(result[0].dueAt,'2026-10-17T19:00:00+05:00');
});

test('uncertain event does not get a fake noon reminder', () => {
 const input=makeInput('Собрание завтра в девять');
 const result=normalizeAIItems([{type:'event',title:'Собрание завтра',kind:'plan',dueAt:'2026-10-12T12:00:00+05:00'}],input);
 assert.equal(result[0].agreementStatus,'unknown');
 assert.equal(result[0].dueAt,undefined);
});

test('empty AI proposals are still recoverable from clear evidence', () => {
 const input=makeInput('Так ты предложила встретиться и посмотреть что-нибудь в субботу','Арина');
 const result=normalizeAIItems([],input);
 assert.equal(result.length,1);
 assert.equal(result[0].type,'reply');
 assert.equal(result[0].kind,'plan');
 assert.equal(result[0].agreementStatus,'proposed');
 assert.match(result[0].title,/в субботу/);
});

test('fallback ignores small talk and sender monologues instead of saving random messages', () => {
 assert.equal(classifyMessage(makeInput('го')),null);
 assert.equal(classifyMessage(makeInput('хорошо')),null);
 assert.equal(classifyMessage(makeInput('я записалась на фотосессию и завтра одежду примерять')),null);
 assert.equal(classifyMessage(makeInput('давай в субботу встретимся','Я')),null);
});

test('previous routing regression: explicit game invitation is still a card', () => {
 const input=makeInput('Завтра игра в девять, приходи!', 'Саша');
 const got=classifyMessage(input);
 assert.ok(got);
 assert.equal(got.kind,'plan');
 assert.equal(got.nextAction,'coordinate');
});

test('unknown titles are never filled with made-up stations or locations', () => {
 const input=makeInput('Давай завтра тебе его привезём');
 const got=normalizeMeaning({type:'event',title:'На вокзале в 15:00'},input);
 assert.equal(got.title,'Согласовать передачу вещи');
 assert.equal(got.whenText,'завтра');
 assert.equal(got.dueAt,undefined);
});

test('full Groq adapter repairs a mistaken saved label without touching Spaces', async (t) => {
 const previousKey = process.env.GROQ_API_KEY;
 const previousFetch = globalThis.fetch;
 process.env.GROQ_API_KEY = 'test-no-network-token';
 const captured = [];
 globalThis.fetch = async (_url, options) => {
  captured.push(JSON.parse(options.body));
  return {
   ok: true,
   json: async () => ({
    choices: [{ message: { content: JSON.stringify({ loops: [
     { type:'saved',kind:'recommendation',title:'Сохранить фильм',confidence:0.93,space:'Личное',spaceConfidence:0.95,memoryCategory:'Фильмы',dueAt:'2026-10-17T12:00:00+05:00' },
     { type:'event',title:'Встреча на фильм',confidence:0.89,space:'Личное',spaceConfidence:0.95 }
    ]}) }}]
   })
  };
 };
 t.after(() => {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = previousKey;
 });
 const {classifyWithAI} = await import(`../server/ai-classifier.mjs?meaning_test=${Date.now()}`);
 const {DEFAULT_SPACES} = await import('../server/space-rules.mjs');
 const input = {...makeInput('Давай в субботу встретимся и посмотрим фильм','Арина'), spaces:DEFAULT_SPACES};
 const got = await classifyWithAI(input);
 assert.equal(captured.length, 1);
 assert.equal(got.length, 1);
 assert.equal(got[0].type, 'reply');
 assert.equal(got[0].kind,'plan');
 assert.equal(got[0].agreementStatus,'proposed');
 assert.equal(got[0].nextAction,'coordinate');
 assert.equal(got[0].whenText,'в субботу');
 assert.equal(got[0].dueAt,undefined);
 assert.equal(got[0].space,'Личное');
 assert.equal(got[0].memoryCategory,undefined);
});
