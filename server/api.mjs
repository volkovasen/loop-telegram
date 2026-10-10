import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SpaceError, createSpace, deleteSpace, editSpace, readLoops, readSpaces, recordSpaceCorrection, updateLoop } from './store.mjs';
import { searchMemory } from './memory-search.mjs';
import { resolveRequestUser } from './telegram-auth.mjs';
import { allowRequest } from './rate-limit.mjs';

const port = Number(process.env.PORT ?? 8787);
const allowedOrigin = process.env.CORS_ORIGIN || '*';
const distDir = path.resolve('dist');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res) {
  if (req.method !== 'GET') return false;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const candidate = path.resolve(distDir, `.${requested}`);
  if (!candidate.startsWith(distDir)) return false;

  let file = candidate;
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(distDir, 'index.html');
  }

  try {
    const body = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(body);
    return true;
  } catch { return false; }
}

async function readJson(req, maxBytes = 8_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new SpaceError('Слишком большой запрос.', 413);
  }
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new SpaceError('Неверный JSON.', 400); }
}

function auth(req, res) {
  const user = resolveRequestUser(req);
  if (!user) {
    send(res, 401, { error: 'Telegram authentication required' });
    return null;
  }
  if (!allowRequest(`api:${user.id}`, { limit: Number(process.env.API_RATE_LIMIT ?? 120), windowMs: 60_000 })) {
    send(res, 429, { error: 'Too many requests' });
    return null;
  }
  return user;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'loop-api' });

    const isApi = req.url === '/loops' || req.url === '/me' || req.url?.startsWith('/memory/search') || req.url?.startsWith('/loops/') || req.url === '/spaces' || req.url?.startsWith('/spaces/');
    if (!isApi) {
      if (await serveStatic(req, res)) return;
      return send(res, 404, { error: 'Not found' });
    }

    const user = auth(req, res);
    if (!user) return;

    if (req.method === 'GET' && req.url === '/me') return send(res, 200, { id: user.id, mode: user.mode, telegram: user.telegram });
    if (req.method === 'GET' && req.url === '/loops') return send(res, 200, await readLoops(user.id));

    if (req.method === 'GET' && req.url === '/spaces') return send(res, 200, await readSpaces(user.id));
    if (req.method === 'POST' && req.url === '/spaces') return send(res, 201, await createSpace(user.id, await readJson(req)));
    const spaceMatch = req.url?.match(/^\/spaces\/([^/]+)$/);
    if (spaceMatch) {
      const id = decodeURIComponent(spaceMatch[1]);
      if (req.method === 'PATCH') return send(res, 200, await editSpace(user.id, id, await readJson(req)));
      if (req.method === 'DELETE') return send(res, 200, await deleteSpace(user.id, id));
    }

    if (req.method === 'GET' && req.url?.startsWith('/memory/search')) {
      if (!allowRequest(`search:${user.id}`, { limit: Number(process.env.SEARCH_RATE_LIMIT ?? 30), windowMs: 60_000 })) return send(res, 429, { error: 'Too many searches' });
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const query = url.searchParams.get('q')?.trim().slice(0, 300) ?? '';
      return send(res, 200, await searchMemory(query, await readLoops(user.id)));
    }

    const match = req.url?.match(/^\/loops\/([^/]+)$/);
    if (req.method === 'PATCH' && match) {
      const patch = await readJson(req, 100_000);
      if (Object.hasOwn(patch, 'space')) {
        if (patch.space !== null && (typeof patch.space !== 'string' || !(await readSpaces(user.id)).some(item => item.name === patch.space))) {
          throw new SpaceError('Такого Space нет.');
        }
      }
      const before = Object.hasOwn(patch, 'space') ? (await readLoops(user.id)).find(item => item.id === match[1]) : null;
      const updated = await updateLoop(match[1], patch, user.id);
      if (updated && before && before.space !== updated.space) {
        await recordSpaceCorrection(user.id, updated.space, updated.source?.text, updated.source?.authorName);
      }
      return updated ? send(res, 200, updated) : send(res, 404, { error: 'Loop not found' });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof SpaceError) return send(res, error.status, { error: error.message });
    console.error('API request failed:', error);
    return send(res, 500, { error: 'Internal server error' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`LOOP web + API listening on port ${port}`));
