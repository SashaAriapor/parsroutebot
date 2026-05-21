import { type Bot, Composer } from 'grammy';
import { OrderStatus } from '@prisma/client';
import { type BotContext } from '../types';
import { prisma } from '@/db/client';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/html';
import { formatToman, formatGB } from '@/lib/format';
import { settingsService } from '@/services/settings.service';
import { generatePasarGuardUsername } from '@/adapters/pasarguard';
import { getUserPending, clearUserPending, setUserPending } from '../state/pending-user-input';

export function registerCardPaymentHandler(bot: Bot<BotContext>): void {
  const handler = new Composer<BotContext>();

  // ── Receipt: photo ─────────────────────────────────────────────────────────
  handler.on('message:photo', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();
    const pending = getUserPending(ctx.from.id);
    if (!pending || pending.kind !== 'card-receipt-input') return next();

    const fileId = ctx.message.photo.at(-1)!.file_id;
    await processReceipt(ctx, pending.orderId, { type: 'photo', fileId });
  });

  // ── Receipt: document (image sent as file) ─────────────────────────────────
  handler.on('message:document', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();
    const pending = getUserPending(ctx.from.id);
    if (!pending || pending.kind !== 'card-receipt-input') return next();

    const mime = ctx.message.document.mime_type ?? '';
    if (!mime.startsWith('image/')) return next();

    await processReceipt(ctx, pending.orderId, { type: 'photo', fileId: ctx.message.document.file_id });
  });

  // ── Receipt: text fallback ─────────────────────────────────────────────────
  handler.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();
    const pending = getUserPending(ctx.from.id);
    if (!pending || pending.kind !== 'card-receipt-input') return next();

    if (ctx.message.text.startsWith('/')) return next();

    await processReceipt(ctx, pending.orderId, { type: 'text', text: ctx.message.text });
  });

  // ── Reaction: admin approves or rejects ────────────────────────────────────
  handler.on('message_reaction', async (ctx) => {
    const reaction = ctx.update.message_reaction;
    if (!reaction) return;

    const settings = await settingsService.getCardSettings();
    if (!settings.channelId) return;
    if (reaction.chat.id !== settings.channelId) return;

    const wasAdded = (emoji: string): boolean =>
      reaction.new_reaction.some((r) => r.type === 'emoji' && r.emoji === emoji) &&
      !reaction.old_reaction.some((r) => r.type === 'emoji' && r.emoji === emoji);

    if (!wasAdded('👍') && !wasAdded('👎')) return;

    const order = await prisma.order.findFirst({
      where: {
        cardReceiptMessageId: reaction.message_id,
        paymentMethod: 'CARD',
        status: 'PENDING_CARD_APPROVAL',
      },
    });

    if (!order) return;

    if (wasAdded('👍')) {
      await approveCardOrder(order.id, order.userId);
    } else {
      await rejectCardOrder(order.id, order.userId);
    }
  });

  bot.use(handler);
}

type ReceiptPayload =
  | { type: 'photo'; fileId: string }
  | { type: 'text'; text: string };

async function processReceipt(
  ctx: BotContext & { from: NonNullable<BotContext['from']> },
  orderId: string,
  receipt: ReceiptPayload,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PENDING_CARD_APPROVAL') {
    clearUserPending(ctx.from.id);
    await ctx.reply('❌ سفارش یافت نشد یا وضعیتش تغییر کرده. دوباره از منو خرید کن.');
    return;
  }

  const settings = await settingsService.getCardSettings();
  if (!settings.channelId) {
    logger.error({ orderId }, 'Card channel not configured — cannot forward receipt');
    await ctx.reply('❌ خطای پیکربندی. با پشتیبانی تماس بگیر.');
    return;
  }

  const user = ctx.from;
  const userDisplay = user.username ? `@${escapeHtml(user.username)}` : `#${user.id}`;

  const caption =
    `📥 <b>رسید کارتی جدید</b>\n\n` +
    `👤 کاربر: ${userDisplay} (id: <code>${user.id}</code>)\n` +
    `📦 ${formatGB(order.trafficGB)} — ${order.durationDays} روز\n` +
    `💰 مبلغ: ${formatToman(order.priceToman)}\n` +
    `🆔 سفارش: <code>${order.id}</code>\n\n` +
    `👍 تأیید  |  👎 رد`;

  let channelMsgId: number;
  try {
    if (receipt.type === 'photo') {
      const msg = await ctx.api.sendPhoto(settings.channelId, receipt.fileId, {
        caption,
        parse_mode: 'HTML',
      });
      channelMsgId = msg.message_id;
    } else {
      const fullText = caption + `\n\n📄 متن رسید:\n${receipt.text}`;
      const msg = await ctx.api.sendMessage(settings.channelId, fullText, { parse_mode: 'HTML' });
      channelMsgId = msg.message_id;
    }
  } catch (err) {
    logger.error({ err, orderId, channelId: settings.channelId }, 'Failed to forward receipt to card channel');
    await ctx.reply('❌ خطا در ارسال رسید. دوباره امتحان کن.');
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { cardReceiptMessageId: channelMsgId },
  });

  clearUserPending(ctx.from.id);

  await ctx.reply(
    '✅ رسیدت دریافت شد و برای بررسی ارسال شد.\n\n' +
    '⏳ منتظر تأیید بمون. معمولاً زیر یک ساعت انجام میشه.\n' +
    'بعد از تأیید، پیام می‌گیری.',
  );
}

async function approveCardOrder(orderId: string, userId: bigint): Promise<void> {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, paidAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, orderId }, 'Failed to mark card order as PAID');
    return;
  }

  const generatedName = generatePasarGuardUsername();
  setUserPending(Number(userId), { kind: 'account-name-input', orderId, generatedName });

  const { bot } = await import('@/bot');
  try {
    await bot.api.sendMessage(
      Number(userId),
      `✅ <b>پرداخت کارتی تأیید شد!</b>\n\n` +
      `یه اسم برای اکانتت انتخاب کن:\n\n` +
      `⚠️ فقط حروف انگلیسی و عدد — بدون فاصله یا کاراکتر خاص\n` +
      `مثال: <code>john123</code> یا <code>myaccount</code>\n\n` +
      `برای اسم خودکار، فقط <code>-</code> بفرست`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    logger.warn({ err, userId: userId.toString() }, 'Failed to notify user of card approval');
  }
}

async function rejectCardOrder(orderId: string, userId: bigint): Promise<void> {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CARD_REJECTED' },
    });
  } catch (err) {
    logger.error({ err, orderId }, 'Failed to mark card order as CARD_REJECTED');
    return;
  }

  const { bot } = await import('@/bot');
  try {
    await bot.api.sendMessage(
      Number(userId),
      `❌ <b>رسید پرداخت تأیید نشد.</b>\n\n` +
      `دلایل احتمالی:\n` +
      `• مبلغ واریزی اشتباه بوده\n` +
      `• رسید نامعتبر یا ناخوانا بوده\n` +
      `• از کارت دیگه‌ای واریز شده\n\n` +
      `برای خرید مجدد، از منو دکمه خرید رو بزن.\n` +
      `اگه فکر می‌کنی اشتباهی شده، به پشتیبانی پیام بده.`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    logger.warn({ err, userId: userId.toString() }, 'Failed to notify user of card rejection');
  }
}
