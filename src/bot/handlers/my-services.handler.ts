import { type Bot, InputFile, InlineKeyboard } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { ConfigStatus } from '@prisma/client';
import { configService, buildSubUrl } from '@/services/config.service';
// TODO: re-enable when extension/traffic-add features are ready
// import { renewalService } from '@/services/renewal.service';
// import { getTrafficPackage, TRAFFIC_PACKAGES } from '@/services/traffic-packages';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { escapeHtml, formatTehranTime } from '@/lib/html';
import { formatBytes, formatGB, formatToman, formatDateIR, daysRemaining, progressBar } from '@/lib/format';
import { generateQRBuffer } from '@/lib/qrcode';
import {
  configListKeyboard,
  configDetailKeyboard,
  // TODO: re-enable when extension/traffic-add features are ready
  // extendPlansKeyboard,
  // extendConfirmKeyboard,
  insufficientBalanceKeyboard,
  // trafficPackagesKeyboard,
  // trafficConfirmKeyboard,
  backToConfigKeyboard,
} from '../keyboards/my-services.keyboard';

// ─── Text builders ────────────────────────────────────────────────────────────

function buildListText(): string {
  return '🛡️ <b>سرویس‌های من</b>\n\nروی هر سرویس بزن تا جزئیاتش رو ببینی:';
}

function buildDetailText(
  cfg: Awaited<ReturnType<typeof configService.getById>> & object,
  traffic: { up: bigint; down: bigint; total: bigint; stale: boolean },
): string {
  const usedBytes = traffic.up + traffic.down;
  const usedGB = Number(usedBytes) / 1024 ** 3;
  const isUnlimited = cfg.totalGB === 0;
  const days = daysRemaining(cfg.expiryAt);

  let statusBadge: string;
  if (cfg.status === ConfigStatus.DISABLED) {
    statusBadge = '⛔️ غیرفعال توسط ادمین';
  } else if (cfg.status === ConfigStatus.EXPIRED || (cfg.expiryAt && cfg.expiryAt <= new Date())) {
    statusBadge = '🔴 منقضی';
  } else if (days !== null && days <= 3) {
    statusBadge = '🟡 فعال (کم مونده)';
  } else {
    statusBadge = '🟢 فعال';
  }

  const lines: string[] = [
    `🛡️ <b>سرویس #${cfg.id}</b>`,
    '',
    `📍 سرور: ${cfg.server.flag ?? ''}${escapeHtml(cfg.server.name)}`,
    `📊 وضعیت: ${statusBadge}`,
    '',
  ];

  if (isUnlimited) {
    lines.push(`📦 حجم مصرفی: ${formatBytes(usedBytes)} (نامحدود)`);
  } else {
    const ratio = usedGB / cfg.totalGB;
    const pct = Math.min(100, Math.round(ratio * 100));
    const bar = progressBar(ratio);
    lines.push(`📦 حجم: ${formatBytes(usedBytes)} از ${formatGB(cfg.totalGB)}  (مصرف ${pct}٪)`);
    lines.push(bar);
  }

  lines.push('');

  if (cfg.expiryAt) {
    const daysText =
      days === null ? 'نامحدود' : days === 0 ? 'منقضی شده' : `${days} روز دیگه`;
    lines.push(`⏱ انقضا: ${daysText}`);
    lines.push(`📅 تاریخ پایان: ${formatDateIR(cfg.expiryAt)}`);
  } else {
    lines.push('⏱ انقضا: نامحدود');
  }

  lines.push('');
  lines.push(`🆔 شناسه: <code>${cfg.subId}</code>`);

  if (traffic.stale) {
    lines.push('');
    lines.push('⚠️ اطلاعات ترافیک از کش — ممکنه به‌روز نباشه');
  }

  return lines.join('\n');
}

// ─── Channel sale log ─────────────────────────────────────────────────────────

