import { type Bot, InputFile } from 'grammy';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { formatToman, formatDateIR } from '@/lib/format';
import { walletService } from '@/services/wallet.service';
import { generateQRBuffer } from '@/lib/qrcode';
import { getTopupState, setTopupState, clearTopupState } from '../state/pending-topup';
import {
  walletMainKeyboard,
  walletTopupPickerKeyboard,
  walletInvoiceKeyboard,
  walletHistoryKeyboard,
} from '../keyboards/wallet.keyboard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ─── Screen renderers ─────────────────────────────────────────────────────────

async function renderWalletMain(ctx: BotContext, edit: boolean): Promise<void> {
  const userId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const text = [
    '💰 <b>کیف پول</b>',
    '',
    `💼 موجودی: <b>${formatToman(user?.walletBalance ?? 0n)}</b>`,
    '',
    'با TON کیف پولت رو شارژ کن یا تاریخچه تراکنش‌هات رو ببین.',
  ].join('\n');

  const kb = walletMainKeyboard();
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderTopupPicker(ctx: BotContext, edit: boolean): Promise<void> {
  const text = [
    '💳 <b>شارژ کیف پول</b>',
    '',
    'مبلغ دلخواه رو انتخاب کن:',
    '',
    '💡 مبلغ دریافتی بر اساس نرخ TON در لحظه پرداخت به تومان تبدیل میشه.',
  ].join('\n');

  const kb = walletTopupPickerKeyboard();
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderInvoice(ctx: BotContext, edit: boolean, amountToman: bigint): Promise<void> {
  const userId = BigInt(ctx.from!.id);

  let invoice;
  try {
    invoice = await walletService.createTopupInvoice(userId, amountToman);
  } catch (err) {
    logger.error({ err }, 'Failed to create topup invoice');
    const errText = '❌ خطا در دریافت نرخ ارز. لطفاً دوباره امتحان کن.';
    if (edit) await ctx.editMessageText(errText);
    else await ctx.reply(errText);
    return;
  }

  const nanoTonDisplay = (Number(invoice.nanoTon) / 1e9).toFixed(6);

  const text = [
    '💳 <b>شارژ کیف پول</b>',
    '',
    `💰 مبلغ درخواستی: <b>${formatToman(amountToman)}</b>`,
    `🪙 معادل: <b>${nanoTonDisplay} TON</b>`,
    `📊 نرخ: ${Math.round(invoice.rateTomanPerTon).toLocaleString('fa-IR')} ت/تن`,
    '',
    '📬 آدرس کیف پول:',
    `<code>${invoice.tonAddress}</code>`,
    '',
    '📝 موضوع پرداخت (حتماً وارد کن!):',
    `<code>${invoice.memo}</code>`,
    '',
    `⏱ اعتبار: تا ${formatDateIR(invoice.expiresAt)}`,
    '',
    '⚠️ موضوع پرداخت رو دقیقاً وارد کن وگرنه شارژ اعمال نمیشه.',
    'مبلغ واریزی بر اساس نرخ لحظه دریافت تبدیل میشه.',
  ].join('\n');

  const kb = walletInvoiceKeyboard(invoice.memo, invoice.nanoTon);
  if (edit) await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderHistory(ctx: BotContext): Promise<void> {
  const userId = BigInt(ctx.from!.id);

  const txs = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const typeLabel: Record<string, string> = {
    TOPUP_TON: '⬆️ شارژ TON',
    TOPUP_ADMIN: '⬆️ شارژ ادمین',
    PURCHASE: '🛒 خرید',
    REFUND: '↩️ بازگشت',
    REFERRAL_COMMISSION: '🤝 کمیسیون',
    ADMIN_DEDUCT: '⬇️ کسر ادمین',
  };

  const lines = ['📋 <b>تاریخچه تراکنش‌ها</b>', ''];

  if (txs.length === 0) {
    lines.push('هیچ تراکنشی ثبت نشده.');
  } else {
    for (const tx of txs) {
      const sign = tx.amountToman >= 0n ? '+' : '';
      const label = typeLabel[tx.type] ?? tx.type;
      lines.push(`${label}: <b>${sign}${formatToman(tx.amountToman)}</b>`);
      lines.push(`  موجودی: ${formatToman(tx.balanceAfter)} — ${formatDateIR(tx.createdAt)}`);
      if (tx.description) lines.push(`  ${tx.description}`);
      lines.push('');
    }
  }

  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: walletHistoryKeyboard(),
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function registerWalletHandler(bot: Bot<BotContext>): void {
  bot.hears(MENU.WALLET, async (ctx) => {
    clearTopupState(ctx.from!.id);
    await renderWalletMain(ctx, false);
  });

  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    if (!ctx.from) return next();
    if (ctx.message.text.startsWith('/')) return next();

    const state = getTopupState(ctx.from.id);
    if (!state?.awaitingCustomAmount) return next();

    const raw = normalizeDigits(ctx.message.text.trim()).replace(/,/g, '');
    const amount = parseInt(raw, 10);

    if (isNaN(amount) || amount < 10_000 || amount > 50_000_000) {
      await ctx.reply('❌ مبلغ نامعتبر. بین ۱۰,۰۰۰ تا ۵۰,۰۰۰,۰۰۰ تومان وارد کن.');
      return;
    }

    clearTopupState(ctx.from.id);
    await renderInvoice(ctx, false, BigInt(amount));
  });

  bot.callbackQuery(/^wallet:/, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (data === 'wallet:main') {
      clearTopupState(userId);
      await renderWalletMain(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'wallet:topup') {
      await renderTopupPicker(ctx, true);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'wallet:topup:custom') {
      setTopupState(userId, { awaitingCustomAmount: true });
      const text = [
        '✏️ <b>مبلغ دلخواه</b>',
        '',
        'مبلغ شارژ رو به تومان بنویس:',
        '(بین ۱۰,۰۰۰ تا ۵۰,۰۰۰,۰۰۰ تومان)',
        '',
        'مثلاً: <code>250000</code>',
      ].join('\n');
      const kb = { inline_keyboard: [[{ text: '⬅️ بازگشت', callback_data: 'wallet:topup' }]] };
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith('wallet:topup-qr:')) {
      // Format: wallet:topup-qr:{memo}:{nanoTon}
      const rest = data.slice('wallet:topup-qr:'.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon === -1) { await ctx.answerCallbackQuery(); return; }
      const memo = rest.slice(0, lastColon);
      const nanoTon = rest.slice(lastColon + 1);

      const deepLink = `ton://transfer/${config.TON_WALLET_ADDRESS}?amount=${nanoTon}&text=${encodeURIComponent(memo)}`;

      try {
        const buffer = await generateQRBuffer(deepLink);
        await ctx.replyWithPhoto(new InputFile(buffer, 'qr.png'), {
          caption: `🔳 این QR رو در Tonkeeper یا کیف TON خودت اسکن کن.\n\n📝 موضوع: <code>${memo}</code>`,
          parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
      } catch (err) {
        logger.error({ err }, 'Failed to generate topup QR');
        await ctx.answerCallbackQuery({ text: '❌ خطا در ساخت QR', show_alert: true });
      }
      return;
    }

    if (data.startsWith('wallet:topup:')) {
      const amountStr = data.slice('wallet:topup:'.length);
      let amount: bigint;
      try {
        amount = BigInt(amountStr);
      } catch {
        await ctx.answerCallbackQuery('❌ مبلغ نامعتبر');
        return;
      }
      if (amount < 10_000n) {
        await ctx.answerCallbackQuery('❌ مبلغ نامعتبر');
        return;
      }

      await ctx.answerCallbackQuery();
      await renderInvoice(ctx, true, amount);
      return;
    }

    if (data === 'wallet:history') {
      await renderHistory(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  });
}
