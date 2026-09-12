const apiKey = process.env.GROQ_API_KEY;

const STOP_WORDS = new Set(['и','в','во','на','по','из','от','до','за','к','ко','у','о','об','про','мне','мне-то','мой','моя','мои','что','где','как','какой','какая','какие','кто','куда','когда','ли','бы','же','это','тот','та','те','просто','можно','хочу','советовал','советовала','советовали','посоветовал','посоветовала','посоветовали']);
const EXPANSIONS = {
  поесть: ['ресторан','кафе','еда','поесть','сходи'],
  съесть: ['ресторан','кафе','еда','поесть','сходи'],
  ресторан: ['ресторан','кафе','поесть','еда'],
  рестораны: ['ресторан','кафе','поесть','еда'],
  посмотреть: ['фильм','сериал','кино','посмотри'],
  смотреть: ['фильм','сериал','кино','посмотри'],
  кино: ['фильм','сериал','кино','посмотри'],
  фильм: ['фильм','кино','посмотри'],
  почитать: ['книга','статья','почитать','прочитать'],
  читать: ['книга','статья','почитать','прочитать'],
  сходить: ['место','ресторан','кафе','сходи','посетить'],
  купить: ['покупки','купить','магазин']
};

function normalize(value = '') {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function searchableText(loop) {
  return normalize([
    loop.title,
    loop.memoryCategory,
    loop.space,
    loop.person?.name,
    loop.person?.username,
    loop.source?.authorName,
    loop.source?.text
  ].filter(Boolean).join(' '));
}

function lexicalScore(query, loop) {
  const haystack = searchableText(loop);
  const queryTokens = tokens(query);
  let score = 0;
  for (const word of queryTokens) {
    if (haystack.includes(word)) score += 8;
    for (const related of EXPANSIONS[word] ?? []) if (haystack.includes(related)) score += 3;
  }
  return score;
}

function lexicalMatches(query, memory) {
  return memory
    .map((loop) => ({ loop, score: lexicalScore(query, loop) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

async function semanticIds(query, memory) {
  if (!apiKey) return [];
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const candidates = memory.slice(0, 150).map((loop) => ({
    id: loop.id,
    title: loop.title,
    category: loop.memoryCategory ?? null,
    space: loop.space ?? null,
    person: loop.person?.name ?? null,
    username: loop.person?.username ?? null,
    source: loop.source?.text ?? null
  }));

  const prompt = `Ты поисковый ранжировщик личной памяти LOOP.
Пользователь может написать ОДНО слово, обрывок мысли, имя, город, категорию или обычный вопрос.
Нужно вернуть ВСЕ разумно подходящие сохраненные объекты, максимум 12, лучшие первыми.

Примеры смысла:
- «Берлин» -> все сохраненное, связанное с Берлином;
- «ресторан» или «где поесть» -> рестораны/кафе/места для еды;
- «что посмотреть» -> фильмы/сериалы/видео;
- «что почитать» -> книги/статьи;
- имя человека -> то, что связано с этим человеком;
- «куда сходить в Берлине» -> места и рестораны в Берлине.

Не требуй совпадения формулировки запроса с title. Используй title, category, person и особенно source.
Не придумывай новые объекты и не отвечай текстом. Если кандидат хоть разумно соответствует запросу, включи его.
Верни только JSON {"ids":["id"]}.

Запрос: ${query}\n\nКандидаты:\n${JSON.stringify(candidates)}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0, response_format: { type: 'json_object' } })
  });
  if (!response.ok) throw new Error(`Groq memory search ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{"ids":[]}');
  return Array.isArray(parsed.ids) ? parsed.ids : [];
}

export async function searchMemory(query, loops) {
  const memory = loops.filter((loop) => loop.type === 'saved' && loop.status !== 'dismissed');
  const q = query.trim();
  if (!q || !memory.length) return memory;

  const lexical = lexicalMatches(q, memory);
  let aiIds = [];
  try {
    aiIds = await semanticIds(q, memory);
  } catch (error) {
    console.error('Semantic memory ranking failed, using local search:', error);
  }

  const byId = new Map(memory.map((loop) => [loop.id, loop]));
  const ordered = [];
  const seen = new Set();

  // Exact/partial evidence must never disappear just because the model missed it.
  for (const { loop } of lexical) {
    if (!seen.has(loop.id)) { ordered.push(loop); seen.add(loop.id); }
  }
  for (const id of aiIds) {
    const loop = byId.get(id);
    if (loop && !seen.has(id)) { ordered.push(loop); seen.add(id); }
  }

  return ordered.slice(0, 12);
}
