import { type Conversation } from '@grammyjs/conversations';
import { type BotContext } from '../types';
import { createTicket, addMessage, getTicket } from '@/services/ticket.service';
import { config } from '@/lib/config';
import { escapeHtml, formatTehranTime } from '@/lib/html';
import { channelTicketKeyboard } from '../keyboards/support.keyboard';
import { logger } from '@/lib/logger';

const MIN_LEN = 5;
const MAX_LEN = 4000;
const TIMEOUT_MS = 5 * 60 * 1000;

async function waitForText(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
): Promise<string | null> {
  const response = await conversation.waitFor('message:text', {
    otherwise: (c) => c.reply('لطفاً فقط متن بفرست.'),
  });

  if (response.message.text === '/cancel') {
    await ctx.reply('❌ لغو شد.');
    return null;
  }
  return response.message.text;
}

export async function supportMessageConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
): Promise<void> {
  const userId = BigInt(ctx.from!.id);
  const firstName = ctx.from?.first_name ?? 'کاربر';

  await ctx.reply(
    '✏️ پیامت رو بنویس و ارسال کن.\n\n' +
      `حداقل ${MIN_LEN} و حداکثر ${MAX_LEN} کاراکتر.\n` +
      'برای لغو /cancel بفرست.',
  );

  let text: string | null = null;
  while (!text) {
    const raw = await waitForText(conversation, ctx);
    if (raw === null) return;
    if (raw.length < MIN_LEN) {
      await ctx.reply(`❗️ پیام خیلی کوتاهه. حداقل ${MIN_LEN} کاراکتر بفرست.`);
      continue;
    }
    if (raw.length > MAX_LEN) {
      await ctx.reply(`❗️ پیام خیلی بلنده. حداکثر ${MAX_LEN} کاراکتر مجازه.`);
      continue;
    }
    text = raw;
  }

  const ticket = await conversation.external(() => createTicket(userId, text!));

  await ctx.reply(
    `✅ تیکت #${ticket.id} ثبت شد.\nپشتیبانی به‌زودی پاسخ می‌ده.`,
  );

  // Post to log channel
  try {
    const username = ctx.from?.username ? `@${ctx.from.username}` : `#${ctx.from!.id}`;
    const channelText =
      `🎫 <b>تیکت جدید #${ticket.id}</b>\n` +
      `👤 ${escapeHtml(firstName)} (${username})\n` +
      `🕐 ${formatTehranTime(ticket.createdAt)}\n\n` +
      `💬 ${escapeHtml(text!)}`;

    const sent = await ctx.api.sendMessage(config.LOG_CHANNEL_ID, channelText, {
      parse_mode: 'HTML',
      reply_markup: channelTicketKeyboard(ticket.id),
    });

    await conversation.external(() =>
      import('@/services/ticket.service').then((m) =>
        m.setChannelMessageId(ticket.id, sent.message_id),
      ),
    );
  } catch (err) {
    logger.error({ err, ticketId: ticket.id }, 'Failed to post ticket to log channel');
  }
}

export async function supportFollowupConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
): Promise<void> {
  const ticketId = ctx.session.pendingFollowupTicketId;
  if (!ticketId) return;

  const ticket = await conversation.external(() => getTicket(ticketId));
  if (!ticket) {
    await ctx.reply('❌ تیکت یافت نشد.');
    return;
  }

  await ctx.reply(
    `↩️ پیامت برای تیکت #${ticketId} رو بنویس.\n\nبرای لغو /cancel بفرست.`,
  );

  let text: string | null = null;
  while (!text) {
    const raw = await waitForText(conversation, ctx);
    if (raw === null) return;
    if (raw.length < MIN_LEN) {
      await ctx.reply(`❗️ پیام خیلی کوتاهه. حداقل ${MIN_LEN} کاراکتر بفرست.`);
      continue;
    }
    if (raw.length > MAX_LEN) {
      await ctx.reply(`❗️ پیام خیلی بلنده. حداکثر ${MAX_LEN} کاراکتر مجازه.`);
      continue;
    }
    text = raw;
  }

  await conversation.external(() => addMessage(ticketId, text!, false));
  await ctx.reply(`✅ پیامت به تیکت #${ticketId} اضافه شد.`);

  // Thread reply in channel
  if (ticket.channelMessageId) {
    try {
      const firstName = ctx.from?.first_name ?? 'کاربر';
      const username = ctx.from?.username ? `@${ctx.from.username}` : `#${ctx.from!.id}`;
      const channelText =
        `↩️ <b>پیام جدید به تیکت #${ticketId}</b>\n` +
        `👤 ${escapeHtml(firstName)} (${username})\n\n` +
        `💬 ${escapeHtml(text!)}`;

      await ctx.api.sendMessage(config.LOG_CHANNEL_ID, channelText, {
        parse_mode: 'HTML',
        reply_to_message_id: ticket.channelMessageId,
      });
    } catch (err) {
      logger.error({ err, ticketId }, 'Failed to post followup to log channel');
    }
  }

  ctx.session.pendingFollowupTicketId = undefined;
}
