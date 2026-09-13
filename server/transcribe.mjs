const apiKey = process.env.GROQ_API_KEY;

export async function transcribeTelegramFile({ bot, fileId, mimeType = 'audio/ogg', fileName = 'telegram-audio.ogg' }) {
  if (!apiKey) throw new Error('GROQ_API_KEY is missing');

  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error('Telegram returned no file_path');

  const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  const telegramResponse = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!telegramResponse.ok) throw new Error(`Telegram file download ${telegramResponse.status}`);
  const audio = await telegramResponse.arrayBuffer();

  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), fileName);
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!response.ok) throw new Error(`Groq transcription ${response.status}: ${await response.text()}`);
  const result = await response.json();
  const text = result.text?.trim();
  if (!text) throw new Error('Groq returned empty transcription');
  return text;
}
