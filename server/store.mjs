import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SPACES, normalizeExampleText } from './space-rules.mjs';

// Keep all user data on Railway's persistent volume, never on its ephemeral app disk.
const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
if (process.env.NODE_ENV === 'production' && process.env.RAILWAY_PROJECT_ID && !railwayVolume) {
  throw new Error('LOOP needs a persistent Railway volume. Attach one to the service (mount path /data) before launch.');
}
const dataDir = path.resolve(railwayVolume || process.env.DATA_DIR || 'server/data');
const dataFile = path.join(dataDir, 'loops.json');
const spacesFile = path.join(dataDir, 'spaces.json');
let writeChain = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(dataFile); } catch { await fs.writeFile(dataFile, '[]', 'utf8'); }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  try { return JSON.parse(raw); } catch { return []; }
}

async function writeAll(loops) {
  const tmp = `${dataFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(loops, null, 2), 'utf8');
  await fs.rename(tmp, dataFile);
}

function enqueueWrite(task) {
  writeChain = writeChain.then(task, task);
  return writeChain;
}

export async function readLoops(ownerId) {
  const loops = await readAll();
  if (!ownerId || ownerId === '*') return loops;
  return loops.filter((loop) => String(loop.ownerId ?? 'local-dev') === String(ownerId));
}

export async function addLoop(loop) {
  return enqueueWrite(async () => {
    const loops = await readAll();
    const duplicate = loops.find((item) =>
      item.ownerId === loop.ownerId &&
      item.source?.messageId === loop.source?.messageId &&
      item.type === loop.type &&
      item.title === loop.title
    );
    if (duplicate) return duplicate;
    loops.unshift(loop);
    await writeAll(loops);
    return loop;
  });
}

export async function updateLoop(id, patch, ownerId) {
  return enqueueWrite(async () => {
    const loops = await readAll();
    const index = loops.findIndex((loop) => loop.id === id && (!ownerId || ownerId === '*' || String(loop.ownerId ?? 'local-dev') === String(ownerId)));
    if (index === -1) return null;
    const safePatch = { ...patch };
    delete safePatch.id;
    delete safePatch.ownerId;
    if (safePatch.dueAt && safePatch.dueAt !== loops[index].dueAt) safePatch.remindedAt = null;
    loops[index] = { ...loops[index], ...safePatch, updatedAt: new Date().toISOString() };
    await writeAll(loops);
    return loops[index];
  });
}

export class SpaceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function readSpaceRecords() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const records = JSON.parse(await fs.readFile(spacesFile, 'utf8'));
    if (!Array.isArray(records)) throw new Error('Invalid spaces.json');
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeSpaceRecords(records) {
  const tmp = `${spacesFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tmp, spacesFile);
}

function spacesForOwner(records, ownerId) {
  const mine = records.filter(item => item.ownerId === String(ownerId));
  const defaults = DEFAULT_SPACES.map(item => {
    const saved = mine.find(record => record.id === item.id);
    return { ...item, examples: saved?.examples ?? [] };
  });
  return [...defaults, ...mine.filter(item => !item.isDefault && !DEFAULT_SPACES.some(def => def.id === item.id))];
}

export async function readSpaces(ownerId) {
  if (!ownerId) throw new SpaceError('User is required', 401);
  return spacesForOwner(await readSpaceRecords(), ownerId);
}

function validateSpaceInput(raw, existing, excludeId) {
  const name = String(raw?.name ?? '').trim().replace(/\s+/g, ' ');
  const description = String(raw?.description ?? '').trim();
  if (!name || name.length > 40 || /[\x00-\x1f<>]/.test(name)) throw new SpaceError('Название: от 1 до 40 символов, без управляющих знаков.');
  if (description.length < 8 || description.length > 400) throw new SpaceError('Опиши правила Space: от 8 до 400 символов.');
  if (['все', 'без темы'].includes(name.toLocaleLowerCase('ru-RU'))) throw new SpaceError('Это название зарезервировано интерфейсом.');
  if (existing.some(item => item.id !== excludeId && item.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) {
    throw new SpaceError('Такой Space уже существует.');
  }
  return { name, description };
}

export async function createSpace(ownerId, input) {
  return enqueueWrite(async () => {
    const records = await readSpaceRecords();
    const existing = spacesForOwner(records, ownerId);
    if (existing.filter(item => !item.isDefault).length >= 20) throw new SpaceError('Можно создать не больше 20 своих Spaces.');
    const { name, description } = validateSpaceInput(input, existing);
    const space = { id: crypto.randomUUID(), ownerId: String(ownerId), name, description, isDefault: false, examples: [], createdAt: new Date().toISOString() };
    records.push(space);
    await writeSpaceRecords(records);
    return space;
  });
}

export async function editSpace(ownerId, id, input) {
  return enqueueWrite(async () => {
    const records = await readSpaceRecords();
    const index = records.findIndex(item => item.id === id && item.ownerId === String(ownerId) && !item.isDefault);
    if (index < 0) throw new SpaceError('Space не найден или не редактируется.', 404);
    const existing = spacesForOwner(records, ownerId);
    const { name, description } = validateSpaceInput(input, existing, id);
    const oldName = records[index].name;
    if (name !== oldName) {
      const loops = await readAll();
      let changed = false;
      for (const loop of loops) {
        if (String(loop.ownerId) === String(ownerId) && loop.space === oldName) {
          loop.space = name;
          loop.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
      if (changed) await writeAll(loops);
    }
    records[index] = { ...records[index], name, description, updatedAt: new Date().toISOString() };
    await writeSpaceRecords(records);
    return records[index];
  });
}

export async function deleteSpace(ownerId, id) {
  return enqueueWrite(async () => {
    const records = await readSpaceRecords();
    const index = records.findIndex(item => item.id === id && item.ownerId === String(ownerId) && !item.isDefault);
    if (index < 0) throw new SpaceError('Space не найден или не удаляется.', 404);
    const removed = records[index];
    const loops = await readAll();
    let changed = false;
    for (const loop of loops) {
      if (String(loop.ownerId) === String(ownerId) && loop.space === removed.name) {
        loop.space = null;
        loop.spaceConfidence = 0;
        loop.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) await writeAll(loops);
    records.splice(index, 1);
    await writeSpaceRecords(records);
    return { deleted: true };
  });
}

// Correction examples are private per owner and capped to avoid endlessly
// increasing AI prompt size. Moving a message removes its obsolete examples.
export async function recordSpaceCorrection(ownerId, spaceName, text, authorName) {
  const snippet = String(text ?? '').trim().slice(0, 500);
  if (!snippet) return;
  return enqueueWrite(async () => {
    const records = await readSpaceRecords();
    const mine = spacesForOwner(records, ownerId);
    if (spaceName && !mine.some(item => item.name === spaceName)) throw new SpaceError('Неизвестный Space.');
    const normalized = normalizeExampleText(snippet);
    const author = normalizeExampleText(authorName);
    for (const record of records) {
      if (record.ownerId !== String(ownerId) || !record.examples) continue;
      record.examples = record.examples.filter(example => normalizeExampleText(example.text) !== normalized || normalizeExampleText(example.authorName) !== author);
    }
    if (spaceName) {
      const space = mine.find(item => item.name === spaceName);
      let record = records.find(item => item.ownerId === String(ownerId) && item.id === space.id);
      if (!record) {
        record = { ...space, ownerId: String(ownerId), examples: [] };
        records.push(record);
      }
      record.examples = [{ text: snippet, authorName: String(authorName ?? '').slice(0, 100) }, ...(record.examples ?? [])].slice(0, 8);
    }
    await writeSpaceRecords(records);
  });
}
