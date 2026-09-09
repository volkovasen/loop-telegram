import 'dotenv/config';
import { Bot } from 'grammy';

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

bot.command('start', async (ctx) => {
  await ctx.reply('LOOP включён. Перешли мне сообщение, которое нельзя потерять.');
});

bot.on('message', async (ctx) => {
  const message = ctx.message;
  const text = message.text ?? message.caption;
  if (!text) {
    await ctx.reply('Пока беру текстовые сообщения. Голосовые и файлы добавим следующим слоем.');
    return;
  }

  const author = originName(message) ?? 'Неизвестный отправитель';
  const forwarded = Boolean(message.forward_origin);

  console.log(JSON.stringify({
    event: 'telegram_message', messageId: message.message_id, chatId: message.chat.id,
    forwarded, author, text, receivedAt: new Date(message.date * 1000).toISOString()
  }, null, 2));

  await ctx.reply(forwarded
    ? `Поймал.\n\nОт: ${author}\n«${text}»\n\nСледующий шаг: превращу это в Open Loop.`
    : `Поймал сообщение:\n«${text}»\n\nДля первого теста лучше перешли мне чужое сообщение.`);
});

bot.catch((error) => console.error('Bot error:', error.error));
console.log('LOOP bot is listening…');
bot.start();
