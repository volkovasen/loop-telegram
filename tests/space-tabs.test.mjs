import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('Telegram folder rail includes All, active tab and correct blue count badges',{timeout:25000},async t=>{
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 t.after(async()=>vite.close());
 const {SpaceTabs}=await vite.ssrLoadModule('/src/space-tabs.tsx');
 const spaces=[
  {id:'custom-travel',name:'Путешествия',description:'Trips',isDefault:false},
  {id:'default-work',name:'Работа',description:'Work',isDefault:true},
  {id:'default-home',name:'Дом',description:'Home',isDefault:true},
  {id:'default-personal',name:'Личное',description:'Personal',isDefault:true}
 ];
 const loops=[
  {id:'a',space:'Личное'},{id:'b',space:'Личное'},
  {id:'c',space:'Работа'}
 ];
 const rendered=renderToStaticMarkup(createElement(SpaceTabs,{
  spaces,loops,active:'Личное',onSelect:()=>{}
 }));
 assert.match(rendered,/class="telegram-folders"/);
 assert.match(rendered,/role="tablist"/);
 assert.equal((rendered.match(/role="tab"/g)??[]).length,5);
 assert.deepEqual([...rendered.matchAll(/class="telegram-folder-name">([^<]+)/g)].map(m=>m[1]),[
  'Дом','Личное','Работа','Путешествия'
 ]);
 assert.match(rendered,/role="tab" aria-selected="false" class="">Все<\/button>/);
 assert.match(rendered,/role="tab" aria-selected="true" class="selected"><span class="telegram-folder-name">Личное/);
 assert.match(rendered,/<span class="telegram-folder-count" aria-label="2 активных задач">2<\/span>/);
 assert.match(rendered,/<span class="telegram-folder-count" aria-label="1 активных задач">1<\/span>/);
 assert.ok(!rendered.includes('space-manage-button'));
 const allSelected=renderToStaticMarkup(createElement(SpaceTabs,{
  spaces,loops,active:'Все',onSelect:()=>{}
 }));
 assert.match(allSelected,/role="tab" aria-selected="true" class="selected">Все<\/button>/);
});
