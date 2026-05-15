import { type Middleware } from 'grammy';
import { type BotContext } from '@/bot/types';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

const WINDOW_MS = 10_000;
const MAX_REQUESTS = 20;

const counts = new Map<number, { count: number; windowStart: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of counts.entries()) {
    if (now - entry.windowStart > WINDOW_MS * 2) {
      counts.delete(id);
    }
  }
}, 5 * 60 * 1000);

export const rateLimitMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (config.ADMIN_IDS.includes(userId)) return next();

  const now = Date.now();
  const entry = counts.get(userId);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    counts.set(userId, { count: 1, windowStart: now });
    return next();
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    logger.warn({ userId }, 'Rate limit exceeded');
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: '⚠️ خیلی سریع! کمی صبر کن.', show_alert: false });
    }
    return;
  }

  return next();
};
