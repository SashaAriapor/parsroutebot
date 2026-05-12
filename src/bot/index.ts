import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { type BotContext, type SessionData } from './types';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
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
    logger.error({ err: err.error, ctx: err.ctx.update }, 'Unhandled bot error');
  });

  return bot;
}
