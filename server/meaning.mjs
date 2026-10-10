// A single forwarded message describes an obligation or agreement, not necessarily a todo.
// Keep factual content (kind), agreement stage and user's next step independent.
const day = '(?:сегодня|завтра|послезавтра|в\\s+(?:понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)|на\\s+(?:субботу|воскресенье)|\\d{1,2}[:.]\\d{2})';
const meet = /(?:встрет|увидим|увидет|созвон|погуля|сход(?:ить|им)|посид(?:еть|им)|посмотр(?:еть|им)|встречу)/i;
const invitation = /(?:давай|можем|можно|предлагаю|предложил[аи]?|хочешь|как насч[её]т|может|го\s+).{0,110}(?:встрет|увид|созвон|погуля|сход(?:им|ить)|посид(?:им|еть)|посмотрим|в\s+кино|на\s+фильм|на\s+сериал|встреч)/i;
const proposeDelivery = /(?:давай|можем|предлагаю|можно).{0,110}(?:привез|привез[её]м|передад|завез|отдад|вруч)/i;
const confirmed = /(?:договорились(?:\s+на|\s+о|\s+в)?|встреча\s+(?:назначена|подтверждена)|встречаемся\s+(?:завтра|сегодня|в\s+)|увидимся\s+(?:завтра|сегодня|в\s+)|созвон\s+(?:назначен|подтвержд[её]н))/i;
const recommendation = /(?:рекомендую|советую|рекомендац|посмотри(?:те)?\s+(?:фильм|сериал|кино)|сходи\s+в\s+(?:кафе|ресторан)|почитай\s+(?:книгу|статью))/i;

export function detectSignals(text = '') {
  const source = String(text);
  const meetingProposal = invitation.test(source) || /предложил[аи]?\s+встрет/i.test(source) || /(?:завтра|сегодня|в\s+субботу|в\s+воскресенье).{0,80}(?:игра|матч|тренировк).{0,80}приходи/i.test(source);
  const deliveryProposal = proposeDelivery.test(source);
  const proposal = meetingProposal || deliveryProposal;
  const hasConfirmed = confirmed.test(source) && !proposal && !/(?:не|ещ[её]\s+не|пока\s+не)\s+договорились/i.test(source) && !/договорились\s*\?/i.test(source);
  // For 'сегодня не могу, давай завтра привезём' the plan is tomorrow,
  // not the background explanation about today.
  const proposedTail = proposal ? source.match(/(?:давай|можем|предлагаю|предложил[аи]?)(.{0,150})/i)?.[1] : null;
  const date = (proposedTail?.match(new RegExp(day, 'iu'))?.[0]) ?? source.match(new RegExp(day, 'iu'))?.[0] ?? null;
  return {
    proposal,
    proposalKind: meetingProposal ? 'meeting' : deliveryProposal ? 'delivery' : null,
    confirmed: hasConfirmed,
    whenText: date,
    recommendation: recommendation.test(source) && !proposal,
    mentionsMeeting: meet.test(source)
  };
}

export function proposedTitle(signals, author) {
  // The author's name is already shown in the card. Avoid grammatically
  // incorrect case inflections of Russian first names in a generated title.
  if (signals.proposalKind === 'delivery') return 'Согласовать передачу вещи';
  return `Договориться о встрече${signals.whenText ? ' ' + signals.whenText : ''}`;
}

