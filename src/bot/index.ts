import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { type BotContext, type SessionData } from './types';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

// ─── TRACE ──────────────────────────────────────────────────────────────────
import { userSyncMiddleware } from './middlewares/user-sync.middleware';
import { registerStartHandler } from './handlers/start.handler';
import { registerAdminHandlers } from './handlers/admin/menu.handler';
import { registerAdminStatsHandler } from './handlers/admin/stats.handler';
import { registerAdminSettingsHandler } from './handlers/admin/settings.handler';
import { registerAdminToolsHandler } from './handlers/admin/tools.handler';
import { registerBroadcastHandler } from './handlers/admin/broadcast.handler';
import { registerDiscountCreateHandler } from './handlers/admin/discount-create.handler';
import { registerAppsHandler } from './handlers/apps.handler';
import { registerSupportHandler } from './handlers/support.handler';
import { registerSupportReplyHandler } from './handlers/admin/support-reply.handler';
import { registerAdminUsersHandler } from './handlers/admin/users.handler';
import { registerMyServicesHandler } from './handlers/my-services.handler';
import { registerBuyHandler } from './handlers/buy.handler';
import { registerInviteHandler } from './handlers/invite.handler';
import { registerWalletHandler } from './handlers/wallet.handler';
import { supportMessageConversation, supportFollowupConversation } from './conversations/support-message.conversation';

// Module-level bot singleton — set by createBot(), used by services via dynamic import
export let bot!: Bot<BotContext>;

export function createBot(): Bot<BotContext> {
  const _bot = new Bot<BotContext>(config.BOT_TOKEN);
  bot = _bot;

  // ─── TRACE: global entry point (must be FIRST bot.use) ───────────────────
  bot.use(async (ctx, next) => {
    logger.info({
      from: ctx.from?.id,
      fromUsername: ctx.from?.username,
      text: ctx.message?.text,
      callbackData: ctx.callbackQuery?.data,
      updateId: ctx.update.update_id,
      updateType: Object.keys(ctx.update).filter(k => k !== 'update_id')[0],
    }, '🔵 UPDATE RECEIVED at bot entry');
    await next();
    logger.info({ from: ctx.from?.id, updateId: ctx.update.update_id }, '🟪 UPDATE finished entire chain');
  });

  // Session must be registered before conversations.
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());

  // Register conversations before handlers that enter them.
  bot.use(createConversation(supportMessageConversation, 'supportMessage'));
  bot.use(createConversation(supportFollowupConversation, 'supportFollowup'));

  // Sync every non-bot user to DB before any handler runs.
  bot.use(userSyncMiddleware);

  // Admin reply uses pending-state (not conversations) — register BEFORE
  // bot.hears handlers so its message:text listener has first pick.
  registerSupportReplyHandler(bot);
  registerAdminUsersHandler(bot); // message:text for admin input, before bot.hears
  registerBuyHandler(bot);   // message:text for discount input, before bot.hears
  registerWalletHandler(bot); // message:text for custom topup amount, before bot.hears

  registerStartHandler(bot);
  registerMyServicesHandler(bot);
  registerInviteHandler(bot);
  registerAppsHandler(bot);
  registerSupportHandler(bot);
  registerAdminHandlers(bot);
  registerAdminStatsHandler(bot);
  registerAdminSettingsHandler(bot);
  registerAdminToolsHandler(bot);
  registerBroadcastHandler(bot);
  registerDiscountCreateHandler(bot);

  bot.catch((err) => {
    logger.error({
      err: err.error,
      from: err.ctx.from?.id,
      fromUsername: err.ctx.from?.username,
      text: err.ctx.message?.text,
      updateId: err.ctx.update.update_id,
    }, '🔴 [TRACE bot.catch] UNHANDLED ERROR in update');
  });

  return bot;
}
