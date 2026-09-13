# LOOP

**Telegram Attention Layer**: сообщения → незакрытые договорённости → действие и память.

LOOP не пытается стать ещё одним task manager. Он отвечает на вопрос: **что из Telegram реально требует моего внимания и что я захочу вспомнить позже?**

## Что уже работает

- Forward Mode: пересылка чужих Telegram-сообщений боту.
- Текст, voice, audio и video note / кружки.
- Groq Whisper → транскрипт → смысловые объекты.
- Одно сообщение может породить несколько объектов.
- Типы: `reply`, `todo`, `waiting`, `event`, `saved`.
- Извлечение даты/времени и Spaces: Дом / Работа / Личное.
- Today: активные хвосты, Done, snooze до завтра.
- People: незакрытое, сохранённое и история по человеку.
- Memory: гибридный локальный + AI поиск по словам и смыслу.
- Evidence: исходное сообщение / транскрипт хранится рядом с объектом.
- Google Calendar template для событий.
- Telegram Mini App auth через проверенный `initData`.
- Данные разделены по Telegram user id.
- Mini App и API могут работать с одного Node-процесса.

Bot: `@loop_attention_bot`

## Локальная разработка

```bash
cp .env.example .env
npm install
npm run build
```

Три терминала для разработки:

```bash
npm run bot
npm run api
npm run dev
```

Локальный браузер работает без Telegram auth. Если `LOOP_DEV_USER_ID` не задан, dev API показывает все локальные тестовые записи. В production такого fallback нет.

## Production

Нужны минимум:

- `BOT_TOKEN`
- `GROQ_API_KEY`
- `WEB_APP_URL=https://...`
- `NODE_ENV=production`
- `CORS_ORIGIN=https://...`

Сборка и запуск:

```bash
npm ci
npm run build
npm start
```

`npm start` поднимает одновременно:

- Telegram bot long polling;
- API;
- собранный Mini App из `dist/`.

Проверка сервиса:

```text
GET /health
```

После запуска бот сам ставит `/app`, `/help` и кнопку Mini App, если задан `WEB_APP_URL`.

## Безопасность

- `.env` и `server/data/` не коммитятся.
- Production API не принимает запросы без валидного Telegram Mini App `initData`.
- Пользователь видит и меняет только свои объекты.
- `ownerId` нельзя поменять через PATCH.
- Запись JSON делается атомарно и последовательно, чтобы параллельные сообщения не перетирали данные.

> Текущее JSON-хранилище подходит для закрытой беты. Перед массовым публичным запуском его нужно заменить на постоянную БД с резервными копиями, не меняя продуктовую модель.

## Product boundary

Сейчас сознательно не делаем:

- автоответы от имени пользователя;
- CRM с полями и воронками;
- канбан / проекты;
- Gmail / Notion / Slack;
- фейковый доступ к телефонной книге Telegram;
- passive capture без отдельного privacy-дизайна.

Следующий инфраструктурный слой после закрытой беты: Telegram Chat Automation / Secretary Mode и нормальная production DB.
