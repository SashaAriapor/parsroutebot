import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import {
  setAdminPending,
  getAdminPending,
  clearAdminPending,
} from '@/bot/state/pending-admin-input';
import { adminAuditService } from '@/services/admin-audit.service';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { formatToman, formatDateIR, timeAgo } from '@/lib/format';
import { escapeHtml } from '@/lib/html';

// ─── In-memory draft stash ───────────────────────────────────────────────────
type DiscountDraft = {
  code: string;
  percentOff: number;
  maxUses: number | null;
  expiresAt: Date | null;
  minPurchase: bigint | null;
  onlyForUserId: bigint | null;
};

const draftStash = new Map<number, DiscountDraft>();

export function stashDiscountDraft(adminId: number, draft: DiscountDraft) {
  draftStash.set(adminId, draft);
}

export function popDiscountDraft(adminId: number): DiscountDraft | undefined {
  const v = draftStash.get(adminId);
  if (v) draftStash.delete(adminId);
  return v;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizePersianDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran',
  }).format(date);
}

function cancelPendingKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ انصراف', 'admin:cancel-pending');
}

export function registerDiscountCreateHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();

  // ── Start: ask for code ────────────────────────────────────────────────────
  admin.callbackQuery('admin:tools:discount-create', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    setAdminPending(ctx.from.id, { kind: 'discount-code-input' });
    await ctx.editMessageText(
      '🎟️ <b>ساخت کد تخفیف جدید</b>\n\n' +
      'کد رو بفرست (فقط حروف انگلیسی و عدد، ۳ تا ۲۰ کاراکتر).\n\n' +
      'مثلاً: SUMMER25\n\n' +
      '/cancel برای انصراف',
      { parse_mode: 'HTML', reply_markup: cancelPendingKeyboard() },
    );
  });

  // ── Discount code confirmation ─────────────────────────────────────────────
  admin.callbackQuery('admin:discount:confirm', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const adminId = ctx.from.id;
    const draft = popDiscountDraft(adminId);
    if (!draft) {
      await ctx.answerCallbackQuery({ text: 'منقضی شده — دوباره شروع کن', show_alert: true });
      return;
    }

    try {
      await prisma.discountCode.create({
        data: {
          code: draft.code,
          percentOff: draft.percentOff,
          maxUses: draft.maxUses,
          expiresAt: draft.expiresAt,
          minPurchaseToman: draft.minPurchase,
          onlyForUserId: draft.onlyForUserId,
          isActive: true,
          createdBy: BigInt(adminId),
        },
      });

      await adminAuditService.log(prisma, {
        adminId: BigInt(adminId),
        type: 'CREATE_DISCOUNT',
        payload: {
          code: draft.code,
          percent: draft.percentOff,
          maxUses: draft.maxUses ?? 'unlimited',
          expiresAt: draft.expiresAt?.toISOString() ?? 'never',
          minPurchase: draft.minPurchase ? String(draft.minPurchase) : null,
          onlyForUserId: draft.onlyForUserId ? String(draft.onlyForUserId) : null,
        },
      });

      await ctx.editMessageText(
        `✅ <b>کد تخفیف ساخته شد</b>\n\n<code>${draft.code}</code>\n\nمی‌تونی این کد رو به کاربرات بدی.`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🎟️ ساخت کد دیگر', 'admin:tools:discount-create')
            .row()
            .text('⬅️ بازگشت', 'admin:tools'),
        },
      );
    } catch (err) {
      await ctx.editMessageText(
        `❌ خطا در ساخت کد: ${escapeHtml(String(err).slice(0, 200))}`,
        { reply_markup: new InlineKeyboard().text('⬅️ بازگشت', 'admin:tools') },
      );
    }
  });

  // ── List active codes ──────────────────────────────────────────────────────
  admin.callbackQuery('admin:tools:discount-list', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const codes = await prisma.discountCode.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (!codes.length) {
      await ctx.editMessageText(
        '🎟️ <b>کدهای تخفیف فعال</b>\n\nهیچ کد فعالی وجود نداره.',
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('➕ ساخت کد جدید', 'admin:tools:discount-create')
            .row()
            .text('⬅️ بازگشت', 'admin:tools'),
        },
      );
      return;
    }

    const kb = new InlineKeyboard();
    for (const dc of codes) {
      kb.text(`🎟️ ${dc.code} — ${dc.percentOff}٪`, `admin:discount:view:${dc.id}`).row();
    }
    kb.text('➕ ساخت کد جدید', 'admin:tools:discount-create').row();
    kb.text('⬅️ بازگشت', 'admin:tools');

    const lines = codes.map((dc) => {
      const uses = `${dc.usedCount}/${dc.maxUses ?? '∞'}`;
      const expiry = dc.expiresAt ? `تا ${shortDate(dc.expiresAt)}` : 'بدون انقضا';
      return `▫️ <code>${dc.code}</code> — ${dc.percentOff}٪ — ${uses} استفاده — ${expiry}`;
    });

    await ctx.editMessageText(
      `🎟️ <b>کدهای تخفیف فعال</b>\n\n${lines.join('\n')}\n\nتعداد کل: ${codes.length}`,
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });

  // ── Code detail view ───────────────────────────────────────────────────────
  admin.callbackQuery(/^admin:discount:view:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.callbackQuery.data.slice('admin:discount:view:'.length), 10);
    const dc = await prisma.discountCode.findUnique({ where: { id } });
    if (!dc) {
      await ctx.answerCallbackQuery({ text: '❌ کد پیدا نشد', show_alert: true });
      return;
    }

    const usesStr = `${dc.usedCount} / ${dc.maxUses ?? 'نامحدود'}`;
    const expiryStr = dc.expiresAt ? formatDateIR(dc.expiresAt) : 'بدون انقضا';

    const kb = new InlineKeyboard();
    if (dc.isActive) {
      kb.text('❌ غیرفعال کن', `admin:discount:deactivate:${dc.id}`).row();
    }
    kb.text('⬅️ بازگشت', 'admin:tools:discount-list');

    await ctx.editMessageText(
      `🎟️ <b>${dc.code}</b>\n\n` +
      `- درصد: ${dc.percentOff}٪\n` +
      `- استفاده: ${usesStr}\n` +
      `- انقضا: ${expiryStr}\n` +
      `- فعال: ${dc.isActive ? '✅' : '❌'}\n` +
      `- ساخته شده: ${timeAgo(dc.createdAt)}`,
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });

  // ── Deactivate confirm prompt ──────────────────────────────────────────────
  admin.callbackQuery(/^admin:discount:deactivate:\d/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.callbackQuery.data.slice('admin:discount:deactivate:'.length), 10);
    const dc = await prisma.discountCode.findUnique({ where: { id } });
    if (!dc) {
      await ctx.answerCallbackQuery({ text: '❌ کد پیدا نشد', show_alert: true });
      return;
    }

    await ctx.editMessageText(
      `⚠️ مطمئنی می‌خوای کد <code>${escapeHtml(dc.code)}</code> رو غیرفعال کنی؟\n` +
      `بعد از این، کسی نمی‌تونه ازش استفاده کنه.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✅ تأیید', `admin:discount:deactivate-confirm:${id}`)
          .text('❌ انصراف', `admin:discount:view:${id}`),
      },
    );
  });

  // ── Execute deactivation ───────────────────────────────────────────────────
  admin.callbackQuery(/^admin:discount:deactivate-confirm:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(
      ctx.callbackQuery.data.slice('admin:discount:deactivate-confirm:'.length), 10,
    );

    try {
      const dc = await prisma.discountCode.update({
        where: { id },
        data: { isActive: false },
      });

      await adminAuditService.log(prisma, {
        adminId: BigInt(ctx.from.id),
        type: 'CREATE_DISCOUNT',
        payload: { action: 'deactivate', code: dc.code },
      });

      await ctx.editMessageText(
        `✅ کد <code>${escapeHtml(dc.code)}</code> غیرفعال شد.`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('📋 لیست کدها', 'admin:tools:discount-list')
            .row()
            .text('⬅️ بازگشت', 'admin:tools'),
        },
      );
    } catch (err) {
      await ctx.editMessageText(
        `❌ خطا در غیرفعال‌سازی: ${escapeHtml(String(err).slice(0, 200))}`,
        { reply_markup: new InlineKeyboard().text('⬅️ بازگشت', 'admin:tools') },
      );
    }
  });

  // ── For-all: code applies to everyone ────────────────────────────────────
  admin.callbackQuery('admin:discount:for-all', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const adminId = ctx.from.id;
    const pending = getAdminPending(adminId);
    if (!pending || pending.kind !== 'discount-user-input') return;

    clearAdminPending(adminId);
    stashDiscountDraft(adminId, {
      code: pending.code,
      percentOff: pending.percentOff,
      maxUses: pending.maxUses,
      expiresAt: pending.expiresAt,
      minPurchase: pending.minPurchase,
      onlyForUserId: null,
    });

    const expiryLabel = pending.expiresAt ? formatDateIR(pending.expiresAt) : 'بدون انقضا';
    const minLabel = pending.minPurchase ? formatToman(pending.minPurchase) : 'بدون حداقل';
    await ctx.editMessageText(
      `📋 <b>خلاصه کد تخفیف:</b>\n\n` +
      `• کد: <code>${pending.code}</code>\n` +
      `• درصد: <b>${pending.percentOff}٪</b>\n` +
      `• حداقل خرید: ${minLabel}\n` +
      `• حداکثر استفاده: ${pending.maxUses === null ? 'نامحدود' : pending.maxUses}\n` +
      `• انقضا: ${expiryLabel}\n` +
      `• مخصوص کاربر: همه\n\n` +
      `تأیید می‌کنی؟`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✅ بساز', 'admin:discount:confirm')
          .text('❌ انصراف', 'admin:cancel-pending'),
      },
    );
  });

  // ── For-user: prompt for Telegram user ID ─────────────────────────────────
  admin.callbackQuery('admin:discount:for-user', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const adminId = ctx.from.id;
    const pending = getAdminPending(adminId);
    if (!pending || pending.kind !== 'discount-user-input') return;

    setAdminPending(adminId, {
      kind: 'discount-user-id-input',
      code: pending.code,
      percentOff: pending.percentOff,
      maxUses: pending.maxUses,
      expiresAt: pending.expiresAt,
      minPurchase: pending.minPurchase,
    });
    await ctx.editMessageText(
      'آی‌دی تلگرام کاربر مورد نظر رو بفرست:',
      { reply_markup: cancelPendingKeyboard() },
    );
  });

  bot.use(admin);

  // ── Text handler: multi-step discount input ────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    const adminId = ctx.from.id;
    if (!config.ADMIN_IDS.includes(adminId)) return next();

    const pending = getAdminPending(adminId);
    if (!pending) return next();

    const rawText = ctx.message.text.trim();
    if (rawText.startsWith('/')) return next();

    // ── Step 1: code input ──────────────────────────────────────────────────
    if (pending.kind === 'discount-code-input') {
      const code = rawText.toUpperCase();
      if (!/^[A-Z0-9]{3,20}$/.test(code)) {
        await ctx.reply('❌ کد نامعتبر. فقط حروف انگلیسی و عدد، ۳ تا ۲۰ کاراکتر.');
        return;
      }
      const existing = await prisma.discountCode.findUnique({ where: { code } });
      if (existing) {
        await ctx.reply('❌ این کد قبلاً ساخته شده. یه کد دیگه بفرست.');
        return;
      }
      setAdminPending(adminId, { kind: 'discount-percent-input', code });
      await ctx.reply(
        `✅ کد: <code>${code}</code>\n\nدرصد تخفیف رو بفرست (عدد بین ۱ تا ۱۰۰).`,
        { parse_mode: 'HTML', reply_markup: cancelPendingKeyboard() },
      );
      return;
    }

    // ── Step 2: percent input ───────────────────────────────────────────────
    if (pending.kind === 'discount-percent-input') {
      const normalized = normalizePersianDigits(rawText);
      const percent = parseInt(normalized, 10);
      if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
        await ctx.reply('❌ عدد نامعتبر. باید بین ۱ تا ۱۰۰ باشه.');
        return;
      }
      setAdminPending(adminId, {
        kind: 'discount-max-uses-input',
        code: pending.code,
        percentOff: percent,
      });
      await ctx.reply(
        `✅ درصد: <b>${percent}٪</b>\n\n` +
        `حداکثر تعداد دفعات استفاده رو بفرست.\n\n` +
        `• یه عدد مثبت (مثلاً ۱۰۰)\n` +
        `• یا "-" بفرست برای نامحدود`,
        { parse_mode: 'HTML', reply_markup: cancelPendingKeyboard() },
      );
      return;
    }

    // ── Step 3: max uses input ──────────────────────────────────────────────
    if (pending.kind === 'discount-max-uses-input') {
      let maxUses: number | null;
      if (rawText === '-') {
        maxUses = null;
      } else {
        const n = parseInt(normalizePersianDigits(rawText), 10);
        if (!Number.isFinite(n) || n < 1) {
          await ctx.reply('❌ عدد نامعتبر. یه عدد مثبت بفرست یا "-" برای نامحدود.');
          return;
        }
        maxUses = n;
      }
      setAdminPending(adminId, {
        kind: 'discount-expiry-input',
        code: pending.code,
        percentOff: pending.percentOff,
        maxUses,
      });
      await ctx.reply(
        `✅ حداکثر استفاده: <b>${maxUses === null ? 'نامحدود' : maxUses}</b>\n\n` +
        `تاریخ انقضا رو بفرست.\n\n` +
        `• یه عدد به‌عنوان تعداد روز از الان (مثلاً ۳۰)\n` +
        `• یا "-" بفرست برای بدون انقضا`,
        { parse_mode: 'HTML', reply_markup: cancelPendingKeyboard() },
      );
      return;
    }

    // ── Step 4: expiry input → ask for min purchase ─────────────────────────
    if (pending.kind === 'discount-expiry-input') {
      let expiresAt: Date | null;
      if (rawText === '-') {
        expiresAt = null;
      } else {
        const days = parseInt(normalizePersianDigits(rawText), 10);
        if (!Number.isFinite(days) || days < 1 || days > 3650) {
          await ctx.reply('❌ عدد نامعتبر. عدد روز بین ۱ تا ۳۶۵۰ یا "-".');
          return;
        }
        expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);
      }

      const expiryLabel = expiresAt ? formatDateIR(expiresAt) : 'بدون انقضا';
      setAdminPending(adminId, {
        kind: 'discount-min-purchase-input',
        code: pending.code,
        percentOff: pending.percentOff,
        maxUses: pending.maxUses,
        expiresAt,
      });
      await ctx.reply(
        `✅ انقضا: <b>${expiryLabel}</b>\n\n` +
        `حداقل مبلغ خرید رو بفرست (به تومان).\n\n` +
        `• یه عدد مثبت (مثلاً <code>500000</code>)\n` +
        `• یا "-" برای بدون حداقل`,
        { parse_mode: 'HTML', reply_markup: cancelPendingKeyboard() },
      );
      return;
    }

    // ── Step 5: min purchase input → ask for user-specific ──────────────────
    if (pending.kind === 'discount-min-purchase-input') {
      let minPurchase: bigint | null;
      if (rawText === '-') {
        minPurchase = null;
      } else {
        const n = parseInt(normalizePersianDigits(rawText), 10);
        if (!Number.isFinite(n) || n < 1) {
          await ctx.reply('❌ عدد نامعتبر. یه عدد مثبت بفرست یا "-" برای بدون حداقل.');
          return;
        }
        minPurchase = BigInt(n);
      }

      const minLabel = minPurchase ? formatToman(minPurchase) : 'بدون حداقل';
      setAdminPending(adminId, {
        kind: 'discount-user-input',
        code: pending.code,
        percentOff: pending.percentOff,
        maxUses: pending.maxUses,
        expiresAt: pending.expiresAt,
        minPurchase,
      });
      await ctx.reply(
        `✅ حداقل خرید: <b>${minLabel}</b>\n\n` +
        `آیا این کد برای کاربر خاصی ـه؟`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('👤 بله — برای یه کاربر خاص', 'admin:discount:for-user').row()
            .text('👥 خیر — برای همه', 'admin:discount:for-all'),
        },
      );
      return;
    }

    // ── Step 6: user ID or username text input ──────────────────────────────
    if (pending.kind === 'discount-user-id-input') {
      const input = normalizePersianDigits(rawText);
      let targetUser: { id: bigint; username: string | null; firstName: string | null } | null = null;

      if (/^\d+$/.test(input)) {
        targetUser = await prisma.user.findUnique({
          where: { id: BigInt(input) },
          select: { id: true, username: true, firstName: true },
        });
      } else if (/^@?[a-zA-Z0-9_]+$/.test(input)) {
        const uname = input.replace(/^@/, '');
        targetUser = await prisma.user.findFirst({
          where: { username: { equals: uname, mode: 'insensitive' } },
          select: { id: true, username: true, firstName: true },
        });
      } else {
        await ctx.reply('❌ آی‌دی یا یوزرنیم نامعتبر. دوباره بفرست:');
        return;
      }

      if (!targetUser) {
        await ctx.reply('❌ کاربری با این مشخصات پیدا نشد. دوباره بفرست:');
        return;
      }

      let userLabel: string;
      if (targetUser.username) {
        userLabel = `@${targetUser.username}`;
      } else if (targetUser.firstName) {
        userLabel = escapeHtml(targetUser.firstName);
      } else {
        userLabel = `#${targetUser.id.toString().slice(-4)}`;
      }

      clearAdminPending(adminId);
      stashDiscountDraft(adminId, {
        code: pending.code,
        percentOff: pending.percentOff,
        maxUses: pending.maxUses,
        expiresAt: pending.expiresAt,
        minPurchase: pending.minPurchase,
        onlyForUserId: targetUser.id,
      });

      const expiryLabel = pending.expiresAt ? formatDateIR(pending.expiresAt) : 'بدون انقضا';
      const minLabel = pending.minPurchase ? formatToman(pending.minPurchase) : 'بدون حداقل';
      await ctx.reply(
        `📋 <b>خلاصه کد تخفیف:</b>\n\n` +
        `• کد: <code>${pending.code}</code>\n` +
        `• درصد: <b>${pending.percentOff}٪</b>\n` +
        `• حداقل خرید: ${minLabel}\n` +
        `• حداکثر استفاده: ${pending.maxUses === null ? 'نامحدود' : pending.maxUses}\n` +
        `• انقضا: ${expiryLabel}\n` +
        `• مخصوص کاربر: ${userLabel}\n\n` +
        `تأیید می‌کنی؟`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ بساز', 'admin:discount:confirm')
            .text('❌ انصراف', 'admin:cancel-pending'),
        },
      );
      return;
    }

    return next();
  });
}
