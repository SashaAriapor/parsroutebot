import { type Middleware } from 'grammy';
import { type BotContext } from '../types';
import { userService } from '../../services/user.service';
import { config } from '../../lib/config';
import { logger } from '../../lib/logger';

export const userSyncMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const from = ctx.from;

  if (!from || from.is_bot) {
    await next();
    return;
  }

  try {
    ctx.dbUser = await userService.upsert({
      id: BigInt(from.id),
      username: from.username ?? null,
      firstName: from.first_name,
      languageCode: from.language_code ?? null,
    });
  } catch (err) {
    logger.error({ err, userId: from.id }, 'Failed to sync user to DB');
  }

  // Silently block banned users (admins are always allowed through)
  if (ctx.dbUser?.isBanned && !config.ADMIN_IDS.includes(from.id)) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => {});
    }
    return;
  }

  await next();
};
