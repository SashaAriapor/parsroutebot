import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { adminStatsService } from '@/services/admin-stats.service';
import { formatToman, formatDateIR } from '@/lib/format';
import { escapeHtml } from '@/lib/html';

function statsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📈 آمار کلی', 'admin:stats:overall')
    .row()
    .text('🏆 مشتری‌های برتر', 'admin:stats:top:spent')
    .row()
    .text('🏆 برترین معرفی‌کننده‌ها', 'admin:stats:top-referrers')
    .row()
    .text('⬅️ بازگشت', 'admin:back');
}

function topReferrersKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 به‌روزرسانی', 'admin:stats:top-referrers')
    .row()
    .text('⬅️ بازگشت', 'admin:stats');
}

function overallKeyboard(orphans: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (orphans > 0) {
    kb.text(
      `⚠️ ${orphans} پرداخت بدون مطابقت — بررسی کن`,
      'admin:stats:overall',
    ).row();
  }
  return kb.text('🔄 به‌روزرسانی', 'admin:stats:overall').row().text('⬅️ بازگشت', 'admin:stats');
}

function topKeyboard(sortBy: 'spent' | 'count'): InlineKeyboard {
  return new InlineKeyboard()
    .text(sortBy === 'spent' ? '💰 مبلغ ✓' : '💰 مبلغ', 'admin:stats:top:spent')
    .text(sortBy === 'count' ? '🛍️ تعداد ✓' : '🛍️ تعداد', 'admin:stats:top:count')
    .row()
    .text('🔄 به‌روزرسانی', `admin:stats:top:${sortBy}`)
    .text('⬅️ بازگشت', 'admin:stats');
}

function topBackKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ بازگشت', 'admin:stats');
}

function formatOverall(data: Awaited<ReturnType<typeof adminStatsService.getOverall>>): string {
  const { users, configs, orders, revenue, ton } = data;
  return (
    `📈 <b>آمار کلی</b>\n\n` +
    `👥 <b>کاربران</b>\n` +
    `کل: <b>${users.total}</b>\n` +
    `فعال در ۷ روز گذشته: <b>${users.activeLast7d}</b>\n` +
    `بن شده: <b>${users.banned}</b>\n\n` +
    `🛡️ <b>سرویس‌ها</b>\n` +
    `کل: <b>${configs.total}</b>\n` +
    `فعال: <b>${configs.active}</b>\n` +
    `منقضی: <b>${configs.expired}</b>\n\n` +
    `🛒 <b>سفارش‌ها</b>\n` +
    `کل: <b>${orders.total}</b>\n` +
    `✅ تکمیل: <b>${orders.completed}</b>\n` +
    `⏳ در انتظار پرداخت: <b>${orders.pending}</b>\n\n` +
    `💰 <b>درآمد (سفارش‌های تکمیل‌شده)</b>\n` +
    `کل: <b>${formatToman(revenue.total)}</b>\n` +
    `از کیف پول: ${formatToman(revenue.wallet)}\n` +
    `از TON مستقیم: ${formatToman(revenue.ton)}\n\n` +
    `🪙 <b>شارژ کیف پول با TON</b>\n` +
    `کل: <b>${formatToman(ton.totalTopupToman)}</b>\n` +
    `⚠️ پرداخت بدون مطابقت (orphan): <b>${ton.orphans}</b>\n\n` +
    `────────────────\n` +
    `🕐 ${formatDateIR(new Date())}`
  );
}

function formatTopReferrers(
  referrers: Awaited<ReturnType<typeof adminStatsService.getTopReferrers>>,
): string {
  if (referrers.length === 0) {
    return `🏆 <b>برترین معرفی‌کننده‌ها:</b>\n\nهنوز معرفی موفقی ثبت نشده`;
  }

  const lines = referrers.map((r, i) => {
    let display: string;
    if (r.username) {
      display = `@${escapeHtml(r.username)}`;
    } else if (r.firstName) {
      display = escapeHtml(r.firstName);
    } else {
      const last4 = r.referrerId.toString().slice(-4);
      display = `کاربر #${last4}`;
    }
    return `${i + 1}. ${display} — ${r.count} نفر`;
  });

  return `🏆 <b>برترین معرفی‌کننده‌ها:</b>\n\n` + lines.join('\n');
}

function formatTopCustomers(
  customers: Awaited<ReturnType<typeof adminStatsService.getTopCustomers>>,
  sortBy: 'spent' | 'count',
): string {
  const sortLabel = sortBy === 'spent' ? 'مبلغ خرید' : 'تعداد خرید';
  if (customers.length === 0) {
    return `🏆 <b>مشتری‌های برتر</b>\n\nهنوز هیچ خریدی ثبت نشده.`;
  }

  const lines = customers.map((u, i) => {
    let display: string;
    if (u.username) {
      display = `@${escapeHtml(u.username)}`;
    } else if (u.firstName) {
      display = `${escapeHtml(u.firstName)} (firstName)`;
    } else {
      const last4 = u.id.toString().slice(-4);
      display = `کاربر #${last4}`;
    }
    return `${i + 1}. ${display} — <b>${formatToman(u.totalSpent)}</b> (${u.totalPurchases} خرید)`;
  });

  const total = customers.reduce((sum, u) => sum + u.totalSpent, 0n);

  return (
    `🏆 <b>مشتری‌های برتر</b> — مرتب‌سازی: ${sortLabel}\n\n` +
    lines.join('\n') +
    `\n\n────────────────\n` +
    `کل خرید این ${customers.length} نفر: <b>${formatToman(total)}</b>`
  );
}

export function registerAdminStatsHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();

  admin.callbackQuery('admin:stats', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('📊 <b>آمار</b>\n\nاز کدوم گزارش می‌خوای ببینی؟', {
      parse_mode: 'HTML',
      reply_markup: statsMenuKeyboard(),
    });
  });

  admin.callbackQuery('admin:stats:overall', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [data, topReferrers] = await Promise.all([
      adminStatsService.getOverall(),
      adminStatsService.getTopReferrers(),
    ]);
    const text = formatOverall(data) + '\n\n' + formatTopReferrers(topReferrers);
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: overallKeyboard(data.ton.orphans),
    });
  });

  admin.callbackQuery('admin:stats:top-referrers', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const topReferrers = await adminStatsService.getTopReferrers();
    await ctx.editMessageText(formatTopReferrers(topReferrers), {
      parse_mode: 'HTML',
      reply_markup: topReferrersKeyboard(),
    });
  });

  // Handles admin:stats:top:spent and admin:stats:top:count and plain admin:stats:top
  admin.callbackQuery(/^admin:stats:top(:(?:spent|count))?$/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const raw = ctx.callbackQuery.data;
    const sortBy: 'spent' | 'count' = raw.endsWith(':count') ? 'count' : 'spent';
    const [customers, topReferrers] = await Promise.all([
      adminStatsService.getTopCustomers(sortBy),
      adminStatsService.getTopReferrers(),
    ]);
    const text = formatTopCustomers(customers, sortBy) + '\n\n' + formatTopReferrers(topReferrers);
    const kb = customers.length === 0 ? topBackKeyboard() : topKeyboard(sortBy);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.use(admin);
}
