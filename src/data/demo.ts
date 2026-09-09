import type { OpenLoop } from '../types/open-loop';

export const demoLoops: OpenLoop[] = [
  { id:'1', type:'reply', status:'open', title:'Ответить насчёт пятницы', person:{name:'Маша'}, confidence:.96, source:{messageId:1,text:'Ну что насчёт пятницы?',receivedAt:new Date().toISOString(),authorName:'Маша'}, createdAt:new Date().toISOString() },
  { id:'2', type:'waiting', status:'open', title:'Получить договор', person:{name:'Дима'}, dueAt:new Date().toISOString(), confidence:.94, source:{messageId:2,text:'Договор завтра тебе закину',receivedAt:new Date().toISOString(),authorName:'Дима'}, createdAt:new Date().toISOString() },
  { id:'3', type:'todo', status:'open', title:'Отправить макеты Антону', person:{name:'Антон'}, confidence:.91, source:{messageId:3,text:'Да, вечером отправлю макеты',receivedAt:new Date().toISOString(),authorName:'Ты'}, createdAt:new Date().toISOString() }
];
