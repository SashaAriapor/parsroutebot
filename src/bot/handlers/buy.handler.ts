import { type Bot, InputFile } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/html';
import { formatToman, formatGB, formatDateIR } from '@/lib/format';
import { generateQRBuffer } from '@/lib/qrcode';
import { buyService } from '@/services/buy.service';
import { discountService } from '@/services/discount.service';
import { buildSubUrl } from '@/services/config.service';
import { type BuyState, getBuyState, setBuyState, clearBuyState } from '../state/pending-buy-state';
import {
  gbPickerKeyboard,
  serverListKeyboard,
  discountScreenKeyboard,
  summaryKeyboard,
  walletConfirmKeyboard,
  insufficientBuyKeyboard,
  successKeyboard,
  buyTonInvoiceKeyboard,
} from '../keyboards/buy.keyboard';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_GB_PICKS = [10, 30, 50, 100] as const;

function computeQuickPicks(): Array<{ gb: number; price: bigint }> {
  return QUICK_GB_PICKS.map((gb) => ({
    gb,
    price: BigInt(gb) * config.PRICE_PER_GB_TOMAN,
  }));
}

function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ─── Screen renderers ─────────────────────────────────────────────────────────

async function renderGBPicker(ctx: BotContext, edit: boolean): Promise<void> {
  const text =
    '🛒 <b>خرید سرویس جدید</b>\n\n' +
    `💵 قیمت هر گیگابایت: ${formatToman(config.PRICE_PER_GB_TOMAN)}\n` +
    `📅 مدت: ${config.DEFAULT_DURATION_DAYS} روز\n\n` +
    'حجم مورد نیاز رو انتخاب کن:';
  const kb = gbPickerKeyboard(computeQuickPicks());
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderCustomGBPrompt(ctx: BotContext, edit: boolean): Promise<void> {
  const text =
    '✏️ <b>حجم دلخواه</b>\n\n' +
    `تعداد گیگابایت مورد نیاز رو بنویس:\n` +
    `(بین ${config.MIN_GB} تا ${config.MAX_GB} گیگابایت)\n\n` +
    'مثلاً: <code>25</code>';
  const kb = { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'buy:cancel' }]] };
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderServerSelection(
  ctx: BotContext,
  servers: Awaited<ReturnType<typeof prisma.server.findMany>>,
  trafficGB: number,
  edit: boolean,
): Promise<void> {
  const price = BigInt(trafficGB) * config.PRICE_PER_GB_TOMAN;
  const text =
    `📍 <b>انتخاب سرور</b>\n\n` +
    `📦 حجم: ${formatGB(trafficGB)}\n` +
    `📅 مدت: ${config.DEFAULT_DURATION_DAYS} روز\n` +
    `💰 قیمت: ${formatToman(price)}\n\n` +
    'سرور دلخواهت رو انتخاب کن:';
  const kb = serverListKeyboard(servers);
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderDiscountScreen(ctx: BotContext, edit: boolean): Promise<void> {
  const text =
    '🎟️ <b>کد تخفیف</b>\n\n' +
    'اگه کد تخفیف داری همینجا برام بفرست.\n' +
    'اگه نداری روی «بدون تخفیف» بزن.';
  const kb = discountScreenKeyboard();
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderSummary(ctx: BotContext, state: BuyState, edit: boolean): Promise<void> {
  const userId = BigInt(ctx.from!.id);

  const [server, user] = await Promise.all([
    prisma.server.findUnique({ where: { id: state.serverId! } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!server || !user) {
    const errText = '❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.';
    if (edit) await ctx.editMessageText(errText);
    else await ctx.reply(errText);
    clearBuyState(ctx.from!.id);
    return;
  }

  const basePriceToman = state.basePriceToman!;
  const discountPercent = state.discountPercent ?? 0;
  const discountAmount = discountPercent > 0
    ? (basePriceToman * BigInt(discountPercent)) / 100n
    : 0n;
  const finalPrice = basePriceToman - discountAmount;

  setBuyState(ctx.from!.id, { discountAmount, finalPriceToman: finalPrice, awaitingDiscountInput: false });

  const lines = [
    '📋 <b>خلاصه سفارش</b>',
    '',
    `📦 حجم: ${formatGB(state.trafficGB!)}`,
    `📅 مدت: ${state.durationDays!} روز`,
    `📍 سرور: ${server.flag ?? ''}${escapeHtml(server.name)}`,
    '',
    `💵 قیمت: ${formatToman(basePriceToman)}`,
  ];

  if (discountPercent > 0) {
    lines.push(`🎟️ تخفیف: -${formatToman(discountAmount)} (${discountPercent}٪)`);
  }

  lines.push(
    '━━━━━━━━━━━━━━',
    `💰 مبلغ نهایی: <b>${formatToman(finalPrice)}</b>`,
    '',
    `💼 موجودی کیف پول: ${formatToman(user.walletBalance)}`,
    '',
    'روش پرداخت رو انتخاب کن:',
  );

  const text = lines.join('\n');
  const kb = summaryKeyboard();
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderWalletConfirm(ctx: BotContext, state: BuyState, edit: boolean): Promise<void> {
  const userId = BigInt(ctx.from!.id);

  const [server, user] = await Promise.all([
    prisma.server.findUnique({ where: { id: state.serverId! } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!server || !user || !state.finalPriceToman) {
    const errText = '❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.';
    if (edit) await ctx.editMessageText(errText);
    else await ctx.reply(errText);
    clearBuyState(ctx.from!.id);
    return;
  }

  if (user.walletBalance < state.finalPriceToman) {
    const shortage = state.finalPriceToman - user.walletBalance;
    const text =
      `❌ <b>موجودی کافی نیست</b>\n\n` +
      `موجودی فعلی: ${formatToman(user.walletBalance)}\n` +
      `مبلغ مورد نیاز: ${formatToman(state.finalPriceToman)}\n` +
      `کمبود: ${formatToman(shortage)}\n\n` +
      'اول کیف پولت رو شارژ کن.';
    const kb = insufficientBuyKeyboard();
    if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  const afterBalance = user.walletBalance - state.finalPriceToman;
  const text =
    `✅ <b>تأیید نهایی خرید</b>\n\n` +
    `📦 ${formatGB(state.trafficGB!)} — ${state.durationDays!} روز\n` +
    `📍 ${server.flag ?? ''}${escapeHtml(server.name)}\n` +
    `💰 مبلغ: ${formatToman(state.finalPriceToman)}\n\n` +
    `موجودی فعلی: ${formatToman(user.walletBalance)}\n` +
    `موجودی بعد از خرید: ${formatToman(afterBalance)}\n\n` +
    '⚠️ با تأیید، مبلغ از کیف پولت کسر میشه و کانفیگ بلافاصله ساخته میشه.';

  const kb = walletConfirmKeyboard();
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

// ─── Shared: pick GB and advance to next step ─────────────────────────────────

async function applyGBSelection(
  ctx: BotContext,
  gb: number,
  edit: boolean,
): Promise<void> {
  const userId = ctx.from!.id;
  const pricePerGB = config.PRICE_PER_GB_TOMAN;
  const durationDays = config.DEFAULT_DURATION_DAYS;
  const basePriceToman = BigInt(gb) * pricePerGB;

  clearBuyState(userId);
  setBuyState(userId, {
    trafficGB: gb,
    durationDays,
    pricePerGB,
    basePriceToman,
  });

  const servers = await prisma.server.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (servers.length === 0) {
    const errText = '❌ در حال حاضر سرور فعالی وجود نداره. لطفاً به پشتیبانی پیام بده.';
    if (edit) await ctx.editMessageText(errText);
    else await ctx.reply(errText);
    return;
  }

  if (servers.length === 1) {
    setBuyState(userId, { serverId: servers[0].id, awaitingDiscountInput: true });
    await renderDiscountScreen(ctx, edit);
  } else {
    await renderServerSelection(ctx, servers, gb, edit);
  }
}

// ─── Channel sale log ─────────────────────────────────────────────────────────

async function postBuySaleToChannel(
  ctx: BotContext,
  opts: {
    configId: number;
    trafficGB: number;
    durationDays: number;
    serverName: string;
    finalPrice: bigint;
    discountCode?: string;
    discountAmount: bigint;
    newBalance: bigint;
    referral: { credited: true; referrerId: bigint; commission: bigint } | { credited: false };
  },
): Promise<void> {
  try {
    const userId = BigInt(ctx.from!.id);
    const username = ctx.from?.username ? `@${ctx.from.username}` : `#${userId}`;
    const firstName = escapeHtml(ctx.from?.first_name ?? 'کاربر');

    const referralLine = opts.referral.credited
      ? `🤝 کمیسیون رفرال: +${formatToman(opts.referral.commission)} برای کاربر #${opts.referral.referrerId}\n`
      : '';

    const discountLine = opts.discountCode
      ? `🎟️ تخفیف: ${opts.discountCode} (-${formatToman(opts.discountAmount)})\n`
      : '🎟️ تخفیف: بدون تخفیف\n';

    const text =
      `💸 <b>خرید جدید — سرویس جدید</b>\n\n` +
      `👤 کاربر: ${firstName} (${username})\n` +
      `🛡️ سرویس: #${opts.configId}\n` +
      `📦 حجم: ${formatGB(opts.trafficGB)} — ${opts.durationDays} روز\n` +
      `📍 سرور: ${escapeHtml(opts.serverName)}\n` +
      `💰 مبلغ: ${formatToman(opts.finalPrice)}\n` +
      discountLine +
      `💼 موجودی بعد از خرید: ${formatToman(opts.newBalance)}\n` +
      referralLine;

    await ctx.api.sendMessage(config.LOG_CHANNEL_ID, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '👤 پروفایل کاربر', callback_data: `admin:user:${userId}` },
          { text: '🛡️ مشاهده سرویس', callback_data: `admin:config:${opts.configId}` },
        ]],
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to post buy sale to log channel');
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function registerBuyHandler(bot: Bot<BotContext>): void {
  // ── Entry: ReplyKeyboard tap ─────────────────────────────────────────────

  bot.hears(MENU.BUY, async (ctx) => {
    clearBuyState(ctx.from!.id);
    await renderGBPicker(ctx, false);
  });

  // ── Text input: custom GB or discount code ────────────────────────────────

  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();
    if (ctx.message.text.startsWith('/')) return next();

    const state = getBuyState(ctx.from.id);
    if (!state) return next();

    // Custom GB input
    if (state.awaitingGBInput) {
      const raw = normalizeDigits(ctx.message.text.trim());
      const gb = parseInt(raw, 10);

      if (isNaN(gb) || gb < config.MIN_GB || gb > config.MAX_GB) {
        await ctx.reply(
          `❌ عدد وارد شده معتبر نیست.\n` +
          `لطفاً یک عدد بین ${config.MIN_GB} تا ${config.MAX_GB} وارد کن.`,
        );
        return;
      }

      setBuyState(ctx.from.id, { awaitingGBInput: false });
      await applyGBSelection(ctx, gb, false);
      return;
    }

    // Discount code input
    if (state.awaitingDiscountInput) {
      const code = ctx.message.text.trim().toUpperCase();
      const result = await discountService.validate(code, BigInt(ctx.from.id));

      if (!result.ok) {
        await ctx.reply(`❌ ${result.reason}\n\nدوباره کد رو بفرست یا روی «بدون تخفیف» بزن.`);
        return;
      }

      setBuyState(ctx.from.id, {
        discountCode: code,
        discountPercent: result.percentOff,
        awaitingDiscountInput: false,
      });

      await ctx.reply('✅ کد تخفیف اعمال شد!');
      await renderSummary(ctx, getBuyState(ctx.from.id)!, false);
      return;
    }

    return next();
  });

  // ── /cancel command ───────────────────────────────────────────────────────

  bot.command('cancel', async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    if (!ctx.from) return next();

    const state = getBuyState(ctx.from.id);
    if (!state) return next();

    clearBuyState(ctx.from.id);
    await ctx.reply('❌ خرید لغو شد.');
  });

  // ── All buy:* callbacks ───────────────────────────────────────────────────

  bot.callbackQuery(/^buy:/, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // ── Cancel ──────────────────────────────────────────────────────────────
    if (data === 'buy:cancel') {
      clearBuyState(userId);
      await ctx.editMessageText('❌ خرید لغو شد.');
      await ctx.answerCallbackQuery();
      return;
    }

    // ── TON payment ──────────────────────────────────────────────────────────
    if (data === 'buy:pay:ton') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || !state.serverId || state.finalPriceToman == null) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery({ text: '⏳ در حال محاسبه...' });

      const result = await buyService.createPendingTonOrder({
        userId: BigInt(userId),
        serverId: state.serverId,
        trafficGB: state.trafficGB!,
        durationDays: state.durationDays!,
        pricePerGB: state.pricePerGB!,
        discountCode: state.discountCode,
        finalPriceToman: state.finalPriceToman,
      });

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          INVALID_DISCOUNT: `❌ کد تخفیف منقضی شده: ${result.reason}`,
          SERVER_INACTIVE: '❌ این سرور دیگه فعال نیست.',
          UNKNOWN: '❌ خطا در ثبت سفارش.',
        };
        await ctx.editMessageText(msgMap[result.code] ?? '❌ خطا در ثبت سفارش.');
        clearBuyState(userId);
        return;
      }

      clearBuyState(userId);

      const nanoTonDisplay = (Number(result.tonAmountNano) / 1e9).toFixed(6);
      const server = await prisma.server.findUnique({ where: { id: state.serverId! } });

      const text = [
        '🪙 <b>پرداخت با TON</b>',
        '',
        `📦 ${formatGB(state.trafficGB!)} — ${state.durationDays!} روز`,
        `📍 ${server?.flag ?? ''}${escapeHtml(server?.name ?? '—')}`,
        `💰 معادل: ${formatToman(state.finalPriceToman!)}`,
        '',
        `🪙 مبلغ TON: <b>${nanoTonDisplay} TON</b>`,
        `⏱ اعتبار نرخ: ${formatDateIR(result.expiresAt)}`,
        '',
        '📬 آدرس کیف پول:',
        `<code>${result.tonAddress}</code>`,
        '',
        '📝 موضوع پرداخت (حتماً وارد کن!):',
        `<code>${result.tonMemo}</code>`,
        '',
        '⚠️ موضوع پرداخت رو دقیقاً وارد کن.',
        'بعد از تأیید شبکه، سرویست به‌صورت خودکار فعال میشه.',
      ].join('\n');

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: buyTonInvoiceKeyboard(result.orderId),
      });
      return;
    }

    // ── TON QR code ──────────────────────────────────────────────────────────
    if (data.startsWith('buy:ton-qr:')) {
      const orderId = data.slice('buy:ton-qr:'.length);
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order || !order.tonMemo || !order.tonAmountNano) {
        await ctx.answerCallbackQuery({ text: '❌ اطلاعات سفارش یافت نشد', show_alert: true });
        return;
      }

      const deepLink = `ton://transfer/${config.TON_WALLET_ADDRESS}?amount=${order.tonAmountNano}&text=${encodeURIComponent(order.tonMemo)}`;

      try {
        const buffer = await generateQRBuffer(deepLink);
        await ctx.replyWithPhoto(new InputFile(buffer, 'qr.png'), {
          caption: `🔳 این QR رو در Tonkeeper یا کیف TON خودت اسکن کن.\n\n📝 موضوع: <code>${order.tonMemo}</code>`,
          parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
      } catch (err) {
        logger.error({ err }, 'Failed to generate buy TON QR');
        await ctx.answerCallbackQuery({ text: '❌ خطا در ساخت QR', show_alert: true });
      }
      return;
    }

    // ── TON paid acknowledgement ──────────────────────────────────────────────
    if (data === 'buy:ton-paid') {
      await ctx.answerCallbackQuery({
        text: '✅ پرداخت پیگیری میشه. بعد از تأیید شبکه، سرویست فعال میشه.',
        show_alert: true,
      });
      return;
    }

    // ── Cancel pending TON order ──────────────────────────────────────────────
    if (data.startsWith('buy:cancel-pending:')) {
      const orderId = data.slice('buy:cancel-pending:'.length);

      try {
        await prisma.order.update({
          where: { id: orderId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      } catch (err) {
        logger.warn({ err, orderId }, 'Failed to cancel pending TON order (may already be processed)');
      }

      await ctx.editMessageText('❌ سفارش TON لغو شد. اگه پرداخت انجام دادی، به پشتیبانی اطلاع بده.');
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Quick-pick GB selection ──────────────────────────────────────────────
    if (data.startsWith('buy:gb:')) {
      const gb = parseInt(data.slice('buy:gb:'.length), 10);
      if (isNaN(gb) || gb < config.MIN_GB || gb > config.MAX_GB) {
        await ctx.answerCallbackQuery('❌ حجم نامعتبر');
        return;
      }
      await applyGBSelection(ctx, gb, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Custom GB prompt ─────────────────────────────────────────────────────
    if (data === 'buy:custom-gb') {
      clearBuyState(userId);
      setBuyState(userId, { awaitingGBInput: true });
      await renderCustomGBPrompt(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Back to GB picker ────────────────────────────────────────────────────
    if (data === 'buy:back-to-gb') {
      clearBuyState(userId);
      await renderGBPicker(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Server selection ─────────────────────────────────────────────────────
    if (data.startsWith('buy:server:')) {
      const serverId = parseInt(data.slice('buy:server:'.length), 10);
      setBuyState(userId, { serverId, awaitingDiscountInput: true });
      await renderDiscountScreen(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Skip discount ─────────────────────────────────────────────────────────
    if (data === 'buy:skip-discount') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || !state.serverId) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }
      setBuyState(userId, { discountCode: undefined, discountPercent: 0, awaitingDiscountInput: false });
      await renderSummary(ctx, getBuyState(userId)!, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Back to discount ──────────────────────────────────────────────────────
    if (data === 'buy:back-to-discount') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || !state.serverId) {
        clearBuyState(userId);
        await renderGBPicker(ctx, true);
        await ctx.answerCallbackQuery();
        return;
      }
      setBuyState(userId, {
        discountCode: undefined,
        discountPercent: undefined,
        discountAmount: undefined,
        finalPriceToman: undefined,
        awaitingDiscountInput: true,
      });
      await renderDiscountScreen(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Show summary (from insufficient balance back button) ─────────────────
    if (data === 'buy:summary') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || !state.serverId) {
        clearBuyState(userId);
        await renderGBPicker(ctx, true);
        await ctx.answerCallbackQuery();
        return;
      }
      await renderSummary(ctx, state, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Wallet payment ────────────────────────────────────────────────────────
    if (data === 'buy:pay:wallet') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || !state.serverId || state.finalPriceToman == null) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }
      await renderWalletConfirm(ctx, state, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Execute purchase ──────────────────────────────────────────────────────
    if (data === 'buy:execute') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || !state.serverId || !state.pricePerGB || state.finalPriceToman == null) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery({ text: '⏳ در حال پردازش...' });

      const result = await buyService.execute({
        userId: BigInt(userId),
        serverId: state.serverId,
        trafficGB: state.trafficGB,
        durationDays: state.durationDays!,
        pricePerGB: state.pricePerGB,
        discountCode: state.discountCode,
        finalPriceToman: state.finalPriceToman,
      });

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          INSUFFICIENT_BALANCE: '❌ موجودی کافی نیست. لطفاً کیف پولت رو شارژ کن.',
          PANEL_FAILED: '❌ خطا در ساخت کانفیگ روی سرور. لطفاً به پشتیبانی پیام بده.',
          SERVER_INACTIVE: '❌ این سرور دیگه فعال نیست. لطفاً دوباره از ابتدا امتحان کن.',
          INVALID_DISCOUNT: `❌ کد تخفیف منقضی شده یا نامعتبره: ${result.reason}`,
          UNKNOWN: '❌ خطا در ثبت سفارش. اگه از کیف پولت کسر شد، با پشتیبانی تماس بگیر.',
        };
        await ctx.editMessageText(msgMap[result.code] ?? result.reason);
        clearBuyState(userId);
        return;
      }

      const finalState = { ...state };
      clearBuyState(userId);

      const server = await prisma.server.findUnique({ where: { id: finalState.serverId! } });
      const serverName = `${server?.flag ?? ''}${server?.name ?? '—'}`;
      const expiryDate = finalState.durationDays && finalState.durationDays > 0
        ? new Date(Date.now() + finalState.durationDays * 24 * 3600 * 1000)
        : null;

      const successText =
        `✅ <b>خرید با موفقیت انجام شد!</b>\n\n` +
        `🛡️ سرویس #${result.configId}\n` +
        `📍 ${escapeHtml(serverName)}\n` +
        `📦 ${formatGB(finalState.trafficGB!)}  •  ${finalState.durationDays!} روز` +
        (expiryDate ? `\n📅 انقضا: ${formatDateIR(expiryDate)}` : '') +
        `\n\n🔗 لینک اشتراک:\n<code>${result.subscriptionUrl}</code>\n\n` +
        'این لینک رو کپی کن و توی برنامه VPN ایمپورت کن.\n\n' +
        `💰 موجودی فعلی کیف پول: ${formatToman(result.newBalance)}`;

      await ctx.editMessageText(successText, {
        parse_mode: 'HTML',
        reply_markup: successKeyboard(),
      });

      // QR code as a separate photo
      try {
        const buffer = await generateQRBuffer(result.subscriptionUrl);
        await ctx.replyWithPhoto(new InputFile(buffer, 'qr.png'), {
          caption: '🔳 برای ایمپورت سریع، این QR رو با برنامه VPN خودت اسکن کن.',
        });
      } catch (err) {
        logger.warn({ err }, 'QR generation failed after successful purchase');
      }

      // Notify referrer if commission credited
      if (result.referral.credited) {
        try {
          await ctx.api.sendMessage(
            Number(result.referral.referrerId),
            `🎉 کمیسیون رفرال دریافت کردی!\n\n💰 +${formatToman(result.referral.commission)}\n\nاز خرید یکی از دوستانی که با لینکت دعوت کردی.`,
          );
        } catch (err) {
          logger.warn({ err, referrerId: result.referral.referrerId }, 'Failed to notify referrer');
        }
      }

      // Channel log
      await postBuySaleToChannel(ctx, {
        configId: result.configId,
        trafficGB: finalState.trafficGB!,
        durationDays: finalState.durationDays!,
        serverName: server?.name ?? '—',
        finalPrice: finalState.finalPriceToman!,
        discountCode: finalState.discountCode,
        discountAmount: finalState.discountAmount ?? 0n,
        newBalance: result.newBalance,
        referral: result.referral,
      });

      return;
    }

    // Unknown buy:* callback
    await ctx.answerCallbackQuery();
  });
}
