import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Custom Space strip matches supplied light mockup and keeps attention counts', {timeout:25000}, async t=>{
 const vite = await createServer({ server:{middlewareMode:true}, appType:'custom', logLevel:'silent' });
 t.after(async()=>vite.close());
 const { SpaceTabs } = await vite.ssrLoadModule('/src/space-tabs.tsx');
 const spaces = [
  {id:'custom-travel',name:'Путешествия',description:'Поездки',isDefault:false},
  {id:'default-work',name:'Работа',description:'Рабочие задачи',isDefault:true},
  {id:'default-home',name:'Дом',description:'Домашние дела',isDefault:true},
  {id:'default-personal',name:'Личное',description:'Личные дела',isDefault:true}
 ];
 const activeLoops = [
  {id:'a',space:'Личное',status:'open'}, {id:'b',space:'Личное',status:'suggested'},
  {id:'c',space:'Работа',status:'open'}
 ];
 const html = renderToStaticMarkup(createElement(SpaceTabs, {
  spaces,active:'Дом',loops:activeLoops,onSelect:()=>{},onManage:()=>{}
 }));
 assert.match(html,/class="space-strip" aria-label="Папки LOOP"/);
 assert.match(html,/class="space-strip__manage"/);
 assert.match(html,/aria-label="Создать или изменить тему"/);
 assert.match(html,/lucide-plus/);
 assert.ok(!html.includes('lucide-folder-plus'), 'Only the compact plus is shown');
 assert.match(html,/class="space-strip__scroller" role="tablist"/);
 assert.equal((html.match(/role="tab"/g)??[]).length,4,'No extra All tab in the mockup');
 assert.deepEqual([...html.matchAll(/class="space-strip__name">([^<]+)/g)].map(m=>m[1]),[
  'Дом','Личное','Работа','Путешествия'
 ]);
 assert.match(html,/aria-selected="true"[^>]*class="space-strip__tab space-strip__tab--active"/);
 assert.match(html,/<span class="space-strip__count" aria-label="2 открытых задач">2<\/span>/);
 assert.match(html,/<span class="space-strip__count" aria-label="1 открытых задач">1<\/span>/);
 assert.ok(!html.includes('telegram-folders'));
 assert.ok(!html.includes('>Все<'));
 const css = await readFile(new URL('../src/design.css',import.meta.url),'utf8');
 assert.match(css,/\.space-strip\{[^}]*height:42px[^}]*border:1px solid #e5ebf7/);
 assert.match(css,/\.space-strip__manage\{[^}]*width:32px;height:32px/);
 assert.match(css,/\.space-strip__tab\{[^}]*height:32px;min-height:32px/);
 assert.match(css,/\.space-strip__tab--active\{background:#e9edf7\}/);
 assert.match(css,/\.space-strip__name\{text-transform:lowercase/);
 assert.match(css,/\.space-strip__count\{[^}]*min-width:21px;height:21px[^}]*background:#e9edf7/);
 assert.match(css,/\.space-strip__count\{[^}]*place-items:center/);
});
