import { type Middleware } from 'grammy';
import { type BotContext } from '../types';
import { userService } from '../../services/user.service';
import { config } from '../../lib/config';
import { logger } from '../../lib/logger';

export const userSyncMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const from = ctx.from;

  logger.info({ from: from?.id, fromUsername: from?.username, is_bot: from?.is_bot }, '🟦 [TRACE userSync] entry');

  if (!from || from.is_bot) {
    logger.info({ from: from?.id }, '🟩 [TRACE userSync] no-from or is_bot → next()');
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
    logger.info({ from: from.id, dbUserId: ctx.dbUser?.id?.toString(), isBanned: ctx.dbUser?.isBanned }, '🟦 [TRACE userSync] upsert done');
  } catch (err) {
    logger.error({ err, userId: from.id }, 'Failed to sync user to DB');
  }

  // Silently block banned users (admins are always allowed through)
  const isAdmin = config.ADMIN_IDS.includes(from.id);
  const isBanned = ctx.dbUser?.isBanned ?? false;

  logger.info({ from: from.id, isAdmin, isBanned }, '🟦 [TRACE userSync] ban check');

  if (isBanned && !isAdmin) {
    logger.warn({ from: from.id }, '🟥 [TRACE userSync] BLOCKED — user is banned');
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => {});
    }
    return;
  }

  logger.info({ from: from.id }, '🟩 [TRACE userSync] exit → next()');
  await next();
};
