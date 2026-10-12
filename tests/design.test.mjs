import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Today and unassigned cards never expose full forwarded message before opening details', {timeout:25000}, async t=>{
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 t.after(async()=>vite.close());
 const {LoopCard}=await vite.ssrLoadModule('/src/loop-card.tsx');
 const {UnassignedCard}=await vite.ssrLoadModule('/src/spaces-ui.tsx');
 const secret='ЛИЧНЫЙ_ТЕКСТ_ИЗ_ПЕРЕПИСКИ_НЕ_ДОЛЖЕН_ПОЯВЛЯТЬСЯ_НА_КАРТОЧКЕ';
 const task={
  id:'test-task',type:'todo',kind:'request',status:'open',title:'Отправить документы',
  person:{name:'Кирилл'},space:'Работа',deadlineDate:'2026-10-11',confidence:1,
  source:{messageId:42,receivedAt:'2026-10-12T10:00:00Z',text:secret},
  createdAt:'2026-10-12T10:00:00Z'
 };
 const assignedHtml=renderToStaticMarkup(createElement(LoopCard,{loop:task,onOpen:()=>{}}));
 assert.match(assignedHtml,/Отправить документы/);
 assert.match(assignedHtml,/Кирилл/);
 assert.match(assignedHtml,/Открыть задачу/);
 assert.match(assignedHtml,/Просрочено/);
 assert.match(assignedHtml,/aria-label="Открыть задачу/);
 assert.doesNotMatch(assignedHtml,/ЛИЧНЫЙ_ТЕКСТ_ИЗ_ПЕРЕПИСКИ/);
 const unassignedHtml=renderToStaticMarkup(createElement(UnassignedCard,{
  loop:{...task,space:null},spaces:[{id:'work',name:'Работа',description:'Рабочие дела',isDefault:true}],
  onAssign:()=>{},onOpen:()=>{}
 }));
 assert.match(unassignedHtml,/Отправить документы/);
 assert.match(unassignedHtml,/Прочитать сообщение/);
 assert.doesNotMatch(unassignedHtml,/ЛИЧНЫЙ_ТЕКСТ_ИЗ_ПЕРЕПИСКИ/);
});

test('full forwarded message remains in task details, not in the Memory list',async()=>{
 const source=await fs.readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 const memory=source.slice(source.indexOf('function MemoryView('),source.indexOf('function LoopDetail('));
 const details=source.slice(source.indexOf('function LoopDetail('));
 assert.ok(memory.startsWith('function MemoryView'));
 assert.ok(details.startsWith('function LoopDetail'));
 assert.ok(!memory.includes('loop.source.text'));
 assert.match(details,/loop.source.text/);
 assert.match(details,/source-block/);
});
