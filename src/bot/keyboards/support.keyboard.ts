import { InlineKeyboard } from 'grammy';
import { faq, FAQ_KEYS } from '../content/support-faq.content';
import { type Ticket, TicketStatus } from '@prisma/client';

export function faqMenuKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  FAQ_KEYS.forEach((key) => {
    kb.text(faq[key].label, `support:faq:${key}`).row();
  });
  kb.text('✏️ ارسال پیام جدید', 'support:new').row();
  kb.text('📋 تیکت‌های من', 'support:list');
  return kb;
}

export function backToFaqKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ بازگشت', 'support:menu');
}

export function channelTicketKeyboard(ticketId: number): InlineKeyboard {
  return new InlineKeyboard().text('💬 پاسخ به تیکت', `tkt:reply:${ticketId}`);
}

export function ticketListKeyboard(
  tickets: Pick<Ticket, 'id' | 'status' | 'createdAt'>[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  tickets.forEach((t) => {
    const icon = t.status === TicketStatus.OPEN ? '🟢' : '⚫️';
    const date = t.createdAt.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' });
    kb.text(`${icon} تیکت #${t.id} — ${date}`, `support:ticket:${t.id}`).row();
  });
  kb.text('⬅️ بازگشت', 'support:menu');
  return kb;
}

export function ticketDetailKeyboard(ticketId: number, status: TicketStatus): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (status === TicketStatus.OPEN) {
    kb.text('↩️ پیام جدید به این تیکت', `support:followup:${ticketId}`).row();
  }
  kb.text('⬅️ بازگشت به لیست', 'support:list');
  return kb;
}

export function replyToTicketKeyboard(ticketId: number): InlineKeyboard {
  return new InlineKeyboard().text('💬 پاسخ دادن', `tkt:reply:${ticketId}`);
}
