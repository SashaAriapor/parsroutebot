import { type Bot, Composer } from 'grammy';
import { type BotContext } from '../../types';
import { adminMenuKeyboard } from '../../keyboards/admin.keyboard';
import { adminMiddleware } from '../../middlewares/admin.middleware';

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>(adminMiddleware);

  admin.command('admin', async (ctx) => {
    await ctx.reply('پنل مدیریت 🔧', { reply_markup: adminMenuKeyboard() });
  });

  // Back to main admin menu from any sub-section
  admin.callbackQuery('admin:back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('پنل مدیریت 🔧', { reply_markup: adminMenuKeyboard() });
  });

  bot.use(admin);
}
