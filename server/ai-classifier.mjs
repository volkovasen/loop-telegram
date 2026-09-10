const apiKey = process.env.GEMINI_API_KEY;

const schema = {
  type: 'object',
  properties: {
    loops: {
      type: 'array',
      items: {
        type: 'object',
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
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `Ты движок LOOP, Telegram attention layer. Выдели 0..N реально незакрытых вещей из пересланного сообщения.
Типы: reply = человеку действительно нужен ответ/решение; todo = пользователь должен что-то сделать; waiting = автор явно обещал что-то пользователю; event = конкретная встреча/созвон/событие; saved = полезно сохранить, но это не действие.
Важно: просьба в форме вопроса (например «можешь купить бумагу?») обычно todo, НЕ reply. Не создавай loop из болтовни, риторических вопросов, смеха или неопределённого «как-нибудь». Одно сообщение может дать несколько loops. Заголовок короткий, конкретный, на русском, с глагола. Не выдумывай факты.
Текущее время: ${new Date().toISOString()}. Автор сообщения: ${author}.

Сообщение:\n${text}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!output) throw new Error('Gemini returned no classifier output');

  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed.loops)) throw new Error('Gemini classifier returned invalid loops');

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
