import 'dotenv/config';
import { Bot } from 'grammy';
import { classifyMessage } from './classifier.mjs';
import { classifyWithAI } from './ai-classifier.mjs';
import { addLoop } from './store.mjs';
import { transcribeTelegramFile } from './transcribe.mjs';

const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is missing in .env');
const bot = new Bot(token);

function cleanName(value) {
  const name = value?.trim();
  return name || undefined;
}

function originPerson(message) {
  const origin = message.forward_origin;
  if (!origin) return undefined;
  if (origin.type === 'user') {
    const telegramName = cleanName([origin.sender_user.first_name, origin.sender_user.last_name].filter(Boolean).join(' '));
    return { telegramUserId: origin.sender_user.id, name: telegramName ?? origin.sender_user.username ?? 'Контакт из Telegram', username: origin.sender_user.username, nameSource: 'telegram' };
  }
  if (origin.type === 'hidden_user') return { name: cleanName(origin.sender_user_name) ?? 'Контакт из Telegram', nameSource: 'telegram' };
  if (origin.type === 'chat') return { name: origin.sender_chat.title, username: origin.sender_chat.username, nameSource: 'telegram' };
  if (origin.type === 'channel') return { name: origin.chat.title, username: origin.chat.username, nameSource: 'telegram' };
}

const labels = { reply: '🔴 Нужно ответить', todo: '✅ Нужно сделать', waiting: '🟡 Ждёшь', event: '📅 Событие', saved: '🔖 В память' };

function mediaInfo(message) {
  if (message.voice) return { fileId: message.voice.file_id, mimeType: message.voice.mime_type ?? 'audio/ogg', fileName: 'voice.ogg', kind: 'voice' };
  if (message.video_note) return { fileId: message.video_note.file_id, mimeType: 'video/mp4', fileName: 'video-note.mp4', kind: 'video_note' };
  if (message.audio) return { fileId: message.audio.file_id, mimeType: message.audio.mime_type ?? 'audio/mpeg', fileName: message.audio.file_name ?? 'audio.mp3', kind: 'audio' };
  return undefined;
}

async function processMeaning(ctx, text, mediaKind) {
  const message = ctx.message;
  if (!message.forward_origin) return ctx.reply('Для первого теста перешли мне чужое сообщение или голосовое.');
  const person = originPerson(message);
  const author = person?.name ?? 'Контакт из Telegram';
  const input = { text, author, person, messageId: message.message_id, chatId: message.chat.id, receivedAt: new Date(message.date * 1000).toISOString() };

  let loops;
  try { loops = await classifyWithAI(input); } catch (error) { console.error('AI classifier failed, using fallback:', error); }
  if (!loops) {
    const fallback = classifyMessage(input);
    loops = [{ ...fallback, person, space: 'Личное' }];
  }
  if (loops.length === 0) return ctx.reply(`Разобрал${mediaKind ? ' голосовое' : ' сообщение'}, но незакрытых дел или полезной памяти не нашёл.${mediaKind ? `\n\nРасшифровка: «${text}»` : ''}`);

  for (const loop of loops) {
    loop.source = { ...loop.source, mediaKind, transcript: mediaKind ? text : undefined };
    await addLoop(loop);
  }
  console.log(JSON.stringify({ event: 'open_loops_created', mediaKind, loops }, null, 2));
  const summary = loops.map((loop) => `${labels[loop.type]}\n${loop.title}${loop.space ? ` · ${loop.space}` : ''}${loop.dueAt ? `\n⏰ ${new Date(loop.dueAt).toLocaleString('ru-RU')}` : ''}`).join('\n\n');
  await ctx.reply(`${loops.length > 1 ? `Нашёл ${loops.length} вещи` : 'Нашёл'}:\n\n${summary}\n\nОт: ${author}${mediaKind ? `\n\n🎙 «${text}»` : `\n«${text}»`}`);
}

bot.command('start', (ctx) => ctx.reply('LOOP включён. Перешли сообщение или голосовое, которое нельзя потерять.'));

bot.on('message', async (ctx) => {
  const message = ctx.message;
  const media = mediaInfo(message);
  if (media) {
    if (!message.forward_origin) return ctx.reply('Перешли мне чужое голосовое или кружок, и я разберу его по смыслу.');
    const status = await ctx.reply('🎙 Слушаю и разбираю по смыслу…');
    try {
      const transcript = await transcribeTelegramFile({ bot, ...media });
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
      return processMeaning(ctx, transcript, media.kind);
    } catch (error) {
      console.error('Transcription failed:', error);
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
      return ctx.reply('Не смог разобрать аудио. Попробуй переслать ещё раз.');
    }
  }

  const text = message.text ?? message.caption;
  if (!text) return ctx.reply('Сейчас понимаю текст, голосовые, аудио и кружки. Файлы без текста пока просто не сохраняю.');
  return processMeaning(ctx, text);
});

bot.catch((error) => console.error('Bot error:', error.error));
console.log(`LOOP bot is listening… classifier=${process.env.GROQ_API_KEY ? 'Groq AI + Whisper' : 'fallback'}`);
bot.start();
