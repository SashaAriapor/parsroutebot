import { type Middleware } from 'grammy';
import { type BotContext } from '../types';
import { config } from '../../lib/config';

export const adminMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId || !config.ADMIN_IDS.includes(userId)) {
    // Answer callback queries silently so Telegram stops the loading indicator.
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
    }
    return;
  }

  await next();
};
