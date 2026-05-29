import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { adminUserService } from '@/services/admin-user.service';
import {
  adminMenuKeyboard,
  adminUsersKeyboard,
  adminUserProfileKeyboard,
  adminWalletConfirmKeyboard,
  adminBanConfirmKeyboard,
  adminCancelInputKeyboard,
} from '../../keyboards/admin.keyboard';
import {
  setAdminPending,
  getAdminPending,
  clearAdminPending,
  stashReason,
  popReason,
} from '@/bot/state/pending-admin-input';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { escapeHtml } from '@/lib/html';
import { formatToman, formatDateIR, timeAgo } from '@/lib/format';
import { logger } from '@/lib/logger';

type UserProfile = NonNullable<Awaited<ReturnType<typeof adminUserService.getProfile>>>;

const walletTxTypeLabel: Record<string, string> = {
  TOPUP_TON: '🪙 شارژ TON',
  TOPUP_ADMIN: '👨‍💼 شارژ ادمین',
  PURCHASE: '🛒 خرید',
  REFUND: '💸 برگشت وجه',
  REFERRAL_COMMISSION: '🤝 کمیسیون',
  ADMIN_DEDUCT: '➖ کسر ادمین',
};

function formatUserProfile(user: UserProfile): string {
  const name = escapeHtml(user.firstName ?? '—');
  const username = user.username ? `@${escapeHtml(user.username)}` : '—';
  const activeConfigs = user.configs.length;
  const totalConfigs = user._count.configs;
  const status = user.isBanned ? '🚫 مسدود' : '✅ فعال';
  const joinAgo = timeAgo(user.createdAt);

  return (
    `👤 <b>پروفایل کاربر</b>\n\n` +
    `نام: ${name}\n` +
    `یوزرنیم: ${username}\n` +
    `شناسه: <code>${user.id}</code>\n` +
    `موجودی: ${formatToman(user.walletBalance)}\n` +
    `کل خرید: ${formatToman(user.totalSpent)} (${user.totalPurchases} بار)\n` +
    `سرویس‌های فعال: ${activeConfigs} از ${totalConfigs}\n` +
    `عضویت: ${formatDateIR(user.createdAt)} (${joinAgo})\n` +
    `وضعیت: ${status}`
  );
}

