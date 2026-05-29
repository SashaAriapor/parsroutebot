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
import { settingsService } from '@/services/settings.service';
import { generatePasarGuardUsername } from '@/adapters/pasarguard';
import { setUserPending } from '@/bot/state/pending-user-input';
import { type BuyState, getBuyState, setBuyState, clearBuyState } from '../state/pending-buy-state';
import {
  categoryListKeyboard,
  gbPickerKeyboard,
  serverListKeyboard,
  discountScreenKeyboard,
  summaryKeyboard,
  walletConfirmKeyboard,
  insufficientBuyKeyboard,
  successKeyboard,
  buyTonInvoiceKeyboard,
} from '../keyboards/buy.keyboard';

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function getDurationAndPicks(): Promise<{ durationDays: number; quickPickGbs: number[] }> {
  const [rawDuration, rawQuickPickGb] = await Promise.all([
    settingsService.get('SERVICE_DURATION_DAYS'),
    settingsService.get('QUICK_PICK_GB'),
  ]);
  const durationDays = rawDuration
    ? (parseInt(rawDuration, 10) || config.DEFAULT_DURATION_DAYS)
    : config.DEFAULT_DURATION_DAYS;
  const quickPickGbs = (rawQuickPickGb ?? '1,5,10,20')
    .split(',')
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 4);
  return { durationDays, quickPickGbs };
}

function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ─── Screen renderers ─────────────────────────────────────────────────────────

