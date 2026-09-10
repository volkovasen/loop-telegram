import 'dotenv/config';
import { Bot } from 'grammy';
import { classifyMessage } from './classifier.mjs';
import { classifyWithAI } from './ai-classifier.mjs';
import { addLoop } from './store.mjs';

const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is missing in .env');
const bot = new Bot(token);

function originName(message) {
  const origin = message.forward_origin;
  if (!origin) return undefined;
  if (origin.type === 'user') return [origin.sender_user.first_name, origin.sender_user.last_name].filter(Boolean).join(' ');
  if (origin.type === 'hidden_user') return origin.sender_user_name;
  if (origin.type === 'chat') return origin.sender_chat.title;
  if (origin.type === 'channel') return origin.chat.title;
}

const labels = { reply:'🔴 Нужно ответить', todo:'✅ Нужно сделать', waiting:'🟡 Ждёшь', event:'📅 Событие', saved:'🔖 Сохранено' };

bot.command('start', (ctx) => ctx.reply('LOOP включён. Перешли мне сообщение, которое нельзя потерять.'));

bot.on('message', async (ctx) => {
  const message = ctx.message;
  const text = message.text ?? message.caption;
  if (!text) return ctx.reply('Пока беру текстовые сообщения. Голосовые и файлы добавим следующим слоем.');
  if (!message.forward_origin) return ctx.reply('Для первого теста перешли мне чужое сообщение.');

  const author = originName(message) ?? 'Неизвестный отправитель';
  const input = { text, author, messageId: message.message_id, chatId: message.chat.id, receivedAt: new Date(message.date * 1000).toISOString() };

  let loops;
  try {
    loops = await classifyWithAI(input);
  } catch (error) {
    console.error('AI classifier failed, using fallback:', error);
  }
  if (!loops) loops = [classifyMessage(input)];

  if (loops.length === 0) return ctx.reply('Похоже, здесь нет незакрытого дела. Ничего не добавил.');

  for (const loop of loops) await addLoop(loop);
  console.log(JSON.stringify({ event:'open_loops_created', loops }, null, 2));

  const summary = loops.map((loop) => `${labels[loop.type]}\n${loop.title} · ${Math.round(loop.confidence * 100)}%`).join('\n\n');
  await ctx.reply(`${loops.length > 1 ? `Нашёл ${loops.length} вещи` : 'Нашёл'}:\n\n${summary}\n\nОт: ${author}\n«${text}»`);
});

bot.catch((error) => console.error('Bot error:', error.error));
console.log(`LOOP bot is listening… classifier=${process.env.OPENAI_API_KEY ? 'AI' : 'fallback'}`);
bot.start();
