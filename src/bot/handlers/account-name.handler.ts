import { type Bot } from 'grammy';
import { type BotContext } from '../types';
import { getUserPending, setUserPending, clearUserPending } from '../state/pending-user-input';
import { logger } from '@/lib/logger';

const NAME_REGEX = /^[a-zA-Z0-9]+$/;
const MAX_NAME_LENGTH = 32;

export function registerAccountNameHandler(bot: Bot<BotContext>): void {
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();
    if (ctx.message.text.startsWith('/')) return next();

    const pending = getUserPending(ctx.from.id);
    if (!pending || pending.kind !== 'account-name-input') return next();

    const input = ctx.message.text.trim();

    if (input !== '-' && (!NAME_REGEX.test(input) || input.length > MAX_NAME_LENGTH)) {
      await ctx.reply(
        'اسم وارد شده قابل قبول نیست.\nفقط حروف انگلیسی و عدد مجاز است، بدون فاصله.\nدوباره بفرست:',
      );
      return;
    }

    const chosenName = input === '-' ? pending.generatedName : input;
    clearUserPending(ctx.from.id);
    await ctx.reply('⏳ در حال ساخت اکانت...');

    const { orderFulfillmentService, markOrderFailed } = await import('@/services/order-fulfillment.service');
    const result = await orderFulfillmentService.fulfill(pending.orderId, chosenName);

    if (!result.ok) {
      if (result.nameTaken) {
        setUserPending(ctx.from.id, pending);
        await ctx.reply('این اسم قبلاً انتخاب شده، یه اسم دیگه بفرست:');
        return;
      }

      const retryCount = pending.retryCount ?? 0;

      if (result.retryable && retryCount < 1) {
        // Fix 3: temporary failure — let user retry once
        setUserPending(ctx.from.id, { ...pending, retryCount: retryCount + 1 });
        logger.warn({ orderId: pending.orderId, retryCount, reason: result.reason }, 'Fulfillment failed (retryable), prompting user to retry');
        await ctx.reply(
          '⚠️ سرور موقتاً در دسترس نیست. لطفاً چند ثانیه صبر کن و دوباره اسم رو بفرست.',
        );
        return;
      }

      // Fix 4: permanent failure or retry exhausted
      logger.error({ orderId: pending.orderId, retryCount, reason: result.reason }, 'Fulfillment failed permanently, marking order failed');
      const { refunded } = await markOrderFailed(pending.orderId);
      const msg = refunded
        ? '❌ متأسفانه ساخت سرویس با خطا مواجه شد و مبلغ به کیف پولت برگشت.\nلطفاً دوباره تلاش کن یا با پشتیبانی تماس بگیر.'
        : '❌ متأسفانه ساخت سرویس با خطا مواجه شد.\nلطفاً دوباره از منو خرید کن یا با پشتیبانی تماس بگیر.';
      await ctx.reply(msg);
    }
  });
}
