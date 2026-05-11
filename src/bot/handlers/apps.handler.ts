import { type Bot } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import {
  platforms,
  PLATFORM_SELECTION_TEXT,
  formatPlatformMessage,
  type PlatformKey,
} from '../content/apps.content';
import { platformSelectionKeyboard, backKeyboard } from '../keyboards/apps.keyboard';

const PLATFORM_KEYS = new Set<string>(['android', 'ios', 'windows', 'mac', 'linux']);

export function registerAppsHandler(bot: Bot<BotContext>): void {
  // Main menu button → send platform selection screen
  bot.hears(MENU.APPS, async (ctx) => {
    await ctx.reply(PLATFORM_SELECTION_TEXT, {
      parse_mode: 'Markdown',
      reply_markup: platformSelectionKeyboard(),
    });
  });

  // Inline keyboard callbacks: platform selection + back
  bot.callbackQuery(/^apps:/, async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === 'apps:back') {
      await ctx.editMessageText(PLATFORM_SELECTION_TEXT, {
        parse_mode: 'Markdown',
        reply_markup: platformSelectionKeyboard(),
      });
      await ctx.answerCallbackQuery();
      return;
    }

    const key = data.slice('apps:'.length);

    if (!PLATFORM_KEYS.has(key)) {
      await ctx.answerCallbackQuery('❌ پلتفرم ناشناخته');
      return;
    }

    const platform = platforms[key as PlatformKey];

    await ctx.editMessageText(formatPlatformMessage(platform), {
      parse_mode: 'Markdown',
      reply_markup: backKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });
}