async function postSaleToChannel(
  ctx: BotContext,
  opts: {
    configId: number;
    type: string;
    amount: bigint;
    newBalance: bigint;
    detail: string;
  },
): Promise<void> {
  try {
    const userId = BigInt(ctx.from!.id);
    const username = ctx.from?.username ? `@${ctx.from.username}` : `#${userId}`;
    const firstName = escapeHtml(ctx.from?.first_name ?? 'کاربر');

    const text =
      `💸 <b>خرید جدید</b>\n\n` +
      `👤 کاربر: ${firstName} (${username})\n` +
      `🛡️ سرویس: #${opts.configId}\n` +
      `📦 نوع: ${opts.type}\n` +
      `💰 مبلغ: ${formatToman(opts.amount)} (از کیف پول)\n` +
      `${opts.detail}\n` +
      `💼 موجودی بعد از خرید: ${formatToman(opts.newBalance)}`;

    await ctx.api.sendMessage(config.LOG_CHANNEL_ID, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '👤 پروفایل کاربر', callback_data: `admin:user:${userId}` },
          { text: '🛡️ سرویس', callback_data: `admin:config:${opts.configId}` },
        ]],
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to post sale to log channel');
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function registerMyServicesHandler(bot: Bot<BotContext>): void {
  // ── Entry: main menu button ──────────────────────────────────────────────

  bot.hears(MENU.MY_SERVICES, async (ctx) => {
    const userId = BigInt(ctx.from!.id);
    const configs = await configService.listByUser(userId);

    if (configs.length === 0) {
      await ctx.reply(
        '🛡️ <b>سرویس‌های من</b>\n\nهنوز سرویسی نداری. از منوی «🛒 خرید سرویس» اولین کانفیگت رو بساز.',
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('🛒 خرید سرویس', 'svc:goto-buy'),
        },
      );
      return;
    }

    await ctx.reply(buildListText(), {
      parse_mode: 'HTML',
      reply_markup: configListKeyboard(configs),
    });
  });

  // ── svc:list — re-render list ────────────────────────────────────────────

  bot.callbackQuery('svc:list', async (ctx) => {
    const userId = BigInt(ctx.from.id);
    const configs = await configService.listByUser(userId);

    if (configs.length === 0) {
      await ctx.editMessageText(
        '🛡️ <b>سرویس‌های من</b>\n\nهنوز سرویسی نداری.',
        { parse_mode: 'HTML' },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.editMessageText(buildListText(), {
      parse_mode: 'HTML',
      reply_markup: configListKeyboard(configs),
    });
    await ctx.answerCallbackQuery();
  });

  // ── svc:view:{configId} — detail screen ─────────────────────────────────

  bot.callbackQuery(/^svc:view:/, async (ctx) => {
    const configId = parseInt(ctx.callbackQuery.data.slice('svc:view:'.length), 10);
    const userId = BigInt(ctx.from.id);
    const cfg = await configService.getById(configId, userId);

    if (!cfg) {
      await ctx.answerCallbackQuery('❌ سرویس یافت نشد');
      return;
    }

    if (cfg.status === ConfigStatus.DISABLED) {
      await ctx.editMessageText(
        `🛡️ <b>سرویس #${cfg.id}</b>\n\n⛔️ این سرویس توسط ادمین غیرفعال شده.\nبرای راهنمایی با پشتیبانی تماس بگیر.`,
        {
          parse_mode: 'HTML',
          reply_markup: configDetailKeyboard(configId, ConfigStatus.DISABLED, cfg.totalGB === 0),
        },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    const traffic = await configService.syncTraffic(configId);
    const text = buildDetailText(cfg, traffic);

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: configDetailKeyboard(configId, cfg.status, cfg.totalGB === 0),
    });
    await ctx.answerCallbackQuery();
  });

  // ── svc:sub:{configId} — send sub link ──────────────────────────────────

  bot.callbackQuery(/^svc:sub:/, async (ctx) => {
    const configId = parseInt(ctx.callbackQuery.data.slice('svc:sub:'.length), 10);
    const userId = BigInt(ctx.from.id);
    const cfg = await configService.getById(configId, userId);

    if (!cfg) {
      await ctx.answerCallbackQuery('❌ سرویس یافت نشد');
      return;
    }

    const url = buildSubUrl(cfg.server, cfg.subId);

    await ctx.reply(
      `🔗 لینک اشتراک سرویس #${cfg.id}:\n\n` +
        `<code>${url}</code>\n\n` +
        'این لینک رو کپی کن و تو برنامه VPN خودت ایمپورت کن.\n\n' +
        '❓ راهنمای اتصال: «📲 دریافت نرم‌افزار»',
      { parse_mode: 'HTML' },
    );
    await ctx.answerCallbackQuery({ text: '📋 لینک ارسال شد' });
  });

  // ── svc:qr:{configId} — QR code ─────────────────────────────────────────

  bot.callbackQuery(/^svc:qr:/, async (ctx) => {
    const configId = parseInt(ctx.callbackQuery.data.slice('svc:qr:'.length), 10);
    const userId = BigInt(ctx.from.id);
    const cfg = await configService.getById(configId, userId);

    if (!cfg) {
      await ctx.answerCallbackQuery('❌ سرویس یافت نشد');
      return;
    }

    const url = buildSubUrl(cfg.server, cfg.subId);

    try {
      const buffer = await generateQRBuffer(url);
      await ctx.replyWithPhoto(new InputFile(buffer, 'qr.png'), {
        caption:
          `🔳 QR کد سرویس #${cfg.id}\n\n` +
          'با اسکن این QR از داخل برنامه VPN، کانفیگت ایمپورت میشه.',
      });
      await ctx.answerCallbackQuery({ text: '🔳 QR ارسال شد' });
    } catch (err) {
      logger.error({ err, configId }, 'QR generation failed');
      await ctx.answerCallbackQuery('❌ خطا در ساخت QR');
    }
  });

  // TODO: re-enable when extension/traffic-add features are ready

  // // ── svc:extend:{configId} — show plans ────────────────────────────────
  // bot.callbackQuery(/^svc:extend:(?!\w*-\w*)/, async (ctx) => {
  //   const configId = parseInt(ctx.callbackQuery.data.slice('svc:extend:'.length), 10);
  //   const userId = BigInt(ctx.from.id);
  //   const cfg = await configService.getById(configId, userId);
  //   if (!cfg) { await ctx.answerCallbackQuery('❌ سرویس یافت نشد'); return; }
  //   const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  //   if (plans.length === 0) { await ctx.answerCallbackQuery('❌ در حال حاضر پلنی موجود نیست'); return; }
  //   await ctx.editMessageText(
  //     `➕ <b>تمدید سرویس #${cfg.id}</b>\n\nپلن مورد نظرت رو انتخاب کن. زمان به انقضای فعلی اضافه میشه:`,
  //     { parse_mode: 'HTML', reply_markup: extendPlansKeyboard(configId, plans) },
  //   );
  //   await ctx.answerCallbackQuery();
  // });

  // // ── svc:extend-confirm:{configId}:{planId} ────────────────────────────
  // bot.callbackQuery(/^svc:extend-confirm:/, async (ctx) => {
  //   const parts = ctx.callbackQuery.data.slice('svc:extend-confirm:'.length).split(':');
  //   const configId = parseInt(parts[0], 10);
  //   const planId = parseInt(parts[1], 10);
  //   const userId = BigInt(ctx.from.id);
  //   const [user, plan] = await Promise.all([
  //     prisma.user.findUnique({ where: { id: userId } }),
  //     prisma.plan.findUnique({ where: { id: planId } }),
  //   ]);
  //   if (!user || !plan || !plan.isActive) { await ctx.answerCallbackQuery('❌ پلن یافت نشد'); return; }
  //   const after = user.walletBalance - plan.priceToman;
  //   if (after < 0n) {
  //     const shortage = plan.priceToman - user.walletBalance;
  //     await ctx.editMessageText(
  //       `❌ <b>موجودی کافی نیست</b>\n\nموجودی کیف پول: ${formatToman(user.walletBalance)}\nمبلغ مورد نیاز: ${formatToman(plan.priceToman)}\nکمبود: ${formatToman(shortage)}\n\nاول کیف پولت رو شارژ کن.`,
  //       { parse_mode: 'HTML', reply_markup: insufficientBalanceKeyboard() },
  //     );
  //     await ctx.answerCallbackQuery();
  //     return;
  //   }
  //   await ctx.editMessageText(
  //     `✅ <b>تأیید تمدید سرویس #${configId}</b>\n\nپلن انتخابی: ${plan.title} (${formatToman(plan.priceToman)})\nموجودی کیف پول: ${formatToman(user.walletBalance)}\nبعد از خرید: ${formatToman(after)}\n\nتأیید می‌کنی؟`,
  //     { parse_mode: 'HTML', reply_markup: extendConfirmKeyboard(configId, planId) },
  //   );
  //   await ctx.answerCallbackQuery();
  // });

  // // ── svc:extend-do:{configId}:{planId} ─────────────────────────────────
  // bot.callbackQuery(/^svc:extend-do:/, async (ctx) => {
  //   const parts = ctx.callbackQuery.data.slice('svc:extend-do:'.length).split(':');
  //   const configId = parseInt(parts[0], 10);
  //   const planId = parseInt(parts[1], 10);
  //   const userId = BigInt(ctx.from.id);
  //   await ctx.answerCallbackQuery({ text: '⏳ در حال پردازش...' });
  //   const result = await renewalService.extend({ userId, configId, planId });
  //   if (!result.ok) {
  //     const msgMap: Record<string, string> = {
  //       NOT_FOUND: '❌ سرویس یا پلن یافت نشد.',
  //       INSUFFICIENT_BALANCE: '❌ موجودی کافی نیست. لطفاً کیف پولت رو شارژ کن.',
  //       PLAN_INACTIVE: '❌ این پلن دیگه فعال نیست.',
  //       PANEL_ERROR: '❌ خطا در ارتباط با سرور. لطفاً دوباره امتحان کن.',
  //     };
  //     await ctx.editMessageText(msgMap[result.reason] ?? '❌ خطای ناشناخته.', { reply_markup: backToConfigKeyboard(configId) });
  //     return;
  //   }
  //   const plan = await prisma.plan.findUnique({ where: { id: planId } });
  //   await ctx.editMessageText(
  //     `✅ <b>تمدید با موفقیت انجام شد</b>\n\n📅 تاریخ پایان جدید: ${formatDateIR(result.newExpiry)}\n💰 موجودی فعلی: ${formatToman(result.newBalance)}`,
  //     { parse_mode: 'HTML', reply_markup: backToConfigKeyboard(configId) },
  //   );
  //   await postSaleToChannel(ctx, {
  //     configId,
  //     type: `تمدید ${plan?.durationDays ?? '?'} روزه`,
  //     amount: plan?.priceToman ?? 0n,
  //     newBalance: result.newBalance,
  //     detail: `📅 انقضای جدید: ${formatTehranTime(result.newExpiry)}`,
  //   });
  // });

  // // ── svc:traffic:{configId} — show packages ────────────────────────────
  // bot.callbackQuery(/^svc:traffic:(?!\w*-\w*)/, async (ctx) => {
  //   const configId = parseInt(ctx.callbackQuery.data.slice('svc:traffic:'.length), 10);
  //   const userId = BigInt(ctx.from.id);
  //   const cfg = await configService.getById(configId, userId);
  //   if (!cfg) { await ctx.answerCallbackQuery('❌ سرویس یافت نشد'); return; }
  //   if (cfg.totalGB === 0) { await ctx.answerCallbackQuery('❌ سرویس نامحدود نیاز به افزایش حجم ندارد'); return; }
  //   await ctx.editMessageText(
  //     `📦 <b>افزایش حجم سرویس #${cfg.id}</b>\n\nحجم فعلی: ${formatGB(cfg.totalGB)}\n\nپکیج مورد نظرت رو انتخاب کن:`,
  //     { parse_mode: 'HTML', reply_markup: trafficPackagesKeyboard(configId) },
  //   );
  //   await ctx.answerCallbackQuery();
  // });

  // // ── svc:traffic-confirm:{configId}:{pkgId} ────────────────────────────
  // bot.callbackQuery(/^svc:traffic-confirm:/, async (ctx) => {
  //   const parts = ctx.callbackQuery.data.slice('svc:traffic-confirm:'.length).split(':');
  //   const configId = parseInt(parts[0], 10);
  //   const pkgId = parseInt(parts[1], 10);
  //   const userId = BigInt(ctx.from.id);
  //   const pkg = getTrafficPackage(pkgId);
  //   const user = await prisma.user.findUnique({ where: { id: userId } });
  //   if (!pkg || !user) { await ctx.answerCallbackQuery('❌ پکیج یافت نشد'); return; }
  //   const after = user.walletBalance - pkg.priceToman;
  //   if (after < 0n) {
  //     const shortage = pkg.priceToman - user.walletBalance;
  //     await ctx.editMessageText(
  //       `❌ <b>موجودی کافی نیست</b>\n\nموجودی کیف پول: ${formatToman(user.walletBalance)}\nمبلغ مورد نیاز: ${formatToman(pkg.priceToman)}\nکمبود: ${formatToman(shortage)}\n\nاول کیف پولت رو شارژ کن.`,
  //       { parse_mode: 'HTML', reply_markup: insufficientBalanceKeyboard() },
  //     );
  //     await ctx.answerCallbackQuery();
  //     return;
  //   }
  //   await ctx.editMessageText(
  //     `✅ <b>تأیید افزایش حجم سرویس #${configId}</b>\n\nپکیج انتخابی: +${pkg.gb} گیگ (${formatToman(pkg.priceToman)})\nموجودی کیف پول: ${formatToman(user.walletBalance)}\nبعد از خرید: ${formatToman(after)}\n\nتأیید می‌کنی؟`,
  //     { parse_mode: 'HTML', reply_markup: trafficConfirmKeyboard(configId, pkgId) },
  //   );
  //   await ctx.answerCallbackQuery();
  // });

  // // ── svc:traffic-do:{configId}:{pkgId} ─────────────────────────────────
  // bot.callbackQuery(/^svc:traffic-do:/, async (ctx) => {
  //   const parts = ctx.callbackQuery.data.slice('svc:traffic-do:'.length).split(':');
  //   const configId = parseInt(parts[0], 10);
  //   const pkgId = parseInt(parts[1], 10);
  //   const userId = BigInt(ctx.from.id);
  //   await ctx.answerCallbackQuery({ text: '⏳ در حال پردازش...' });
  //   const result = await renewalService.addTraffic({ userId, configId, packageId: pkgId });
  //   if (!result.ok) {
  //     const msgMap: Record<string, string> = {
  //       NOT_FOUND: '❌ سرویس یا پکیج یافت نشد.',
  //       INSUFFICIENT_BALANCE: '❌ موجودی کافی نیست. لطفاً کیف پولت رو شارژ کن.',
  //       UNLIMITED: '❌ سرویس نامحدود نیاز به افزایش حجم ندارد.',
  //       PANEL_ERROR: '❌ خطا در ارتباط با سرور. لطفاً دوباره امتحان کن.',
  //     };
  //     await ctx.editMessageText(msgMap[result.reason] ?? '❌ خطای ناشناخته.', { reply_markup: backToConfigKeyboard(configId) });
  //     return;
  //   }
  //   const pkg = getTrafficPackage(pkgId);
  //   await ctx.editMessageText(
  //     `✅ <b>افزایش حجم با موفقیت انجام شد</b>\n\n📦 حجم جدید: ${formatGB(result.newTotalGB)}\n💰 موجودی فعلی: ${formatToman(result.newBalance)}`,
  //     { parse_mode: 'HTML', reply_markup: backToConfigKeyboard(configId) },
  //   );
  //   await postSaleToChannel(ctx, {
  //     configId,
  //     type: `افزایش حجم +${pkg?.gb ?? '?'} گیگ`,
  //     amount: pkg?.priceToman ?? 0n,
  //     newBalance: result.newBalance,
  //     detail: `📦 حجم جدید: ${formatGB(result.newTotalGB)}`,
  //   });
  // });

  // ── svc:support:{configId} ────────────────────────────────────────────────

  bot.callbackQuery(/^svc:support:/, async (ctx) => {
    const configId = ctx.callbackQuery.data.slice('svc:support:'.length);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💬 پشتیبانی برای سرویس #${configId}\n\nپیامت رو بفرست — لطفاً جزئیات مشکل رو واضح بنویس.`,
    );
    await ctx.conversation.enter('supportMessage');
  });

  // ── svc:goto-buy (placeholder) ────────────────────────────────────────────

  bot.callbackQuery('svc:goto-buy', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('🚧 خرید سرویس به‌زودی...');
  });
}
