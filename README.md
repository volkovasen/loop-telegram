# LOOP

Telegram Attention Layer: сообщения → незакрытые договорённости → действие.

## P0

Первый вертикальный сценарий:

`forwarded Telegram message → Open Loop → Today → Done`

Типы Open Loop:
- `reply` — нужно ответить
- `todo` — нужно сделать
- `waiting` — ждём от другого человека
- `event` — договорённость/событие
- `saved` — сохранить на потом

Bot: `@loop_attention_bot`

## Принципы

- Исходное сообщение (evidence) хранится вместе с Open Loop.
- Одно сообщение может породить 0, 1 или несколько loops.
- Не превращаем каждую фразу в задачу: используем confidence.
- Сначала Forward Mode; passive/Secretary Mode подключаем после работающего P0.
