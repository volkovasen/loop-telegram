import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('server/data');
const dataFile = path.join(dataDir, 'loops.json');

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, '[]', 'utf8');
  }
}

export async function readLoops() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw);
}

export async function addLoop(loop) {
  const loops = await readLoops();
  loops.unshift(loop);
  await fs.writeFile(dataFile, JSON.stringify(loops, null, 2), 'utf8');
  return loop;
}

export async function updateLoop(id, patch) {
  const loops = await readLoops();
  const index = loops.findIndex((loop) => loop.id === id);
  if (index === -1) return null;
  loops[index] = { ...loops[index], ...patch };
  await fs.writeFile(dataFile, JSON.stringify(loops, null, 2), 'utf8');
  return loops[index];
}
