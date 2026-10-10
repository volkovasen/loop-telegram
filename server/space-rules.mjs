// Spaces stay user-owned. A correction is an example, not a model fine-tune.
export const DEFAULT_SPACES = [
  { id: 'default-home', name: 'Дом', description: 'Быт, квартира, хозяйство, домашние дела и семья.', isDefault: true },
  { id: 'default-work', name: 'Работа', description: 'Рабочие задачи, коллеги, проекты, клиенты и деловые встречи.', isDefault: true },
  { id: 'default-personal', name: 'Личное', description: 'Личные планы, друзья, здоровье, интересы и дела вне работы и дома.', isDefault: true }
];

export function normalizeExampleText(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Only an identical message from the same sender may override an AI guess.
// Other corrections are shown to the classifier as bounded, contextual examples.
export function learnedSpaceFor(text, author, spaces = []) {
  const normalized = normalizeExampleText(text);
  if (!normalized) return null;
  const sender = normalizeExampleText(author);
  for (const space of spaces) {
    for (const example of space.examples ?? []) {
      if (normalizeExampleText(example.text) !== normalized) continue;
      if (normalizeExampleText(example.authorName) !== sender) continue;
      return space.name;
    }
  }
  return null;
}
