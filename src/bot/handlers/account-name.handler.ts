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

    if (input === '-') {
      clearUserPending(ctx.from.id);
      await ctx.reply('⏳ در حال ساخت اکانت...');
      const { orderFulfillmentService } = await import('@/services/order-fulfillment.service');
      const result = await orderFulfillmentService.fulfill(pending.orderId, pending.generatedName);
      if (!result.ok) {
        logger.error({ orderId: pending.orderId, reason: result.reason }, 'Fulfillment failed after auto name selected');
        await ctx.reply('❌ خطایی در ساخت سرویس پیش اومد. با پشتیبانی تماس بگیر.');
      }
      return;
    }

    if (!NAME_REGEX.test(input) || input.length > MAX_NAME_LENGTH) {
      await ctx.reply(
        'اسم وارد شده قابل قبول نیست.\nفقط حروف انگلیسی و عدد مجاز است، بدون فاصله.\nدوباره بفرست:',
      );
      return;
    }

    clearUserPending(ctx.from.id);
    await ctx.reply('⏳ در حال ساخت اکانت...');

    const { orderFulfillmentService } = await import('@/services/order-fulfillment.service');
    const result = await orderFulfillmentService.fulfill(pending.orderId, input);

    if (!result.ok) {
      if (result.nameTaken) {
        setUserPending(ctx.from.id, pending);
        await ctx.reply('این اسم قبلاً انتخاب شده، یه اسم دیگه بفرست:');
        return;
      }
      logger.error({ orderId: pending.orderId, reason: result.reason }, 'Fulfillment failed after custom name input');
      await ctx.reply('❌ خطایی در ساخت سرویس پیش اومد. با پشتیبانی تماس بگیر.');
    }
  });
}
