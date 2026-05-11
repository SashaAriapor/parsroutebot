import { type Bot } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { mainMenuKeyboard } from '../keyboards/user.keyboard';
import { logger } from '../../lib/logger';

export function registerStartHandler(bot: Bot<BotContext>): void {
  bot.command('start', async (ctx) => {
    const firstName = ctx.from?.first_name ?? 'کاربر';

    // Parse referral code from deep-link payload: /start ref_XXXXXXXX
    const payload = ctx.match;
    if (typeof payload === 'string' && payload.startsWith('ref_')) {
      const referralCode = payload.slice(4);
      logger.info({ userId: ctx.from?.id, referralCode }, 'Start with referral code (not processed yet)');
    }

    await ctx.reply(`سلام ${firstName} 👋\nبه ربات ما خوش اومدی!`, {
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.hears(MENU.BUY, (ctx) => ctx.reply('🚧 به‌زودی...'));
  bot.hears(MENU.WALLET, (ctx) => ctx.reply('🚧 به‌زودی...'));
  bot.hears(MENU.INVITE, (ctx) => ctx.reply('🚧 به‌زودی...'));
}
