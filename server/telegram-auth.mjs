import crypto from 'node:crypto';

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function verifyTelegramInitData(initData) {
  const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  const maxAgeSeconds = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE ?? 86400);
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > maxAgeSeconds) return null;

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqual(calculated, hash)) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user?.id) return null;
    return user;
  } catch {
    return null;
  }
}

export function resolveRequestUser(req) {
  const initData = req.headers['x-telegram-init-data'];
  const user = verifyTelegramInitData(typeof initData === 'string' ? initData : '');
  if (user) return { id: String(user.id), telegram: user, mode: 'telegram' };

  if (process.env.NODE_ENV !== 'production') {
    const devId = process.env.LOOP_DEV_USER_ID || 'local-dev';
    return { id: String(devId), telegram: null, mode: 'development' };
  }
  return null;
}
