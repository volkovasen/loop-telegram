const apiKey = process.env.GROQ_API_KEY;

const allowedTypes = new Set(['reply', 'todo', 'waiting', 'event', 'saved']);
const allowedSpaces = new Set(['Дом', 'Работа', 'Личное']);

function normalizeSpace(value) {
  return allowedSpaces.has(value) ? value : 'Личное';
}

export async function classifyWithAI({ text, author, messageId, chatId, receivedAt, person }) {
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const timeZone = process.env.LOOP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const prompt = `Ты движок LOOP, слоя внимания поверх Telegram.
Найди 0..N отдельных полезных объектов в пересланном сообщении.

Типы:
- reply: человеку действительно нужен ответ или решение;
- todo: пользователь должен что-то сделать;
- waiting: автор явно обещал что-то пользователю;
- event: конкретная встреча, созвон, визит или событие;
- saved: рекомендация или полезная информация, которую стоит помнить, но делать сейчас ничего не нужно.

Для каждого объекта верни:
- type;
- title: короткий естественный заголовок на русском, обычно с действия для action-типов;
- confidence: 0..1;
- dueAt: ISO-8601 дата-время или null;
- space: только Дом, Работа или Личное;
- memoryCategory: для saved короткая категория вроде Рестораны, Фильмы, Книги, Места, Почитать, Покупки; для остальных null.

Правила:
- Просьба в форме вопроса, например «можешь купить бумагу?», это todo, НЕ reply.
- «Я завтра скину» от автора сообщения обычно waiting.
- Не создавай объект из болтовни, смеха, риторических вопросов и пустых сообщений.
- Одно сообщение может дать несколько объектов. Например встречу и рекомендацию ресторана.
- Понимай время и в цифрах, и словами: «16:00», «в четыре», «завтра вечером», «в пятницу».
- Если точное время не указано, не выдумывай минуты. Для даты без времени используй 12:00 локального дня.
- Не выдумывай место, человека, дату или категорию, которых нет в сообщении.
- Рекомендации ресторанов, фильмов, книг и мест сохраняй как saved, а не как todo.
- Если ничего полезного нет, верни пустой массив.

Верни ТОЛЬКО JSON такого вида:
{"loops":[{"type":"todo","title":"Купить туалетную бумагу","confidence":0.95,"dueAt":null,"space":"Дом","memoryCategory":null}]}

Часовой пояс пользователя: ${timeZone}
Время получения сообщения: ${receivedAt}
Автор сообщения: ${author}

Сообщение:\n${text}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Groq API ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error('Groq returned no classifier output');

  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed.loops)) throw new Error('Groq returned invalid loops');

  return parsed.loops
    .filter((item) => allowedTypes.has(item.type) && typeof item.title === 'string' && item.title.trim())
    .map((item) => {
      const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
      return {
        id: crypto.randomUUID(),
        type: item.type,
        status: confidence >= 0.8 ? 'open' : 'suggested',
        title: item.title.trim(),
        person: person ?? (author ? { name: author } : undefined),
        dueAt: typeof item.dueAt === 'string' ? item.dueAt : undefined,
        space: normalizeSpace(item.space),
        memoryCategory: item.type === 'saved' && typeof item.memoryCategory === 'string' ? item.memoryCategory.trim() : undefined,
        confidence,
        source: { messageId, chatId, text, receivedAt, authorName: author },
        createdAt: new Date().toISOString()
      };
    });
}
