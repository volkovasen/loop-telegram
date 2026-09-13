import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR || 'server/data');
const dataFile = path.join(dataDir, 'loops.json');
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