async function renderCategoryPicker(ctx: BotContext, edit: boolean): Promise<void> {
  const categories = await prisma.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });

  if (categories.length === 0) {
    const text = '❌ در حال حاضر سرویسی برای خرید وجود نداره. لطفاً بعداً دوباره امتحان کن یا با پشتیبانی تماس بگیر.';
    if (edit) await ctx.editMessageText(text);
    else await ctx.reply(text);
    return;
  }

  const text = '🛒 <b>نوع سرویس رو انتخاب کن:</b>';
  const kb = categoryListKeyboard(categories);
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderGBPicker(ctx: BotContext, edit: boolean): Promise<void> {
  const state = getBuyState(ctx.from!.id);
  const pricePerGB = state?.pricePerGB ?? config.PRICE_PER_GB_TOMAN;
  const { durationDays, quickPickGbs } = await getDurationAndPicks();
  const quickPicks = quickPickGbs.map((gb) => ({ gb, price: BigInt(gb) * pricePerGB }));

  const text =
    '🛒 <b>خرید سرویس جدید</b>\n\n' +
    `💰 قیمت هر گیگابایت: ${formatToman(pricePerGB)}\n` +
    `📅 مدت: ${durationDays} روز\n\n` +
    'حجم مورد نیاز رو انتخاب کن:';
  const kb = gbPickerKeyboard(quickPicks);
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
  pricePerGB: bigint,
  durationDays: number,
  edit: boolean,
): Promise<void> {
  const price = BigInt(trafficGB) * pricePerGB;
  const text =
    `📍 <b>انتخاب سرور</b>\n\n` +
    `📦 حجم: ${formatGB(trafficGB)}\n` +
    `📅 مدت: ${durationDays} روز\n` +
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
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const errText = '❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.';
    if (edit) await ctx.editMessageText(errText);
    else await ctx.reply(errText);
    clearBuyState(ctx.from!.id);
    return;
  }

  let serverDisplay: string;
  if (state.categoryId) {
    serverDisplay = state.categoryServerName ?? '—';
  } else {
    const server = await prisma.server.findUnique({ where: { id: state.serverId! } });
    if (!server) {
      const errText = '❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.';
      if (edit) await ctx.editMessageText(errText);
      else await ctx.reply(errText);
      clearBuyState(ctx.from!.id);
      return;
    }
    serverDisplay = `${server.flag ?? ''}${escapeHtml(server.name)}`;
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
    `📍 سرور: ${serverDisplay}`,
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
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !state.finalPriceToman) {
    const errText = '❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.';
    if (edit) await ctx.editMessageText(errText);
    else await ctx.reply(errText);
    clearBuyState(ctx.from!.id);
    return;
  }

  let serverDisplay: string;
  if (state.categoryId) {
    serverDisplay = state.categoryServerName ?? '—';
  } else {
    const server = await prisma.server.findUnique({ where: { id: state.serverId! } });
    if (!server) {
      const errText = '❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.';
      if (edit) await ctx.editMessageText(errText);
      else await ctx.reply(errText);
      clearBuyState(ctx.from!.id);
      return;
    }
    serverDisplay = `${server.flag ?? ''}${escapeHtml(server.name)}`;
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
    `📍 ${serverDisplay}\n` +
    `💰 مبلغ: ${formatToman(state.finalPriceToman)}\n\n` +
    `موجودی فعلی: ${formatToman(user.walletBalance)}\n` +
    `موجودی بعد از خرید: ${formatToman(afterBalance)}\n\n` +
    '⚠️ با تأیید، مبلغ از کیف پولت کسر میشه و کانفیگ بلافاصله ساخته میشه.';

  const kb = walletConfirmKeyboard();
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

// ─── Shared: pick GB and advance ─────────────────────────────────────────────

async function applyGBSelection(ctx: BotContext, gb: number, edit: boolean): Promise<void> {
  const userId = ctx.from!.id;
  const currentState = getBuyState(userId);
  const { durationDays } = await getDurationAndPicks();
  const pricePerGB = currentState?.pricePerGB ?? config.PRICE_PER_GB_TOMAN;
  const basePriceToman = BigInt(gb) * pricePerGB;

  setBuyState(userId, {
    trafficGB: gb,
    durationDays,
    pricePerGB,
    basePriceToman,
    awaitingGBInput: false,
  });

  if (currentState?.categoryId) {
    // Category flow: server is determined by category, skip server selection
    setBuyState(userId, { awaitingDiscountInput: true });
    await renderDiscountScreen(ctx, edit);
  } else {
    // Legacy: DB server selection
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
      await renderServerSelection(ctx, servers, gb, pricePerGB, durationDays, edit);
    }
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
  // ── Entry: ReplyKeyboard tap — show category picker ──────────────────────

  bot.hears(MENU.BUY, async (ctx) => {
    clearBuyState(ctx.from!.id);
    await renderCategoryPicker(ctx, false);
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
      const result = await discountService.validate(code, BigInt(ctx.from.id), null, state.basePriceToman!);

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

    // ── Category selection ───────────────────────────────────────────────────
    if (data.startsWith('buy:category:')) {
      const categoryId = parseInt(data.slice('buy:category:'.length), 10);
      const category = await prisma.serviceCategory.findUnique({ where: { id: categoryId } });

      if (!category || !category.isActive) {
        await ctx.answerCallbackQuery({ text: '❌ این دسته‌بندی دیگه فعال نیست', show_alert: true });
        return;
      }

      clearBuyState(userId);
      setBuyState(userId, {
        categoryId: category.id,
        categoryServerName: category.serverName,
        pricePerGB: category.pricePerGb,
      });

      await renderGBPicker(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── TON payment ──────────────────────────────────────────────────────────
    if (data === 'buy:pay:ton') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || (!state.categoryId && !state.serverId) || state.finalPriceToman == null) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery({ text: '⏳ در حال محاسبه...' });

      const result = await buyService.createPendingTonOrder({
        userId: BigInt(userId),
        serverId: state.serverId,
        categoryId: state.categoryId,
        trafficGB: state.trafficGB!,
        durationDays: state.durationDays!,
        pricePerGB: state.pricePerGB!,
        discountCode: state.discountCode,
        finalPriceToman: state.finalPriceToman,
      });

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          INVALID_DISCOUNT: `❌ کد تخفیف منقضی شده: ${result.reason}`,
          SERVER_INACTIVE: '❌ این سرویس دیگه فعال نیست.',
          UNKNOWN: '❌ خطا در ثبت سفارش.',
        };
        await ctx.editMessageText(msgMap[result.code] ?? '❌ خطا در ثبت سفارش.');
        clearBuyState(userId);
        return;
      }

      clearBuyState(userId);

      const nanoTonDisplay = (Number(result.tonAmountNano) / 1e9).toFixed(6);
      const serverDisplay = state.categoryServerName ?? state.serverId?.toString() ?? '—';

      const text = [
        '🪙 <b>پرداخت با TON</b>',
        '',
        `📦 ${formatGB(state.trafficGB!)} — ${state.durationDays!} روز`,
        `📍 ${escapeHtml(serverDisplay)}`,
        `💰 معادل: ${formatToman(state.finalPriceToman!)}`,
        '',
        `🪙 مبلغ TON: <b>${nanoTonDisplay} TON</b>`,
        `⏱ اعتبار نرخ: ${formatDateIR(result.expiresAt)}`,
        '',
        '📬 آدرس کیف پول:',
        `<code>${result.tonAddress}</code>`,
        '',
        '💬 کامنت (Comment) — حتماً وارد کن:',
        `<code>${result.tonMemo}</code>`,
        '',
        '⚠️ کامنت رو دقیقاً کپی کن و تو کیف پولت وارد کن.',
        'بدون کامنت، پرداختت شناسایی نمیشه.',
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
          caption: `🔳 این QR رو در Tonkeeper یا کیف TON خودت اسکن کن.\n\n💬 کامنت: <code>${order.tonMemo}</code>`,
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
      // Preserve category in state; only set awaiting flag
      setBuyState(userId, { awaitingGBInput: true });
      await renderCustomGBPrompt(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Back to GB picker ────────────────────────────────────────────────────
    if (data === 'buy:back-to-gb') {
      const state = getBuyState(userId);
      if (state?.categoryId) {
        // Keep category, reset GB-related fields
        const { categoryId, pricePerGB, categoryServerName } = state;
        clearBuyState(userId);
        setBuyState(userId, { categoryId, pricePerGB, categoryServerName });
      } else {
        clearBuyState(userId);
      }
      await renderGBPicker(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Server selection (legacy DB-server flow) ──────────────────────────────
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
      if (!state?.trafficGB || (!state.categoryId && !state.serverId)) {
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
      if (!state?.trafficGB || (!state.categoryId && !state.serverId)) {
        clearBuyState(userId);
        await renderCategoryPicker(ctx, true);
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
      if (!state?.trafficGB || (!state.categoryId && !state.serverId)) {
        clearBuyState(userId);
        await renderCategoryPicker(ctx, true);
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
      if (!state?.trafficGB || (!state.categoryId && !state.serverId) || state.finalPriceToman == null) {
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
      if (!state?.trafficGB || (!state.categoryId && !state.serverId) || !state.pricePerGB || state.finalPriceToman == null) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery({ text: '⏳ در حال پردازش...' });

      const result = await buyService.createPendingWalletOrder({
        userId: BigInt(userId),
        serverId: state.serverId,
        categoryId: state.categoryId,
        trafficGB: state.trafficGB,
        durationDays: state.durationDays!,
        pricePerGB: state.pricePerGB,
        discountCode: state.discountCode,
        finalPriceToman: state.finalPriceToman,
      });

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          INSUFFICIENT_BALANCE: '❌ موجودی کافی نیست. لطفاً کیف پولت رو شارژ کن.',
          SERVER_INACTIVE: '❌ این سرویس دیگه فعال نیست. لطفاً دوباره از ابتدا امتحان کن.',
          INVALID_DISCOUNT: `❌ کد تخفیف منقضی شده یا نامعتبره: ${result.reason}`,
          UNKNOWN: '❌ خطا در ثبت سفارش. اگه از کیف پولت کسر شد، با پشتیبانی تماس بگیر.',
        };
        await ctx.editMessageText(msgMap[result.code] ?? result.reason);
        clearBuyState(userId);
        return;
      }

      clearBuyState(userId);
      const generatedName = generatePasarGuardUsername();
      setUserPending(userId, { kind: 'account-name-input', orderId: result.orderId, generatedName });

      await ctx.editMessageText(
        `✅ سفارش ثبت شد!\n\n` +
        `یه اسم برای اکانتت انتخاب کن:\n\n` +
        `⚠️ فقط حروف انگلیسی و عدد — بدون فاصله یا کاراکتر خاص\n` +
        `مثال: john123 یا myaccount\n\n` +
        `برای اسم خودکار، فقط — بفرست`,
      );
      return;
    }

    // ── Card payment ──────────────────────────────────────────────────────────
    if (data === 'buy:pay:card') {
      const state = getBuyState(userId);
      if (!state?.trafficGB || (!state.categoryId && !state.serverId) || !state.pricePerGB || state.finalPriceToman == null) {
        clearBuyState(userId);
        await ctx.editMessageText('❌ اطلاعات سفارش منقضی شده. لطفاً دوباره شروع کن.');
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery({ text: '⏳ در حال بارگذاری...' });

      const cardSettings = await settingsService.getCardSettings();
      if (!cardSettings.cardNumber || !cardSettings.channelId) {
        await ctx.editMessageText('❌ پرداخت کارت به کارت در حال حاضر فعال نیست. لطفاً روش دیگه‌ای انتخاب کن.');
        return;
      }

      const result = await buyService.createPendingCardOrder({
        userId: BigInt(userId),
        serverId: state.serverId,
        categoryId: state.categoryId,
        trafficGB: state.trafficGB,
        durationDays: state.durationDays!,
        pricePerGB: state.pricePerGB,
        discountCode: state.discountCode,
        finalPriceToman: state.finalPriceToman,
        cardFeePercent: cardSettings.feePercent,
      });

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          INVALID_DISCOUNT: `❌ کد تخفیف منقضی شده: ${result.reason}`,
          SERVER_INACTIVE: '❌ این سرویس دیگه فعال نیست.',
          UNKNOWN: '❌ خطا در ثبت سفارش.',
        };
        await ctx.editMessageText(msgMap[result.code] ?? '❌ خطا در ثبت سفارش.');
        clearBuyState(userId);
        return;
      }

      clearBuyState(userId);
      setUserPending(userId, { kind: 'card-receipt-input', orderId: result.orderId });

      const feeAmount = result.priceWithFee - state.finalPriceToman;
      const cardNumFormatted = cardSettings.cardNumber.replace(/(\d{4})(?=\d)/g, '$1-');

      const text = [
        '💳 <b>پرداخت کارت به کارت</b>',
        '',
        `📦 ${formatGB(state.trafficGB!)} — ${state.durationDays!} روز`,
        `💰 مبلغ پایه: ${formatToman(state.finalPriceToman)}`,
        `🔖 کارمزد (${cardSettings.feePercent}٪): +${formatToman(feeAmount)}`,
        '━━━━━━━━━━━━━━',
        `💳 مبلغ قابل پرداخت: <b>${formatToman(result.priceWithFee)}</b>`,
        '',
        '💳 <b>شماره کارت:</b>',
        `<code>${cardNumFormatted}</code>`,
        cardSettings.cardOwner ? `👤 به نام: <b>${escapeHtml(cardSettings.cardOwner)}</b>` : '',
        '',
        '⚠️ دقیقاً این مبلغ را واریز کن.',
        'بعد از پرداخت، <b>عکس رسید</b> را همینجا ارسال کن.',
      ].filter(Boolean).join('\n');

      await ctx.editMessageText(text, { parse_mode: 'HTML' });
      return;
    }

    // Unknown buy:* callback
    await ctx.answerCallbackQuery();
  });
}
