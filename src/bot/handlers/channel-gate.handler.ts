import { type Bot } from 'grammy';
import { type BotContext } from '@/bot/types';
import { logger } from '@/lib/logger';
import { redis } from '@/db/redis';
import { settingsService } from '@/services/settings.service';

export function registerChannelGateHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery('gate:check', async (ctx) => {
    const channelId = await settingsService.get('REQUIRED_CHANNEL_ID');
    if (!channelId) {
      await ctx.answerCallbackQuery();
      return;
    }

    const cacheKey = `channel_member:${ctx.from.id}`;

    try {
      const member = await ctx.api.getChatMember(channelId, ctx.from.id);
      const isMember = ['member', 'administrator', 'creator'].includes(member.status);

      if (isMember) {
        await redis.set(cacheKey, 'true', 'EX', 600);
        await ctx.editMessageText('✅ عضویت تایید شد! حالا می‌تونی از ربات استفاده کنی.');
        await ctx.answerCallbackQuery({ text: '✅ خوش اومدی!' });
      } else {
        await ctx.answerCallbackQuery({ text: '❌ هنوز عضو کانال نشدی.', show_alert: true });
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to check channel membership (gate:check)');
      await ctx.answerCallbackQuery({ text: 'خطا در بررسی عضویت. دوباره امتحان کن.' });
    }
  });
}
