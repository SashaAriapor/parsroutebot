import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { type BotContext, type SessionData } from './types';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { userSyncMiddleware } from './middlewares/user-sync.middleware';
import { registerStartHandler } from './handlers/start.handler';
import { registerAdminHandlers } from './handlers/admin/menu.handler';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.BOT_TOKEN);

  // Session must be registered before conversations.
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());

  // Sync every non-bot user to DB before any handler runs.
  bot.use(userSyncMiddleware);

  registerStartHandler(bot);
  registerAdminHandlers(bot);

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx.update }, 'Unhandled bot error');
  });

  return bot;
}
