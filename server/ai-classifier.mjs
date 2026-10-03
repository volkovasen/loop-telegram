const apiKey = process.env.GROQ_API_KEY;

const allowedTypes = new Set(['reply', 'todo', 'waiting', 'event', 'saved']);
const allowedSpaces = new Set(['Дом', 'Работа', 'Личное']);
const allowedActions = new Set(['create', 'update', 'complete', 'cancel', 'ignore']);

function normalizeSpace(value) { return allowedSpaces.has(value) ? value : 'Личное'; }
function personKey(person, author) {
  if (person?.telegramUserId) return `tg:${person.telegramUserId}`;
  return `name:${String(person?.name ?? author ?? '').toLocaleLowerCase('ru-RU').trim()}`;
}
function compactContext(openLoops = [], person, author) {
  const key = personKey(person, author);
  return openLoops
    .filter((loop) => {
      const loopKey = personKey(loop.person, loop.source?.authorName);
      return loopKey === key && loop.status !== 'done' && loop.status !== 'dismissed';
    })
    .slice(0, 12)
    .map((loop) => ({ id: loop.id, type: loop.type, title: loop.title, dueAt: loop.dueAt ?? null, status: loop.status }));
}

async function askGroq(prompt) {
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.05, response_format: { type: 'json_object' } })
  });
  if (!response.ok) throw new Error(`Groq API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error('Groq returned no classifier output');
  return JSON.parse(output);
}

export async function classifyWithAI({ text, author, messageId, chatId, receivedAt, person, openLoops = [], perspective = 'other' }) {
  if (!apiKey) return null;
  const timeZone = process.env.LOOP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const context = compactContext(openLoops, person, author);
  const prompt = `Ты движок LOOP, слоя внимания поверх Telegram. Твоя задача не выписать все действия из текста, а понять, что после сообщения реально требует внимания ПОЛЬЗОВАТЕЛЯ.

Перспектива сообщения: ${perspective === 'self' ? 'сообщение написал сам пользователь' : 'сообщение пришло от другого человека'}.
В Forward Mode почти всегда анализируется чужое сообщение. Не превращай планы автора о его собственной жизни в задачи пользователя.

Сначала выбери lifecycle action:
- create: возник новый хвост;
- update: сообщение меняет существующий хвост (время, дата, формулировка);
- complete: автор явно сообщает, что существующее ожидание/дело выполнено;
- cancel: существующая договорённость отменена;
- ignore: ничего нового для внимания пользователя.

Типы для create/update:
- reply: от пользователя реально ждут ответа/решения/подтверждения;
- todo: пользователь должен совершить действие. Просьба-вопрос «можешь купить?» = todo;
- waiting: автор явно обещал что-то пользователю;
- event: подтверждённая встреча/созвон/визит. Предложение времени без согласия не создавай как event;
- saved: рекомендация/место/фильм/книга/полезная информация на будущее.

Ключевые правила:
- Рассказ автора «я завтра иду к визажисту / куплю / записалась» = ignore, если пользователь ничего не должен и это не обещание пользователю.
- Болтовня, намерение, рассуждение, «го», «хорошо» без достаточного контекста = ignore.
- «напополам оплатим?» и похожее конкретное совместное действие = todo, а не reply.
- Если от пользователя нужен только ответ/подтверждение, это reply.
- Если сообщение переносит/отменяет/завершает существующий хвост, НЕ создавай дубль. Используй update/cancel/complete и targetId.
- Лучше ignore сомнительное сообщение, чем создать мусор.
- Одно сообщение может создать несколько независимых объектов.
- dueAt ISO-8601 или null. Не выдумывай точное время. Дата без времени = 12:00 локального дня.
- space только Дом, Работа, Личное.
- memoryCategory только для saved.

Текущие незакрытые хвосты с этим человеком:
${JSON.stringify(context)}

Верни ТОЛЬКО JSON:
{"operations":[{"action":"create","targetId":null,"type":"todo","title":"Оплатить половину коммуналки","confidence":0.95,"dueAt":null,"space":"Дом","memoryCategory":null}]}
Для ignore можно вернуть {"operations":[]}.

Часовой пояс: ${timeZone}
Получено: ${receivedAt}
Автор: ${author}
Сообщение:
${text}`;

  const parsed = await askGroq(prompt);
  const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
  return operations
    .filter((item) => allowedActions.has(item.action ?? 'create'))
    .map((item) => {
      const action = item.action ?? 'create';
      const target = context.find((loop) => loop.id === item.targetId);
      if (action !== 'create' && !target) return null;
      if (action === 'cancel' || action === 'complete') return { action, targetId: target.id, confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.9)) };
      if (!allowedTypes.has(item.type) || typeof item.title !== 'string' || !item.title.trim()) return null;
      const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
      return {
        action, targetId: target?.id,
        loop: {
          id: target?.id ?? crypto.randomUUID(),
          type: item.type,
          status: confidence >= 0.8 ? 'open' : 'suggested',
          title: item.title.trim(),
          person: person ?? (author ? { name: author } : undefined),
          dueAt: typeof item.dueAt === 'string' ? item.dueAt : undefined,
          space: normalizeSpace(item.space),
          memoryCategory: item.type === 'saved' && typeof item.memoryCategory === 'string' ? item.memoryCategory.trim() : undefined,
          confidence,
          source: { messageId, chatId, text, receivedAt, authorName: author },
          createdAt: target?.createdAt ?? new Date().toISOString()
        }
      };
    })
    .filter(Boolean);
}

// Compatibility for the single-message benchmark and older callers.
export async function classifyLoopsWithAI(input) {
  const operations = await classifyWithAI(input);
  return operations?.filter((op) => op.action === 'create').map((op) => op.loop) ?? operations;
}
