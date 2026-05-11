import { type Bot } from 'grammy';
import { type BotContext } from '../../types';
import { setPendingReply, getPendingReply, clearPendingReply } from '@/bot/state/pending-admin-reply';
import { addMessage, getTicket } from '@/services/ticket.service';
import { config } from '@/lib/config';
import { escapeHtml, formatTehranTime } from '@/lib/html';
import { logger } from '@/lib/logger';

export function registerSupportReplyHandler(bot: Bot<BotContext>): void {
  // Channel/group button click → record pending state, DM the admin
  bot.callbackQuery(/^tkt:reply:/, async (ctx) => {
    const adminId = ctx.from.id;
    if (!config.ADMIN_IDS.includes(adminId)) {
      await ctx.answerCallbackQuery();
      return;
    }

    const ticketId = parseInt(ctx.callbackQuery.data.slice('tkt:reply:'.length), 10);

    // Answer immediately so the loading indicator clears
    await ctx.answerCallbackQuery({ text: 'در پیوی ربات پاسخ بده ✍️' });

    try {
      await ctx.api.sendMessage(
        adminId,
        `📝 پاسخت برای تیکت #${ticketId} رو همینجا بفرست.\n\nبرای انصراف /cancel بزن.`,
      );
    } catch (err) {
      logger.error({ err, adminId }, 'Failed to DM admin — they may not have started the bot');
      return;
    }

    setPendingReply(adminId, ticketId);
  });

  // /cancel in private chat — only consumes if there's a pending reply
  bot.command('cancel', async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    const adminId = ctx.from?.id;
    if (!adminId || !config.ADMIN_IDS.includes(adminId)) return next();

    const pending = getPendingReply(adminId);
    if (!pending) return next();

    clearPendingReply(adminId);
    await ctx.reply('❌ پاسخ به تیکت لغو شد.');
  });

  // Capture the admin's reply text in private chat.
  // Calls next() for everything that isn't a pending admin reply so other
  // message:text handlers (bot.hears, etc.) still fire normally.
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();

    const adminId = ctx.from.id;
    if (!config.ADMIN_IDS.includes(adminId)) return next();

    const pending = getPendingReply(adminId);
    if (!pending) return next();

    const text = ctx.message.text.trim();

    // Let slash commands fall through (e.g. /cancel handled above, /admin, etc.)
    if (text.startsWith('/')) return next();

    if (text.length < 2 || text.length > 4000) {
      await ctx.reply('پیام باید بین ۲ تا ۴۰۰۰ کاراکتر باشه. دوباره بفرست یا /cancel.');
      return;
    }

    try {
      await addMessage(pending.ticketId, text, true);

      const ticket = await getTicket(pending.ticketId);
      if (!ticket) {
        await ctx.reply('❌ تیکت پیدا نشد.');
        clearPendingReply(adminId);
        return;
      }

      // DM the user
      try {
        await ctx.api.sendMessage(
          Number(ticket.userId),
          `📬 <b>پاسخ پشتیبانی به تیکت #${pending.ticketId}</b>\n\n` +
            `💬 ${escapeHtml(text)}\n\n` +
            `🕐 ${formatTehranTime(new Date())}`,
          { parse_mode: 'HTML' },
        );
      } catch (dmErr) {
        logger.warn({ err: dmErr, userId: ticket.userId }, 'Could not DM user — may have blocked the bot');
        await ctx.reply('⚠️ نتونستم پیام رو به کاربر بفرستم (احتمالاً بات رو بلاک کرده).');
      }

      // Thread reply in the log channel
      if (ticket.channelMessageId) {
        try {
          await ctx.api.sendMessage(
            config.LOG_CHANNEL_ID,
            `👨‍💼 <b>پاسخ ادمین — تیکت #${pending.ticketId}</b>\n` +
              `🕐 ${formatTehranTime(new Date())}\n\n` +
              `💬 ${escapeHtml(text)}`,
            {
              parse_mode: 'HTML',
              reply_to_message_id: ticket.channelMessageId,
            },
          );
        } catch (err) {
          logger.error({ err, ticketId: pending.ticketId }, 'Failed to post admin reply to log channel');
        }
      }

      clearPendingReply(adminId);
      await ctx.reply(`✅ پاسخ به تیکت #${pending.ticketId} ارسال شد.`);
    } catch (err) {
      logger.error({ err, ticketId: pending.ticketId }, 'Failed to process admin reply');
      await ctx.reply('❌ خطا در ارسال پاسخ. دوباره تلاش کن.');
      clearPendingReply(adminId);
    }
  });
}
