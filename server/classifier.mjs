import { learnedSpaceFor } from './space-rules.mjs';
import { detectSignals, normalizeMeaning, proposedTitle } from './meaning.mjs';

// An emergency fallback, not a substitute for Groq. It must be conservative:
// uncertainty means no card, rather than saving every conversational fragment.
const requests = /(?:скинь|отправь|пришли|привези|принеси|захвати|сделай|посмотри\s+(?:пожалуйста|документ)|проверь|не забудь|купить|купи|оплатим|заплатим|квитанци|попросить.*чтобы\s+ты)/i;
const promises = /(?:\bя\b|\bмы\b|\bтогда\b|\bзавтра\b|\bсегодня\b|\d+\s+числа).{0,90}(?:скину|отправлю|пришлю|привезу|принесу|сделаю|посмотрю|проверю|верну)/i;
const needsReply = /(?:ответь|дай знать|напиши мне|мне заранее знать|всё в силе|все в силе|подтверди|во сколько хочешь|(?:\?|？))/i;
const definiteEvent = /(?:собрание|встреча|совещание|созвон|тренировка|матч).{0,75}(?:в\s+\d{1,2}|завтра|сегодня|в\s+суббот|в\s+воскрес|понедельник|вторник|среду|четверг|пятницу)/i;

function titleFor(type, text, author, signals) {
  if (signals.proposal) return proposedTitle(signals, author);
  const cleaned = text.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  if (type === 'todo') {
    if (/туалетн.{0,10}бумаг/i.test(text) && /купи|купить/i.test(text)) return 'Купить туалетную бумагу';
    if (/квитанци/i.test(text) && /пришл/i.test(text)) return 'Отправить квитанции';
    if (/коммуналк/i.test(text) && /оплат|заплат/i.test(text)) return 'Оплатить коммунальные платежи';
    if (/косметич/i.test(text) && /отправ|привез/i.test(text)) return 'Передать косметичку с косметикой';
    return cleaned.slice(0, 90);
  }
  if (type === 'waiting') return author && author !== 'Контакт из Telegram' ? `Дождаться обещанного от ${author}` : 'Дождаться обещанного';
  if (type === 'reply') return author && author !== 'Контакт из Telegram' ? `Ответить ${author}` : 'Ответить на сообщение';
  if (type === 'event') return author && author !== 'Контакт из Telegram' ? `Встреча или событие с ${author}` : 'Предстоящее событие';
  return cleaned.slice(0, 90);
}

export function classifyMessage({ text, author, messageId, chatId, receivedAt, spaces = [] }) {
  const source = String(text ?? '').trim();
  if (!source || author === 'Я' || /^(?:го|хорошо|ладно|не,?\s*спасибо|спасибо|ок(?:ей)?|ага|нет|да)[.!?\s]*$/i.test(source)) return null;
  const signals = detectSignals(source);
  let type;
  if (signals.proposal) type = 'reply';
  else if (requests.test(source)) type = 'todo';
  else if (promises.test(source)) type = 'waiting';
  else if (needsReply.test(source)) type = 'reply';
  else if (signals.confirmed || definiteEvent.test(source)) type = 'event';
  else if (signals.recommendation) type = 'saved';
  else return null;

  const title = titleFor(type, source, author, signals);
  const base = normalizeMeaning({ type, title, confidence: 0.76 }, { text: source, author }, signals);
  if (!base) return null;
  const space = learnedSpaceFor(source, author, spaces);
  return {
    id: crypto.randomUUID(),
    ...base,
    status: 'suggested',
    person: author ? { name: author } : undefined,
    confidence: 0.76,
    space,
    spaceConfidence: space ? 1 : 0,
    source: { messageId, chatId, text: source, receivedAt, authorName: author },
    createdAt: new Date().toISOString()
  };
}
