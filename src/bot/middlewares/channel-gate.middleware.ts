import { type Middleware } from 'grammy';
import { type BotContext } from '@/bot/types';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { redis } from '@/db/redis';
import { settingsService } from '@/services/settings.service';

export const channelGateMiddleware: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.from) return next();
  if (config.ADMIN_IDS.includes(ctx.from.id)) return next();

  // Let gate:check through so it can verify membership itself
  if (ctx.callbackQuery?.data === 'gate:check') return next();

  const channelId = await settingsService.get('REQUIRED_CHANNEL_ID');
  if (!channelId) return next();

  const cacheKey = `channel_member:${ctx.from.id}`;
  const cached = await redis.get(cacheKey);
  if (cached === 'true') return next();

  try {
    const member = await ctx.api.getChatMember(channelId, ctx.from.id);
    const isMember = ['member', 'administrator', 'creator'].includes(member.status);

    if (isMember) {
      await redis.set(cacheKey, 'true', 'EX', 600);
      return next();
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to check channel membership');
    return next();
  }

  const channelUsername = await settingsService.get('REQUIRED_CHANNEL_USERNAME');
  const handle = channelUsername?.replace('@', '') ?? '';
  const message = `⛔️ برای استفاده از ربات ابتدا باید عضو کانال ما بشی.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📢 عضویت در کانال', url: `https://t.me/${handle}` }],
      [{ text: '✅ عضو شدم', callback_data: 'gate:check' }],
    ],
  };

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: '⛔️ ابتدا عضو کانال شو', show_alert: true });
  }

  await ctx.reply(message, { reply_markup: keyboard });
};
