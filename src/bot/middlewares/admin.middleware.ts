import { type Middleware } from 'grammy';
import { type BotContext } from '../types';
import { config } from '../../lib/config';
import { logger } from '../../lib/logger';

export const adminMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;

  logger.info({ from: userId, adminIds: config.ADMIN_IDS }, '🟦 [TRACE adminMiddleware] entry');

  if (!userId || !config.ADMIN_IDS.includes(userId)) {
    logger.warn({ from: userId, adminIds: config.ADMIN_IDS }, '🟥 [TRACE adminMiddleware] BLOCKED — not admin, dropping update');
    // Answer callback queries silently so Telegram stops the loading indicator.
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
    }
    return;
  }

  logger.info({ from: userId }, '🟩 [TRACE adminMiddleware] is admin → next()');
  await next();
};
