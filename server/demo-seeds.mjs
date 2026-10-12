// Two explicit test fixtures for the user's own Telegram account.
// They are not forwarded messages and must never be mistaken for actual promises.
function localCalendarDay(instant, timeZone) {
 const parts = new Intl.DateTimeFormat('en-US', {
  timeZone, year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(instant);
 const value = key => parts.find(item=>item.type===key)?.value;
 return [value('year'),value('month'),value('day')].join('-');
}

export const DEMO_TAGS = ['loop-demo-meeting-v1','loop-demo-deadline-v1'];

export const DEMO_SOURCE_TEXTS = [
 '[ТЕСТОВОЕ СООБЩЕНИЕ] Давай в субботу встретимся втроём с Кириллом, посмотрим фильм. Время пока не согласовали.',
 '[ТЕСТОВОЕ СООБЩЕНИЕ] Пришли документы. Срок уже прошёл, проверь отметку «Просрочено».'
];

export function makeDemoLoops(ownerId,{now=new Date(),timeZone='UTC'}={}) {
 if(!/^\d{4,20}$/.test(String(ownerId)))throw new Error('A Telegram owner ID is required');
 const timestamp=new Date(now);
 if(Number.isNaN(timestamp.getTime()))throw new Error('Invalid current time');
 // The previous local calendar day is unambiguously overdue without
 // inventing a specific clock time or sending a reminder.
 const yesterday=localCalendarDay(new Date(timestamp.getTime()-86400000),timeZone);
 const receivedAt=timestamp.toISOString();
 const common={
  ownerId:String(ownerId),status:'open',confidence:1,
  createdAt:receivedAt
 };
 return [
  {
   ...common,
   id:crypto.randomUUID(),
   seedTag:DEMO_TAGS[0],
   type:'reply',
   kind:'plan',
   agreementStatus:'proposed',
   nextAction:'coordinate',
   nextActionText:'Ответить Арине и согласовать время встречи',
   title:'ТЕСТ · Договориться о встрече',
   person:{name:'Тестовая Арина'},
   participants:[{name:'Тестовый Кирилл'}],
   whenText:'в субботу',
   space:'Личное',
   spaceConfidence:1,
   source:{
    messageId:-91000001,
    receivedAt,
    authorName:'Тестовая Арина',
    text:DEMO_SOURCE_TEXTS[0]
   }
  },
  {
   ...common,
   id:crypto.randomUUID(),
   seedTag:DEMO_TAGS[1],
   type:'todo',
   kind:'request',
   agreementStatus:'not_applicable',
   nextAction:'do',
   nextActionText:'Отправить документы',
   title:'ТЕСТ · Отправить документы',
   person:{name:'Тестовая Саша'},
   deadlineDate:yesterday,
   space:'Работа',
   spaceConfidence:1,
   source:{
    messageId:-91000002,
    receivedAt,
    authorName:'Тестовая Саша',
    text:DEMO_SOURCE_TEXTS[1]
   }
  }
 ];
}
