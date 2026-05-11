import { type Bot } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { config } from '@/lib/config';
import { escapeHtml } from '@/lib/html';
import { formatToman, toPersianDigits, timeAgo } from '@/lib/format';
import { referralStatsService, type ReferralEntry } from '@/services/referral-stats.service';
import { inviteMainKeyboard, inviteFullStatsKeyboard } from '../keyboards/invite.keyboard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRefLink(botUsername: string, referralCode: string): string {
  return `https://t.me/${botUsername}?start=ref_${referralCode}`;
}

function displayName(entry: ReferralEntry): string {
  if (entry.refereeUsername) return `@${entry.refereeUsername}`;
  if (entry.refereeFirstName) return escapeHtml(entry.refereeFirstName);
  return `کاربر #${String(entry.refereeId).slice(-4)}`;
}

function recentBlock(entries: ReferralEntry[]): string {
  if (entries.length === 0) {
    return '💡 هنوز کسی با لینکت ثبت‌نام نکرده. لینک بالا رو برای دوستات بفرست.';
  }
  const lines = ['👥 آخرین دعوت‌شده‌ها:', ''];
  for (const e of entries) {
    const status = e.hasPurchased ? '✅' : '⏳';
    lines.push(`▫️ ${displayName(e)} ─ ${toPersianDigits(timeAgo(e.joinedAt))} ─ ${status}`);
  }
  return lines.join('\n');
}

// ─── Screen renderers ─────────────────────────────────────────────────────────

async function renderMain(ctx: BotContext, edit: boolean): Promise<void> {
  const user = ctx.dbUser!;
  const botUsername = ctx.me.username ?? 'bot';
  const refLink = buildRefLink(botUsername, user.referralCode);
  const stats = await referralStatsService.getStats(BigInt(user.id), 5);

  const text = [
    '🤝 <b>دعوت دوستان</b>',
    '',
    `با دعوت دوستات به این ربات، <b>${config.REFERRAL_COMMISSION_PERCENT}٪</b> از هر خریدشون به کیف پولت اضافه میشه.`,
    '',
    '🔗 لینک اختصاصی تو:',
    `<code>${refLink}</code>`,
    '',
    '📊 آمار شما:',
    `👥 کل دعوت‌شده‌ها: <b>${toPersianDigits(stats.totalReferred)}</b>`,
    `✅ کاربر فعال (با خرید): <b>${toPersianDigits(stats.totalActiveReferred)}</b>`,
    `💰 کل کمیسیون: <b>${formatToman(stats.totalCommissionEarned)}</b>`,
    '',
    '────────────────',
    recentBlock(stats.recentReferrals),
  ].join('\n');

  const kb = inviteMainKeyboard(refLink);
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderFullStats(ctx: BotContext): Promise<void> {
  const user = ctx.dbUser!;
  const stats = await referralStatsService.getStats(BigInt(user.id), 20);

  const lines = [
    '📊 <b>آمار کامل دعوت‌ها</b>',
    '',
    `👥 کل: <b>${toPersianDigits(stats.totalReferred)}</b>`,
    `✅ فعال: <b>${toPersianDigits(stats.totalActiveReferred)}</b>`,
    `💰 کل کمیسیون: <b>${formatToman(stats.totalCommissionEarned)}</b>`,
    '',
    '────────────────',
  ];

  if (stats.recentReferrals.length === 0) {
    lines.push('💡 هنوز کسی با لینکت ثبت‌نام نکرده.');
  } else {
    lines.push(`لیست کامل (${toPersianDigits(stats.recentReferrals.length)} نفر اخیر):`, '');
    for (const e of stats.recentReferrals) {
      const status = e.hasPurchased ? '✅' : '⏳';
      const purchasesLine = e.hasPurchased
        ? ` — ${toPersianDigits(e.purchases)} خرید — کمیسیون: ${formatToman(e.commission)}`
        : ' — بدون خرید';
      lines.push(`${status} ${displayName(e)} — ${toPersianDigits(timeAgo(e.joinedAt))}${purchasesLine}`);
    }
  }

  const text = lines.join('\n');
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: inviteFullStatsKeyboard() });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function registerInviteHandler(bot: Bot<BotContext>): void {
  bot.hears(MENU.INVITE, async (ctx) => {
    if (!ctx.dbUser) return;
    await renderMain(ctx, false);
  });

  bot.callbackQuery(/^inv:/, async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === 'inv:copy') {
      await ctx.answerCallbackQuery({
        text: '📋 روی لینک بالا تو پیام نگه دار تا کپی بشه',
        show_alert: true,
      });
      return;
    }

    if (data === 'inv:full-stats') {
      if (!ctx.dbUser) { await ctx.answerCallbackQuery(); return; }
      await renderFullStats(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'inv:main') {
      if (!ctx.dbUser) { await ctx.answerCallbackQuery(); return; }
      await renderMain(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'inv:back') {
      await ctx.deleteMessage().catch(() => ctx.editMessageText('بازگشت به منو.'));
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  });
}
