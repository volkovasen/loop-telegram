import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { learnedSpaceFor } from '../server/space-rules.mjs';
import { classifyMessage } from '../server/classifier.mjs';

test('Spaces are private, editable and preserve tasks across rename/delete', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-spaces-'));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  });
  // The store resolves its storage directory at import time.
  const store = await import(`../server/store.mjs?tests=${Date.now()}`);
  const userA = '10001';
  const userB = '10002';
  const defaults = await store.readSpaces(userA);
  assert.deepEqual(defaults.map(x => x.name), ['Дом', 'Работа', 'Личное']);
  assert.equal(defaults.every(x => x.isDefault), true);

  const football = await store.createSpace(userA, { name: 'Футбол', description: 'Игры с друзьями, футбол, матчи и тренировки.' });
  assert.equal((await store.readSpaces(userA)).length, 4);
  assert.equal((await store.readSpaces(userB)).length, 3);
  await assert.rejects(() => store.createSpace(userA, { name: 'футбол', description: 'Другая тема с тем же именем.' }), /существует/i);
  await assert.rejects(() => store.deleteSpace(userB, football.id), /не найден/i);
  await assert.rejects(() => store.deleteSpace(userA, 'default-work'), /не найден/i);

  const loop = {
    id: 'loop-football-1', ownerId: userA, type: 'event', title: 'Игра завтра в девять',
    status: 'open', confidence: 0.92, space: null, source: {
      messageId: 42, chatId: userA, receivedAt: new Date().toISOString(),
      text: 'Завтра игра в девять, приходи!', authorName: 'Саша'
    }, createdAt: new Date().toISOString()
  };
  await store.addLoop(loop);
  await store.updateLoop(loop.id, { space: football.name, spaceConfidence: 1 }, userA);
  await store.recordSpaceCorrection(userA, football.name, loop.source.text, loop.source.authorName);
  const learned = await store.readSpaces(userA);
  assert.equal(learnedSpaceFor(loop.source.text, 'Саша', learned), 'Футбол');
  assert.equal(learnedSpaceFor(loop.source.text, 'Маша', learned), null);
  assert.equal(learnedSpaceFor(loop.source.text, 'Саша', await store.readSpaces(userB)), null);

  const fallback = classifyMessage({ text: loop.source.text, author: 'Саша', messageId: 43, receivedAt: loop.source.receivedAt, spaces: learned });
  assert.equal(fallback.space, 'Футбол');
  assert.equal(fallback.spaceConfidence, 1);
  const uncertain = classifyMessage({ text: 'Собрание завтра в девять', author: 'Саша', messageId: 44, receivedAt: loop.source.receivedAt, spaces: learned });
  assert.equal(uncertain.space, null);
  assert.equal(uncertain.spaceConfidence, 0);

  const renamed = await store.editSpace(userA, football.id, { name: 'Команда', description: 'Футбольные матчи, тренировки и игры команды.' });
  assert.equal(renamed.name, 'Команда');
  assert.equal((await store.readLoops(userA))[0].space, 'Команда');
  assert.equal(learnedSpaceFor(loop.source.text, 'Саша', await store.readSpaces(userA)), 'Команда');

  // Moving a message removes the stale correction from its previous space.
  await store.recordSpaceCorrection(userA, 'Личное', loop.source.text, 'Саша');
  assert.equal(learnedSpaceFor(loop.source.text, 'Саша', await store.readSpaces(userA)), 'Личное');
  await store.recordSpaceCorrection(userA, null, loop.source.text, 'Саша');
  assert.equal(learnedSpaceFor(loop.source.text, 'Саша', await store.readSpaces(userA)), null);

  await store.deleteSpace(userA, football.id);
  const after = (await store.readLoops(userA))[0];
  assert.equal(after.space, null);
  assert.equal(after.title, loop.title);
  assert.equal(after.source.text, loop.source.text);
  assert.equal((await store.readSpaces(userA)).length, 3);
});