export function registerAdminUsersHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();

  admin.callbackQuery('admin:users', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('👥 مدیریت کاربران', { reply_markup: adminUsersKeyboard() });
  });

  admin.callbackQuery('admin:users:search', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    setAdminPending(ctx.from.id, { kind: 'user-search' });
    await ctx.editMessageText(
      '🔍 شناسه، یوزرنیم (@...) یا نام کاربر رو وارد کن.\n\nبرای انصراف /cancel بزن.',
      { reply_markup: adminCancelInputKeyboard() },
    );
  });

  admin.callbackQuery('admin:users:recent', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const users = await adminUserService.listRecent();
    const kb = new InlineKeyboard();
    for (const u of users) {
      const label = u.username ? `@${u.username}` : (u.firstName ?? `#${u.id}`);
      kb.text(`${u.isBanned ? '🚫 ' : ''}${label}`, `admin:user:view:${u.id}`).row();
    }
    kb.text('⬅️ بازگشت', 'admin:users');
    await ctx.editMessageText('👥 آخرین کاربران:', { reply_markup: kb });
  });

  admin.callbackQuery(/^admin:user:view:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:view:'.length));
    const user = await adminUserService.getProfile(userId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: '❌ کاربر پیدا نشد', show_alert: true });
      return;
    }
    await ctx.editMessageText(formatUserProfile(user), {
      parse_mode: 'HTML',
      reply_markup: adminUserProfileKeyboard(user),
    });
  });

  admin.callbackQuery(/^admin:user:wallet-add:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:wallet-add:'.length));
    setAdminPending(ctx.from.id, { kind: 'wallet-add', targetUserId: userId });
    await ctx.editMessageText(
      '💰 مقدار افزودن (تومان) رو وارد کن:\n\nبرای انصراف /cancel بزن.',
      { reply_markup: adminCancelInputKeyboard() },
    );
  });

  admin.callbackQuery(/^admin:user:wallet-deduct:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:wallet-deduct:'.length));
    setAdminPending(ctx.from.id, { kind: 'wallet-deduct', targetUserId: userId });
    await ctx.editMessageText(
      '💸 مقدار کسر (تومان) رو وارد کن:\n\nبرای انصراف /cancel بزن.',
      { reply_markup: adminCancelInputKeyboard() },
    );
  });

  // Wallet confirm — all info in callback data, reason already stashed in reasonStore
  admin.callbackQuery(/^admin:user:wc:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const parts = ctx.callbackQuery.data.split(':');
    // admin:user:wc:{op}:{userId}:{amount}  → indices 3,4,5
    const opShort = parts[3] as 'add' | 'ded';
    const userId = BigInt(parts[4]);
    const amount = BigInt(parts[5]);
    const reason = popReason(ctx.from.id) ?? null;

    try {
      const updated = await adminUserService.adjustWallet({
        adminId: BigInt(ctx.from.id),
        userId,
        amount,
        op: opShort === 'add' ? 'add' : 'deduct',
        reason,
      });

      const opLabel = opShort === 'add' ? 'اضافه شد' : 'کسر شد';
      await ctx.editMessageText(
        `✅ <b>${formatToman(amount)} ${opLabel}</b>\n\nموجودی جدید: ${formatToman(updated.walletBalance)}`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(
            '⬅️ بازگشت به پروفایل',
            `admin:user:view:${userId}`,
          ),
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'عملیات انجام نشد';
      logger.error({ err, userId: userId.toString(), op: opShort }, 'adjustWallet failed');
      await ctx.editMessageText(`❌ خطا: ${escapeHtml(msg)}`, {
        reply_markup: new InlineKeyboard().text(
          '⬅️ بازگشت به پروفایل',
          `admin:user:view:${userId}`,
        ),
      });
    }
  });

  // Ban confirmation prompt (data: admin:user:ban:{userId} — userId is digits only)
  admin.callbackQuery(/^admin:user:ban:\d/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.callbackQuery.data.slice('admin:user:ban:'.length);
    await ctx.editMessageText(`⚠️ آیا از مسدود کردن کاربر <code>${userId}</code> مطمئنی؟`, {
      parse_mode: 'HTML',
      reply_markup: adminBanConfirmKeyboard(userId, 'ban'),
    });
  });

  // Unban confirmation prompt (data: admin:user:unban:{userId})
  admin.callbackQuery(/^admin:user:unban:\d/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.callbackQuery.data.slice('admin:user:unban:'.length);
    await ctx.editMessageText(
      `🔓 آیا از رفع مسدودیت کاربر <code>${userId}</code> مطمئنی؟`,
      {
        parse_mode: 'HTML',
        reply_markup: adminBanConfirmKeyboard(userId, 'unban'),
      },
    );
  });

  // Execute ban
  admin.callbackQuery(/^admin:user:ban-confirm:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:ban-confirm:'.length));
    try {
      await adminUserService.setBanned({ adminId: BigInt(ctx.from.id), userId, isBanned: true });
      const user = await adminUserService.getProfile(userId);
      await ctx.editMessageText(
        `🚫 کاربر <code>${userId}</code> مسدود شد.\n\n` +
          (user ? formatUserProfile(user) : ''),
        {
          parse_mode: 'HTML',
          reply_markup: user ? adminUserProfileKeyboard(user) : undefined,
        },
      );
    } catch (err) {
      logger.error({ err, userId: userId.toString() }, 'setBanned failed');
      await ctx.editMessageText('❌ خطا در مسدود کردن کاربر.');
    }
  });

  // Execute unban
  admin.callbackQuery(/^admin:user:unban-confirm:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:unban-confirm:'.length));
    try {
      await adminUserService.setBanned({ adminId: BigInt(ctx.from.id), userId, isBanned: false });
      const user = await adminUserService.getProfile(userId);
      await ctx.editMessageText(
        `✅ مسدودیت کاربر <code>${userId}</code> رفع شد.\n\n` +
          (user ? formatUserProfile(user) : ''),
        {
          parse_mode: 'HTML',
          reply_markup: user ? adminUserProfileKeyboard(user) : undefined,
        },
      );
    } catch (err) {
      logger.error({ err, userId: userId.toString() }, 'setUnbanned failed');
      await ctx.editMessageText('❌ خطا در رفع مسدودیت کاربر.');
    }
  });

  // Configs list
  admin.callbackQuery(/^admin:user:configs:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:configs:'.length));
    const configs = await prisma.vpnConfig.findMany({
      where: { userId, status: { not: 'DELETED' } },
      include: { server: { select: { name: true, flag: true } } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    if (!configs.length) {
      await ctx.answerCallbackQuery({ text: 'این کاربر سرویسی ندارد.', show_alert: true });
      return;
    }

    const statusEmoji: Record<string, string> = {
      ACTIVE: '🟢',
      EXPIRED: '🔴',
      SUSPENDED: '🟡',
    };
    let text = `📋 <b>سرویس‌های کاربر ${userId}</b>\n\n`;
    for (const c of configs) {
      const em = statusEmoji[c.status] ?? '⚫';
      const server = c.serverLabel ?? (c.server ? `${c.server.flag ?? ''}${escapeHtml(c.server.name)}` : '—');
      text += `${em} #${c.id} — ${server}\n`;
    }

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('⬅️ بازگشت', `admin:user:view:${userId}`),
    });
  });

  // Wallet history
  admin.callbackQuery(/^admin:user:wh:/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.callbackQuery.data.slice('admin:user:wh:'.length));
    const txs = await adminUserService.getWalletHistory(userId);

    if (!txs.length) {
      await ctx.answerCallbackQuery({ text: 'تراکنشی ثبت نشده.', show_alert: true });
      return;
    }

    let text = `💳 <b>تاریخچه کیف پول ${userId}</b>\n\n`;
    for (const tx of txs) {
      const sign = tx.amountToman >= 0n ? '+' : '';
      const typeLabel = walletTxTypeLabel[tx.type] ?? tx.type;
      text += `${sign}${formatToman(tx.amountToman)} — ${typeLabel} — ${timeAgo(tx.createdAt)}\n`;
    }

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('⬅️ بازگشت', `admin:user:view:${userId}`),
    });
  });

  // Cancel pending admin input
  admin.callbackQuery('admin:cancel', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    clearAdminPending(ctx.from.id);
    await ctx.editMessageText('پنل مدیریت 🔧', { reply_markup: adminMenuKeyboard() });
  });

  bot.use(admin);

  // /cancel command — consumes only if admin has pending input (otherwise falls through)
  bot.command('cancel', async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    const adminId = ctx.from?.id;
    if (!adminId || !config.ADMIN_IDS.includes(adminId)) return next();

    const pending = getAdminPending(adminId);
    if (!pending) return next();

    clearAdminPending(adminId);
    await ctx.reply('❌ عملیات لغو شد.');
  });

  // Text messages — handles pending search / wallet amount / wallet reason
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    const adminId = ctx.from.id;
    if (!config.ADMIN_IDS.includes(adminId)) return next();

    const pending = getAdminPending(adminId);
    if (!pending) return next();

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return next();

    // ── user search ─────────────────────────────────────────────────────────
    if (pending.kind === 'user-search') {
      clearAdminPending(adminId);
      const results = await adminUserService.search(text);
      if (!results.length) {
        await ctx.reply('❌ کاربری پیدا نشد.');
        return;
      }
      if (results.length === 1) {
        const profile = await adminUserService.getProfile(results[0].id);
        if (!profile) {
          await ctx.reply('❌ کاربر پیدا نشد.');
          return;
        }
        await ctx.reply(formatUserProfile(profile), {
          parse_mode: 'HTML',
          reply_markup: adminUserProfileKeyboard(profile),
        });
        return;
      }
      const kb = new InlineKeyboard();
      for (const u of results) {
        const label = u.username ? `@${u.username}` : (u.firstName ?? `#${u.id}`);
        kb.text(`${u.isBanned ? '🚫 ' : ''}${label}`, `admin:user:view:${u.id}`).row();
      }
      await ctx.reply('کاربران یافت شده:', { reply_markup: kb });
      return;
    }

    // ── amount entry (first step) ────────────────────────────────────────────
    if (pending.kind === 'wallet-add' || pending.kind === 'wallet-deduct') {
      const rawAmount = parseInt(text.replace(/[,،]/g, ''), 10);
      if (isNaN(rawAmount) || rawAmount <= 0) {
        await ctx.reply('❌ مقدار نامعتبر. یک عدد صحیح مثبت وارد کن.');
        return;
      }
      const op = pending.kind === 'wallet-add' ? 'add' : 'deduct';
      const amount = BigInt(rawAmount);
      setAdminPending(adminId, {
        kind: 'wallet-amount-reason',
        targetUserId: pending.targetUserId,
        amount,
        op,
      });
      const opLabel = op === 'add' ? 'افزودن' : 'کسر';
      await ctx.reply(
        `دلیل ${opLabel} <b>${formatToman(amount)}</b> رو وارد کن.\n` +
          `برای عدم ذکر دلیل یک خط تیره (<code>-</code>) بفرست.\n\n` +
          `برای انصراف /cancel بزن.`,
        { parse_mode: 'HTML', reply_markup: adminCancelInputKeyboard() },
      );
      return;
    }

    // ── reason entry (second step) ───────────────────────────────────────────
    if (pending.kind === 'wallet-amount-reason') {
      const reason = text === '-' ? null : text;
      stashReason(adminId, reason);
      clearAdminPending(adminId);

      const opShort = pending.op === 'add' ? 'add' : 'ded';
      const userId = pending.targetUserId.toString();
      const opLabel = pending.op === 'add' ? 'افزودن' : 'کسر';

      await ctx.reply(
        `تأیید ${opLabel} <b>${formatToman(pending.amount)}</b> برای کاربر <code>${userId}</code>` +
          (reason ? `\nدلیل: ${escapeHtml(reason)}` : ''),
        {
          parse_mode: 'HTML',
          reply_markup: adminWalletConfirmKeyboard(opShort, userId, pending.amount),
        },
      );
      return;
    }

    return next();
  });
}
