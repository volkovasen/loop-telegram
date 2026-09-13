import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readLoops, updateLoop } from './store.mjs';
import { searchMemory } from './memory-search.mjs';
import { resolveRequestUser } from './telegram-auth.mjs';

const port = Number(process.env.PORT ?? 8787);
const allowedOrigin = process.env.CORS_ORIGIN || '*';
const distDir = path.resolve('dist');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS',
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

function auth(req, res) {
  const user = resolveRequestUser(req);
  if (!user) {
    send(res, 401, { error: 'Telegram authentication required' });
    return null;
  }
  return user;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'loop-api' });

    const isApi = req.url === '/loops' || req.url === '/me' || req.url?.startsWith('/memory/search') || req.url?.startsWith('/loops/');
    if (!isApi) {
      if (await serveStatic(req, res)) return;
      return send(res, 404, { error: 'Not found' });
    }

    const user = auth(req, res);
    if (!user) return;

    if (req.method === 'GET' && req.url === '/me') return send(res, 200, { id: user.id, mode: user.mode, telegram: user.telegram });
    if (req.method === 'GET' && req.url === '/loops') return send(res, 200, await readLoops(user.id));

    if (req.method === 'GET' && req.url?.startsWith('/memory/search')) {
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const query = url.searchParams.get('q')?.trim() ?? '';
      return send(res, 200, await searchMemory(query, await readLoops(user.id)));
    }

    const match = req.url?.match(/^\/loops\/([^/]+)$/);
    if (req.method === 'PATCH' && match) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return send(res, 413, { error: 'Payload too large' });
      }
      const patch = body ? JSON.parse(body) : {};
      const updated = await updateLoop(match[1], patch, user.id);
      return updated ? send(res, 200, updated) : send(res, 404, { error: 'Loop not found' });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('API request failed:', error);
    return send(res, 500, { error: 'Internal server error' });
  }
});

server.listen(port, () => console.log(`LOOP web + API listening on http://localhost:${port}`));
