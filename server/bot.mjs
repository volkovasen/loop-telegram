import 'dotenv/config';
import { Bot } from 'grammy';
import { classifyMessage } from './classifier.mjs';

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
  const loop = classifyMessage({
    text, author, messageId: message.message_id, chatId: message.chat.id,
    receivedAt: new Date(message.date * 1000).toISOString()
  });

  console.log(JSON.stringify({ event:'open_loop_created', loop }, null, 2));
  const confidence = Math.round(loop.confidence * 100);
  await ctx.reply(`${labels[loop.type]}\n\n${loop.title}\n\nОт: ${author}\nУверенность: ${confidence}%\n\n«${text}»`);
});

bot.catch((error) => console.error('Bot error:', error.error));
console.log('LOOP bot is listening…');
bot.start();
