import http from 'node:http';
import { readLoops, updateLoop } from './store.mjs';

const port = Number(process.env.PORT ?? 8787);

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (req.method === 'GET' && req.url === '/loops') {
    return send(res, 200, await readLoops());
  }

  const match = req.url?.match(/^\/loops\/([^/]+)$/);
  if (req.method === 'PATCH' && match) {
    let body = '';
    for await (const chunk of req) body += chunk;
    const patch = body ? JSON.parse(body) : {};
    const updated = await updateLoop(match[1], patch);
    return updated ? send(res, 200, updated) : send(res, 404, { error: 'Loop not found' });
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(port, () => console.log(`LOOP API listening on http://localhost:${port}`));
