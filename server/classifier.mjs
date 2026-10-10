import { learnedSpaceFor } from './space-rules.mjs';
const patterns = [
  { type: 'event', test: /(встретим|встреча|созвон|созвоним|заеду|приеду).*(\d{1,2}[:.]\d{2}|час|завтра|сегодня|понедель|вторник|сред|четверг|пятниц|суббот|воскрес)/i },
  { type: 'todo', test: /(скинь|отправь|пришли|привези|принеси|захвати|сделай|посмотри|проверь|не забудь|попросить.*чтобы ты)/i },
  { type: 'waiting', test: /(я|мы).*(скину|отправлю|пришлю|привезу|принесу|сделаю|посмотрю|проверю|верну)/i },
  { type: 'reply', test: /\?|ответь|дай знать|напиши мне/i },
];

function cleanTitle(text, type, author) {
  const normalized = text.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  if (type === 'todo') {
    const match = normalized.match(/(?:чтобы ты|пожалуйста[, ]*)?((?:мне )?(?:косметичку|документы|макеты|договор|.+?)(?: отправила| отправил| привезла| привез| принесла| принес| скинула| скинул))/i);
    if (/косметич/i.test(normalized)) return `Привезти ${author ? author + ' ' : ''}косметичку с косметикой на работу`;
    if (match) return match[1].replace(/^мне /i, '').trim();
  }
  if (type === 'waiting') return `Дождаться обещанного${author ? ` от ${author}` : ''}`;
  if (type === 'reply') return `Ответить${author ? ` ${author}` : ''}`;
  if (type === 'event') return `Договорённость${author ? ` с ${author}` : ''}`;
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}

export function classifyMessage({ text, author, messageId, chatId, receivedAt, spaces = [] }) {
  const matched = patterns.find(({ test }) => test.test(text));
  const type = matched?.type ?? 'saved';
  const confidence = matched ? (type === 'todo' ? 0.91 : 0.86) : 0.58;
  const space = learnedSpaceFor(text, author, spaces);
  return {
    id: crypto.randomUUID(), type, status: confidence >= 0.8 ? 'open' : 'suggested',
    title: cleanTitle(text, type, author),
    person: author ? { name: author } : undefined,
    confidence,
    space,
    spaceConfidence: space ? 1 : 0,
    source: { messageId, chatId, text, receivedAt, authorName: author },
    createdAt: new Date().toISOString()
  };
}
