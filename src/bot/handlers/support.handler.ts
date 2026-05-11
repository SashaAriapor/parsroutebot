import { type Bot } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { faq, type FaqKey, FAQ_KEYS } from '../content/support-faq.content';
import {
  faqMenuKeyboard,
  backToFaqKeyboard,
  ticketListKeyboard,
  ticketDetailKeyboard,
} from '../keyboards/support.keyboard';
import { listUserTickets, getTicket } from '@/services/ticket.service';
import { formatTehranTime } from '@/lib/html';
import { TicketStatus } from '@prisma/client';

const FAQ_INTRO =
  '💬 <b>پشتیبانی</b>\n\n' +
  'سوالت رو از لیست زیر انتخاب کن یا یه تیکت جدید باز کن:';

export function registerSupportHandler(bot: Bot<BotContext>): void {
  bot.hears(MENU.SUPPORT, async (ctx) => {
    await ctx.reply(FAQ_INTRO, {
      parse_mode: 'HTML',
      reply_markup: faqMenuKeyboard(),
    });
  });

  bot.callbackQuery('support:menu', async (ctx) => {
    await ctx.editMessageText(FAQ_INTRO, {
      parse_mode: 'HTML',
      reply_markup: faqMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  // FAQ entries
  bot.callbackQuery(/^support:faq:/, async (ctx) => {
    const key = ctx.callbackQuery.data.slice('support:faq:'.length) as FaqKey;
    if (!FAQ_KEYS.includes(key)) {
      await ctx.answerCallbackQuery('❌ سوال یافت نشد');
      return;
    }
    const entry = faq[key];
    await ctx.editMessageText(`${entry.label}\n\n${entry.answer}`, {
      reply_markup: backToFaqKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  // New ticket
  bot.callbackQuery('support:new', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('supportMessage');
  });

  // Ticket list
  bot.callbackQuery('support:list', async (ctx) => {
    const userId = BigInt(ctx.from.id);
    const tickets = await listUserTickets(userId);

    if (tickets.length === 0) {
      await ctx.editMessageText('📭 هنوز تیکتی نداری.', {
        reply_markup: backToFaqKeyboard(),
      });
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.editMessageText('📋 تیکت‌های اخیر تو:', {
      reply_markup: ticketListKeyboard(tickets),
    });
    await ctx.answerCallbackQuery();
  });

  // Ticket detail
  bot.callbackQuery(/^support:ticket:/, async (ctx) => {
    const ticketId = parseInt(ctx.callbackQuery.data.slice('support:ticket:'.length), 10);
    const ticket = await getTicket(ticketId);

    if (!ticket || ticket.userId !== BigInt(ctx.from.id)) {
      await ctx.answerCallbackQuery('❌ تیکت یافت نشد');
      return;
    }

    const statusText = ticket.status === TicketStatus.OPEN ? '🟢 باز' : '⚫️ بسته';
    const lines = [
      `🎫 <b>تیکت #${ticket.id}</b> — ${statusText}`,
      `🕐 ${formatTehranTime(ticket.createdAt)}`,
      '',
    ];

    ticket.messages.forEach((msg) => {
      const who = msg.fromAdmin ? '👨‍💼 پشتیبانی' : '👤 شما';
      const time = formatTehranTime(msg.createdAt);
      lines.push(`${who} (${time}):\n${msg.text}`);
      lines.push('');
    });

    await ctx.editMessageText(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: ticketDetailKeyboard(ticket.id, ticket.status),
    });
    await ctx.answerCallbackQuery();
  });

  // Follow-up to existing ticket
  bot.callbackQuery(/^support:followup:/, async (ctx) => {
    const ticketId = parseInt(ctx.callbackQuery.data.slice('support:followup:'.length), 10);
    ctx.session.pendingFollowupTicketId = ticketId;
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('supportFollowup');
  });
}
