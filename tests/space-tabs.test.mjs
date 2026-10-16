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
 assert.match(html,/data-edge-fade="none"/);
 assert.match(html,/role="tab" aria-selected="false" class="space-strip__tab"><span class="space-strip__name">Все<\/span><\/button>/);
 assert.equal((html.match(/role="tab"/g)??[]).length,5,'All plus existing four Spaces');
 assert.deepEqual([...html.matchAll(/class="space-strip__name">([^<]+)/g)].map(m=>m[1]),[
  'Все','Дом','Личное','Работа','Путешествия'
 ]);
 assert.match(html,/aria-selected="true"[^>]*class="space-strip__tab space-strip__tab--active"/);
 assert.match(html,/<span class="space-strip__count" aria-label="2 открытых задач">2<\/span>/);
 assert.match(html,/<span class="space-strip__count" aria-label="1 открытых задач">1<\/span>/);
 assert.ok(!html.includes('telegram-folders'));
 const allSelected=renderToStaticMarkup(createElement(SpaceTabs,{
  spaces,active:'Все',loops:activeLoops,onSelect:()=>{},onManage:()=>{}
 }));
 assert.match(allSelected,/role="tab" aria-selected="true" class="space-strip__tab space-strip__tab--active"><span class="space-strip__name">Все<\/span><\/button>/);
 assert.ok(!allSelected.includes('Сбросить фильтр «Все»'));
 const css = await readFile(new URL('../src/design.css',import.meta.url),'utf8');
 assert.match(css,/\.space-strip\{[^}]*height:42px[^}]*border:1px solid #e5ebf7/);
 assert.match(css,/\.space-strip__manage\{[^}]*width:32px;height:32px/);
 assert.match(css,/\.space-strip__tab\{[^}]*height:30px;min-height:30px;padding:6px 12px/);
 assert.match(css,/\.space-strip__scroller\{[^}]*gap:5px/);
 assert.match(css,/\.space-strip__tab--active\{background:#e9edf7\}/);
 assert.match(css,/\.space-strip__name\{text-transform:lowercase/);
 assert.match(css,/\.space-strip__count\{[^}]*min-width:18px;height:18px[^}]*background:#e9edf7/);
 assert.match(css,/\.space-strip__count\{[^}]*align-items:center;justify-content:center/);
 assert.match(css,/\.space-strip__tab\{[^}]*font-size:13px/);
 assert.match(css,/font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text"/);
 assert.match(css,/\.space-strip__count\{[^}]*line-height:18px/);
 assert.match(css,/@media\(max-width:380px\)\{[^}]*\}/);
 assert.match(css,/\.space-strip__scroller\[data-edge-fade="right"\]/);
 assert.match(css,/\.space-strip__scroller\[data-edge-fade="left"\]/);
 assert.match(css,/\.space-strip__scroller\[data-edge-fade="both"\]/);
 assert.match(css,/mask-image:linear-gradient/);
});
