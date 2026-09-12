const apiKey = process.env.GROQ_API_KEY;

function lexicalScore(query, loop) {
  const words = query.toLocaleLowerCase('ru-RU').split(/\s+/).filter(Boolean);
  const haystack = [loop.title, loop.memoryCategory, loop.space, loop.person?.name, loop.source?.text]
    .filter(Boolean).join(' ').toLocaleLowerCase('ru-RU');
  return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

export async function searchMemory(query, loops) {
  const memory = loops.filter((loop) => loop.type === 'saved' && loop.status !== 'dismissed');
  if (!query.trim() || !memory.length) return memory;

  if (!apiKey) {
    return memory
      .map((loop) => ({ loop, score: lexicalScore(query, loop) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ loop }) => loop);
  }

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const candidates = memory.slice(0, 120).map((loop) => ({
    id: loop.id,
    title: loop.title,
    category: loop.memoryCategory ?? null,
    space: loop.space ?? null,
    person: loop.person?.name ?? null,
    source: loop.source?.text ?? null
  }));

  const prompt = `Ты поиск по личной памяти LOOP. Пользователь ищет только среди своих сохранённых Telegram-рекомендаций и заметок.
Пойми смысл запроса, даже если слова не совпадают буквально. Учитывай человека, категорию, место, название и исходное сообщение.
Не придумывай объекты. Верни максимум 8 id из кандидатов в порядке релевантности. Если ничего не подходит, верни пустой массив.
Верни ТОЛЬКО JSON: {"ids":["id"]}.

Запрос: ${query}\n\nКандидаты:\n${JSON.stringify(candidates)}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) throw new Error(`Groq memory search ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{"ids":[]}');
  const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
  const byId = new Map(memory.map((loop) => [loop.id, loop]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
