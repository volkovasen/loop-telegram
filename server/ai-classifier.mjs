import OpenAI from 'openai';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    loops: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['reply', 'todo', 'waiting', 'event', 'saved'] },
          title: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          dueAt: { type: ['string', 'null'] }
        },
        required: ['type', 'title', 'confidence', 'dueAt']
      }
    }
  },
  required: ['loops']
};

export async function classifyWithAI({ text, author, messageId, chatId, receivedAt }) {
  if (!client) return null;

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    input: [
      { role: 'system', content: `Ты движок LOOP, Telegram attention layer. Выдели 0..N реально незакрытых вещей из пересланного сообщения.
Типы: reply = человеку действительно нужен ответ/решение; todo = пользователь должен что-то сделать; waiting = автор явно обещал что-то пользователю; event = конкретная встреча/созвон/событие; saved = полезно сохранить, но это не действие.
Важно: просьба в форме вопроса (например «можешь купить бумагу?») обычно todo, НЕ reply. Не создавай loop из болтовни, риторических вопросов, смеха, неопределённого «как-нибудь». Одно сообщение может дать несколько loops. Заголовок короткий, конкретный, на русском, с глагола. Не выдумывай факты.
Текущее время: ${new Date().toISOString()}. Автор сообщения: ${author}.` },
      { role: 'user', content: text }
    ],
    text: { format: { type: 'json_schema', name: 'open_loops', strict: true, schema } }
  });

  const parsed = JSON.parse(response.output_text);
  return parsed.loops.map((item) => ({
    id: crypto.randomUUID(),
    type: item.type,
    status: item.confidence >= 0.8 ? 'open' : 'suggested',
    title: item.title,
    person: author ? { name: author } : undefined,
    dueAt: item.dueAt ?? undefined,
    confidence: item.confidence,
    source: { messageId, chatId, text, receivedAt, authorName: author },
    createdAt: new Date().toISOString()
  }));
}
