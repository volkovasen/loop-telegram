import { normalizeExampleText } from './space-rules.mjs';

export const MEANING_CHOICES = new Set(['meeting-proposal', 'meeting-confirmed', 'todo', 'reply', 'waiting', 'saved']);

export function meaningChoiceFor(loop) {
  if (loop.kind === 'plan' && loop.agreementStatus === 'proposed') return 'meeting-proposal';
  if (loop.kind === 'plan' && (loop.agreementStatus === 'confirmed' || loop.type === 'event')) return 'meeting-confirmed';
  return ['todo','reply','waiting','saved'].includes(loop.type) ? loop.type : 'reply';
}

export function meaningPatch(choice, title, loop) {
  if (!MEANING_CHOICES.has(choice)) throw new Error('Неизвестный тип договорённости');
  const name = String(title ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 110) throw new Error('Заголовок должен быть от 3 до 110 символов');
  const states = {
    'meeting-proposal': { type:'reply',kind:'plan',agreementStatus:'proposed',nextAction:'coordinate',nextActionText:'Ответить и согласовать детали встречи',dueAt:null },
    'meeting-confirmed': { type:'event',kind:'plan',agreementStatus:'confirmed',nextAction:'none',nextActionText:null },
    todo: { type:'todo',kind:'request',agreementStatus:'not_applicable',nextAction:'do',nextActionText:'Выполнить просьбу' },
    reply: { type:'reply',kind:'request',agreementStatus:'not_applicable',nextAction:'reply',nextActionText:'Ответить на сообщение' },
    waiting: { type:'waiting',kind:'promise',agreementStatus:'not_applicable',nextAction:'wait',nextActionText:'Дождаться обещанного' },
    saved: { type:'saved',kind:'note',agreementStatus:'not_applicable',nextAction:'none',nextActionText:null,dueAt:null }
  };
  const state = states[choice];
  return { ...state, title:name, ...(state.type==='saved'?{memoryCategory:loop?.memoryCategory??undefined}:{}), status:loop?.status==='done'?'done':'open' };
}

export function relevantMeaningCorrections(text, author, examples = [], limit = 3) {
  const normalized = normalizeExampleText(text);
  const words = new Set(normalized.split(' ').filter(word=>word.length>2));
  const sender = normalizeExampleText(author);
  return examples
    .map(item=>{
      const example = normalizeExampleText(item.text);
      const score = (example === normalized ? 15 : 0)
        + example.split(' ').reduce((n,w)=>n+(words.has(w)&&w.length>2?1:0),0)
        + (sender && normalizeExampleText(item.authorName)===sender?2:0);
      return {item,score};
    })
    .filter(({score})=>score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit)
    .map(({item})=>({
      text:String(item.text).slice(0,280),
      authorName:String(item.authorName??'').slice(0,70),
      corrected:{
        type:item.corrected?.type,
        kind:item.corrected?.kind,
        agreementStatus:item.corrected?.agreementStatus,
        nextAction:item.corrected?.nextAction,
        title:String(item.corrected?.title??'').slice(0,110)
      }
    }));
}