function boundedText(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

const kinds = new Set(['plan', 'request', 'promise', 'recommendation', 'note']);
const stages = new Set(['proposed', 'confirmed', 'unknown', 'not_applicable']);
const actions = new Set(['coordinate', 'reply', 'do', 'wait', 'none']);
const types = new Set(['reply', 'todo', 'waiting', 'event', 'saved']);

export function normalizeMeaning(item, input, signals = detectSignals(input.text)) {
  if (!item || !types.has(item.type)) return null;
  let type = item.type;
  let kind = kinds.has(item.kind) ? item.kind : ({ reply: 'request', todo: 'request', waiting: 'promise', event: 'plan', saved: 'recommendation' })[type];
  let agreementStatus = stages.has(item.agreementStatus) ? item.agreementStatus : type === 'event' ? 'unknown' : 'not_applicable';
  let nextAction = actions.has(item.nextAction) ? item.nextAction : ({ reply: 'reply', todo: 'do', waiting: 'wait', event: 'none', saved: 'none' })[type];
  let title = boundedText(item.title, 110);
  let nextActionText = boundedText(item.nextActionText, 140) || null;
  let whenText = boundedText(item.whenText, 65) || signals.whenText;
  let dueAt = typeof item.dueAt === 'string' && !Number.isNaN(Date.parse(item.dueAt)) ? item.dueAt : undefined;

  if (signals.proposal) {
    // Deterministic safety guard: an invitation must not become a movie
    // recommendation, multiple tasks, or an already-confirmed appointment.
    type = 'reply';
    kind = 'plan';
    agreementStatus = 'proposed';
    nextAction = 'coordinate';
    title = proposedTitle(signals, input.author);
    nextActionText = signals.proposalKind === 'delivery'
      ? 'Подтвердить предложение и уточнить место передачи'
      : 'Ответить на предложение и согласовать детали встречи';
    whenText = signals.whenText;
    dueAt = undefined; // No reminder for a meeting that nobody has agreed to.
  } else if (type === 'event' || kind === 'plan') {
    kind = 'plan';
    agreementStatus = signals.confirmed ? 'confirmed' : agreementStatus === 'proposed' ? 'proposed' : 'unknown';
    if (agreementStatus === 'proposed') {
      type = 'reply';
      nextAction = 'coordinate';
      nextActionText ||= 'Согласовать дату и детали';
      dueAt = undefined;
    } else if (agreementStatus === 'confirmed') {
      type = 'event';
      nextAction = 'none';
      nextActionText = null;
    } else {
      // An event may be reported as a fact without enough conversation
      // context to prove that all participants confirmed it.
      type = 'event';
      nextAction = 'none';
      nextActionText = null;
      dueAt = undefined;
    }
  } else if (type === 'saved') {
    kind = signals.recommendation ? 'recommendation' : 'note';
    agreementStatus = 'not_applicable';
    nextAction = 'none';
    nextActionText = null;
    dueAt = undefined;
  } else {
    kind = type === 'waiting' ? 'promise' : 'request';
    agreementStatus = 'not_applicable';
    nextAction = type === 'waiting' ? 'wait' : type === 'todo' ? 'do' : 'reply';
    if (!nextActionText) nextActionText = ({
      reply: 'Ответить или подтвердить решение',
      todo: 'Выполнить просьбу',
      waiting: 'Дождаться обещанного'
    })[type];
  }

  if (!title) return null;
  return { type, kind, agreementStatus, nextAction, nextActionText, whenText, title, dueAt };
}

export function normalizeAIItems(items, input) {
  const signals = detectSignals(input.text);
  // One proposed meeting/delivery is a single agreement, even if the AI
  // produced both a saved movie recommendation and an event from one sentence.
  if (signals.proposal) {
    const first = items.find(item => item && typeof item.title === 'string') ?? { type: 'reply', title: proposedTitle(signals, input.author), confidence: 0.85 };
    const main = { ...first, ...normalizeMeaning({ ...first, type: 'reply', title: proposedTitle(signals, input.author) }, input, signals) };
    // Keep an unrelated explicit request in the same message ("а ещё купи хлеб").
    // Do not turn the film mentioned as part of a meeting into a second todo.
    const hasSeparateRequest = /(?:а\s+ещ[её]|и\s+ещ[её]|и\s+заодно|также).{0,45}(?:купи|купить|пришли|отправь|скинь|принеси|захвати|проверь|оплати)/i.test(input.text);
    const separate = hasSeparateRequest
      ? items.filter(item => item !== first && item?.type === 'todo')
        .map(item => {
          const meaning = normalizeMeaning(item, input, { ...signals, proposal: false, proposalKind: null });
          return meaning ? { ...item, ...meaning } : null;
        }).filter(Boolean).slice(0, 2)
      : [];
    return [main, ...separate];
  }
  return items.map(item => {
    const meaning = normalizeMeaning(item, input, signals);
    return meaning ? { ...item, ...meaning } : null;
  }).filter(Boolean);
}
