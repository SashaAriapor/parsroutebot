import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import {
  setAdminPending,
  getAdminPending,
  clearAdminPending,
  type BroadcastSegment,
} from '@/bot/state/pending-admin-input';
import { broadcastService } from '@/services/broadcast.service';
import { broadcastQueue } from '@/workers/broadcast.worker';
import { adminAuditService } from '@/services/admin-audit.service';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { escapeHtml } from '@/lib/html';

// ─── In-memory stash ────────────────────────────────────────────────────────
const messageStash = new Map<number, { segment: BroadcastSegment; text: string }>();

function stashBroadcastMessage(adminId: number, data: { segment: BroadcastSegment; text: string }) {
  messageStash.set(adminId, data);
}

function popBroadcastMessage(adminId: number) {
  const v = messageStash.get(adminId);
  if (v) messageStash.delete(adminId);
  return v;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  all: '👥 همه کاربران',
  active: '✅ فعال‌ها (با حداقل ۱ خرید)',
  vip: '💎 مشتری‌های VIP (با ۳+ خرید)',
  'never-bought': '⏳ بدون خرید',
  'has-active-config': '🎯 با سرویس فعال',
};

function segmentLabel(s: BroadcastSegment): string {
  return SEGMENT_LABELS[s];
}

function segmentKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👥 همه کاربران (شامل غیرفعال)', 'admin:bcast:seg:all').row()
    .text('✅ فقط فعال‌ها (با حداقل ۱ خرید)', 'admin:bcast:seg:active').row()
    .text('💎 مشتری‌های VIP (با ۳+ خرید)', 'admin:bcast:seg:vip').row()
    .text('⏳ بدون خرید (هرگز نخریدن)', 'admin:bcast:seg:never-bought').row()
    .text('🎯 با سرویس فعال', 'admin:bcast:seg:has-active-config').row()
    .text('⬅️ بازگشت', 'admin:tools');
}

function cancelPendingKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ انصراف', 'admin:cancel-pending');
}

export function registerBroadcastHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();

  admin.callbackQuery('admin:tools:broadcast', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '📢 <b>ارسال پیام همگانی</b>\n\nابتدا گروه گیرنده‌ها رو انتخاب کن:',
      { parse_mode: 'HTML', reply_markup: segmentKeyboard() },
    );
  });

  admin.callbackQuery(/^admin:bcast:seg:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const segRaw = ctx.callbackQuery.data.slice('admin:bcast:seg:'.length) as BroadcastSegment;
    const count = await broadcastService.countSegment(segRaw);

    setAdminPending(ctx.from.id, { kind: 'broadcast-message', segment: segRaw });

    await ctx.editMessageText(
      `📢 <b>ارسال پیام همگانی</b>\n\n` +
      `🎯 گروه گیرنده: ${segmentLabel(segRaw)}\n` +
      `👥 تعداد: <b>${count}</b> نفر\n\n` +
      `حالا متن پیام رو بفرست. می‌تونی از Markdown یا ایموجی استفاده کنی.\n\n` +
      `⚠️ پیامی که می‌فرستی به همه این ${count} نفر ارسال میشه.\n\n` +
      `/cancel برای انصراف`,
      { parse_mode: 'HTML', reply_markup: cancelPendingKeyboard() },
    );
  });

  admin.callbackQuery('admin:bcast:confirm', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const adminId = ctx.from.id;
    const stashed = popBroadcastMessage(adminId);
    if (!stashed) {
      await ctx.answerCallbackQuery({ text: 'منقضی شده — دوباره شروع کن', show_alert: true });
      return;
    }

    const job = await broadcastQueue.add(
      'send',
      { adminId, segment: stashed.segment, text: stashed.text },
    );

    await adminAuditService.log(prisma, {
      adminId: BigInt(adminId),
      type: 'BROADCAST',
      payload: { segment: stashed.segment, length: stashed.text.length },
    });

    await ctx.editMessageText(
      `📤 <b>ارسال شروع شد</b>\n\n` +
      `Job ID: <code>${job.id}</code>\n` +
      `گزارش پیشرفت تو چنل لاگ ارسال میشه.`,
      { parse_mode: 'HTML' },
    );
  });

  admin.callbackQuery('admin:bcast:cancel', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    popBroadcastMessage(ctx.from.id);
    await ctx.editMessageText('❌ لغو شد.', {
      reply_markup: new InlineKeyboard().text('⬅️ بازگشت به ابزارها', 'admin:tools'),
    });
  });

  bot.use(admin);

  // Text handler for broadcast-message kind
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    const adminId = ctx.from.id;
    if (!config.ADMIN_IDS.includes(adminId)) return next();

    const pending = getAdminPending(adminId);
    if (!pending || pending.kind !== 'broadcast-message') return next();

    const text = ctx.message.text;
    if (text.startsWith('/')) return next();

    if (text.length < 3 || text.length > 4000) {
      await ctx.reply('❌ پیام باید بین ۳ تا ۴۰۰۰ کاراکتر باشه.');
      return;
    }

    const count = await broadcastService.countSegment(pending.segment);
    stashBroadcastMessage(adminId, { segment: pending.segment, text });
    clearAdminPending(adminId);

    await ctx.reply(
      `✅ <b>پیش‌نمایش پیام</b>\n\n────────────────\n${escapeHtml(text)}\n────────────────\n\n` +
      `🎯 گروه گیرنده: ${segmentLabel(pending.segment)}\n` +
      `👥 تعداد: <b>${count}</b> نفر\n\n` +
      `مطمئنی این پیام رو می‌خوای بفرستی؟ این عمل قابل برگشت نیست.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✅ بله، ارسال کن', 'admin:bcast:confirm')
          .text('❌ انصراف', 'admin:bcast:cancel'),
      },
    );
  });
}
