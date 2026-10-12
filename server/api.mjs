import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SpaceError, addLoopParticipant, createSpace, deleteSpace, editSpace, mergeLoopPlans, undoLastLoopMerge, readLoops, readSpaces, recordSpaceCorrection, rememberMeaningCorrection, removeLoopParticipant, updateLoop } from './store.mjs';
import { meaningPatch } from './meaning-memory.mjs';
import { isConfirmedEvent, supportsDeadline, validDate, validInstant } from './temporal.mjs';
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

    const peopleMatch=req.url?.match(/^\/loops\/([^/]+)\/participants$/);
    if(req.method==='POST' && peopleMatch){
      const input=await readJson(req,2000);
      if(!input || typeof input!=='object' || Array.isArray(input))throw new SpaceError('Неверный участник.');
      return send(res,200,await addLoopParticipant(user.id,decodeURIComponent(peopleMatch[1]),input.name));
    }
    const personDeleteMatch=req.url?.match(/^\/loops\/([^/]+)\/participants\/([^/]+)$/);
    if(req.method==='DELETE' && personDeleteMatch){
      return send(res,200,await removeLoopParticipant(user.id,decodeURIComponent(personDeleteMatch[1]),decodeURIComponent(personDeleteMatch[2])));
    }
    const mergeMatch=req.url?.match(/^\/loops\/([^/]+)\/merge$/);
    if(req.method==='POST' && mergeMatch){
      const input=await readJson(req,2000);
      if(!input || typeof input!=='object' || Array.isArray(input) || typeof input.otherId!=='string')throw new SpaceError('Выбери вторую карточку.');
      return send(res,200,await mergeLoopPlans(user.id,decodeURIComponent(mergeMatch[1]),input.otherId));
    }

    const unmergeMatch=req.url?.match(/^\/loops\/([^/]+)\/unmerge$/);
    if(req.method==='POST' && unmergeMatch) {
      return send(res,200,await undoLastLoopMerge(user.id,decodeURIComponent(unmergeMatch[1])));
    }

    const confirmMatch=req.url?.match(/^\/loops\/([^/]+)\/confirm$/);
    if(req.method==='POST' && confirmMatch){
      const current=(await readLoops(user.id)).find(item=>item.id===decodeURIComponent(confirmMatch[1]));
      if(!current || current.mergedInto)return send(res,404,{error:'Карточка не найдена.'});
      if(current.kind!=='plan' || !['proposed','unknown'].includes(current.agreementStatus) || ['done','dismissed'].includes(current.status))
        throw new SpaceError('Можно подтвердить только открытую договорённость.');
      const updated=await updateLoop(current.id,{
        type:'event',kind:'plan',agreementStatus:'confirmed',
        nextAction:'none',nextActionText:null,status:'open'
      },user.id);
      return send(res,200,updated);
    }

    const scheduleMatch = req.url?.match(/^\/loops\/([^/]+)\/schedule$/);
    if (req.method === 'POST' && scheduleMatch) {
      const body = await readJson(req, 2000);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SpaceError('Неверный формат срока.');
      const current = (await readLoops(user.id)).find(item => item.id === decodeURIComponent(scheduleMatch[1]));
      if (!current || current.mergedInto) return send(res, 404, { error: 'Карточка не найдена.' });
      const kind = body.kind;
      if (kind !== 'deadline' && kind !== 'event') throw new SpaceError('Неизвестный тип даты.');
      if (kind === 'deadline' && !supportsDeadline(current)) throw new SpaceError('Для этой карточки нельзя задать срок.');
      if (kind === 'event' && !isConfirmedEvent(current)) throw new SpaceError('Сначала подтверди встречу.');
      const date = body.date === null || body.date === '' ? null : body.date;
      const at = body.at === null || body.at === '' ? null : body.at;
      if (date !== null && !validDate(date)) throw new SpaceError('Неверная дата.');
      if (at !== null && (!validInstant(at) || !date)) throw new SpaceError('Неверное время.');
      const patch = kind === 'deadline'
        ? { deadlineDate: date, deadlineAt: at, dueAt: null, remindedAt: null }
        : { eventDate: date, eventAt: at, dueAt: null, remindedAt: null };
      const updated = await updateLoop(current.id, patch, user.id);
      return send(res, 200, updated);
    }

    const correctionMatch = req.url?.match(/^\/loops\/([^/]+)\/correct$/);
    if(req.method==='POST' && correctionMatch) {
      const body=await readJson(req,4000);
      if(!body || typeof body!=='object' || Array.isArray(body))throw new SpaceError('Ожидался JSON-объект.');
      const id=decodeURIComponent(correctionMatch[1]);
      const old=(await readLoops(user.id)).find(item=>item.id===id);
      if(!old || old.mergedInto)return send(res,404,{error:'Карточка не найдена'});
      let patch;
      try{patch=meaningPatch(body.choice,body.title,old);}
      catch(error){throw new SpaceError(error.message);}
      const updated=await updateLoop(id,patch,user.id);
      if(!updated)return send(res,404,{error:'Карточка не найдена'});
      // Best-effort learning must never undo a correctly saved manual edit.
      try{await rememberMeaningCorrection(user.id,updated);}
      catch(error){console.error('Could not store meaning correction:',error);}
      return send(res,200,updated);
    }

    const match = req.url?.match(/^\/loops\/([^/]+)$/);
    if (req.method === 'PATCH' && match) {
      const input = await readJson(req, 2000);
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new SpaceError('Ожидался JSON-объект.');
      const id=decodeURIComponent(match[1]);
      const before=(await readLoops(user.id)).find(item=>item.id===id);
      if(!before || before.mergedInto)return send(res,404,{error:'Карточка не найдена.'});
      // Source, users, seed tags, links, AI confidence and dates are
      // deliberately not mutable through the generic endpoint.
      const allowed=new Set(['space','spaceConfidence','status','completedAt','snoozedUntil','remindedAt']);
      if(!Object.keys(input).length || Object.keys(input).some(key=>!allowed.has(key)))
        throw new SpaceError('Это поле карточки нельзя изменять напрямую.');
      const patch={...input};
      if(Object.hasOwn(patch,'space')){
        if(patch.space!==null && (typeof patch.space!=='string' || !(await readSpaces(user.id)).some(item=>item.name===patch.space)))
          throw new SpaceError('Такого Space нет.');
        patch.spaceConfidence=patch.space?1:0;
      }else if(Object.hasOwn(patch,'spaceConfidence'))throw new SpaceError('Уверенность темы нельзя менять отдельно.');
      if(Object.hasOwn(patch,'status')){
        if(!['open','done','snoozed','dismissed'].includes(patch.status))throw new SpaceError('Недопустимый статус.');
        if(patch.status==='done'){
          patch.completedAt=new Date().toISOString();
          patch.snoozedUntil=null;
        }else if(patch.status==='snoozed'){
          if(!validInstant(patch.snoozedUntil)||Date.parse(patch.snoozedUntil)<=Date.now())
            throw new SpaceError('Выбери будущее время откладывания.');
          patch.completedAt=null;
          patch.remindedAt=null;
        }else{
          patch.completedAt=null;
          patch.snoozedUntil=null;
        }
      }else if(['completedAt','snoozedUntil','remindedAt'].some(key=>Object.hasOwn(patch,key)))
        throw new SpaceError('Дату действия можно изменить только вместе со статусом.');
      const updated=await updateLoop(id,patch,user.id);
      if(updated && Object.hasOwn(input,'space') && before.space!==updated.space)
        await recordSpaceCorrection(user.id,updated.space,updated.source?.text,updated.source?.authorName);
      return updated?send(res,200,updated):send(res,404,{error:'Карточка не найдена.'});
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof SpaceError) return send(res, error.status, { error: error.message });
    console.error('API request failed:', error);
    return send(res, 500, { error: 'Internal server error' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`LOOP web + API listening on port ${port}`));
