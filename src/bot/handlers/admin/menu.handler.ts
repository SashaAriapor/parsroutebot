import { type Bot, Composer } from 'grammy';
import { type BotContext } from '../../types';
import { adminMenuKeyboard } from '../../keyboards/admin.keyboard';
import { adminMiddleware } from '../../middlewares/admin.middleware';

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  // All admin handlers are gated behind adminMiddleware via this Composer.
  const admin = new Composer<BotContext>(adminMiddleware);

  admin.command('admin', async (ctx) => {
    await ctx.reply('پنل مدیریت 🔧', {
      reply_markup: adminMenuKeyboard(),
    });
  });

  admin.callbackQuery(/^admin:/, async (ctx) => {
    await ctx.answerCallbackQuery('🚧 به‌زودی');
  });

  bot.use(admin);
}
