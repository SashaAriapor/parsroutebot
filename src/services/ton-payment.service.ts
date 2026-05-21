import { WalletTxType } from '@prisma/client';
import { prisma } from '@/db/client';
import { redis } from '@/db/redis';
import { tonClient } from '@/adapters/ton';
import { fxClient } from '@/adapters/fx';
import { tonInvoiceService } from './ton-invoice.service';
import { generatePasarGuardUsername } from '@/adapters/pasarguard';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import type { TonTx } from '@/adapters/ton/ton.interface';

const LAST_SEEN_LT_KEY = 'ton:last-seen-lt';

// Accept ±2% to absorb rate drift between invoice creation and payment.
const AMOUNT_TOLERANCE_PERCENT = 2;

type TonPaymentRow = Awaited<ReturnType<typeof prisma.tonPayment.create>>;

// ─── Main polling entry point ─────────────────────────────────────────────────

export const tonPaymentService = {
  async pollAndProcess(): Promise<{ processed: number; matched: number; orphaned: number }> {
    const lastSeenLt = await getLastSeenLt();

    let txs: TonTx[];
    try {
      txs = await tonClient.getIncomingTransactions(config.TON_WALLET_ADDRESS, lastSeenLt);
    } catch (err) {
      logger.error({ err }, 'Failed to poll TON transactions');
      return { processed: 0, matched: 0, orphaned: 0 };
    }

    if (txs.length === 0) return { processed: 0, matched: 0, orphaned: 0 };

    // Process oldest first to preserve LT ordering on crash/restart
    txs.sort((a, b) => (a.lt < b.lt ? -1 : a.lt > b.lt ? 1 : 0));

    let matched = 0;
    let orphaned = 0;

    for (const tx of txs) {
      try {
        const result = await processTransaction(tx);
        if (result === 'matched') matched++;
        else if (result === 'orphaned') orphaned++;
      } catch (err) {
        logger.error({ err, txHash: tx.hash }, 'Unhandled error processing tx');
      }
      // Always advance the cursor — don't re-process even on error
      await setLastSeenLt(tx.lt);
    }

    return { processed: txs.length, matched, orphaned };
  },
};

// ─── Transaction processor ────────────────────────────────────────────────────

async function processTransaction(tx: TonTx): Promise<'matched' | 'orphaned' | 'duplicate'> {
  const existing = await prisma.tonPayment.findUnique({ where: { txHash: tx.hash } });
  if (existing) {
    logger.debug({ txHash: tx.hash }, 'TON tx already processed');
    return 'duplicate';
  }

  const payment = await prisma.tonPayment.create({
    data: {
      txHash: tx.hash,
      fromAddress: tx.fromAddress,
      amountNano: tx.amountNano,
      memo: tx.comment,
      receivedAt: new Date(tx.timestamp),
      status: 'DETECTED',
    },
  });

  const parsed = tonInvoiceService.parseMemo(tx.comment);
  if (!parsed) {
    logger.warn({ txHash: tx.hash, comment: tx.comment, amountNano: tx.amountNano.toString() }, 'TON payment with unknown memo — orphaned');
    await markOrphaned(payment.id);
    await notifyAdminsOrphan(payment, tx);
    return 'orphaned';
  }

  if (parsed.kind === 'topup') {
    return matchTopup(payment, tx, parsed.userId);
  } else {
    return matchOrder(payment, tx, parsed.orderIdPrefix);
  }
}

// ─── Topup matching ───────────────────────────────────────────────────────────

async function matchTopup(payment: TonPaymentRow, tx: TonTx, userId: bigint): Promise<'matched' | 'orphaned'> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger.warn({ userId: userId.toString(), txHash: tx.hash }, 'Topup memo references unknown user');
    await markOrphaned(payment.id);
    await notifyAdminsOrphan(payment, tx);
    return 'orphaned';
  }

  // Credit at rate-at-receive-time (user's risk for topups)
  const { rate } = await fxClient.getTonToIrr();
  const amountTon = Number(tx.amountNano) / 1e9;
  const amountToman = BigInt(Math.floor(amountTon * rate));

  await prisma.$transaction(async (tx2) => {
    const fresh = await tx2.user.findUniqueOrThrow({ where: { id: userId } });
    const newBalance = fresh.walletBalance + amountToman;

    await tx2.user.update({
      where: { id: userId },
      data: { walletBalance: newBalance },
    });

    await tx2.walletTransaction.create({
      data: {
        userId,
        type: WalletTxType.TOPUP_TON,
        amountToman,
        balanceAfter: newBalance,
        tonPaymentId: payment.id,
        description: `شارژ ولت با ${amountTon.toFixed(4)} TON (نرخ ${Math.round(rate).toLocaleString('fa-IR')} ت/تن)`,
      },
    });

    await tx2.tonPayment.update({
      where: { id: payment.id },
      data: { status: 'MATCHED', matchedAt: new Date() },
    });
  });

  logger.info({ userId: userId.toString(), amountToman: amountToman.toString(), txHash: tx.hash }, 'Topup matched');

  await notifyUserTopup(userId, amountToman, amountTon);
  await logToChannel({
    icon: '💰',
    title: 'شارژ ولت با TON',
    lines: [
      `👤 کاربر: ${userMention(user)} (${userId})`,
      `🪙 مبلغ: ${amountTon.toFixed(4)} TON`,
      `💴 معادل: ${amountToman.toLocaleString('fa-IR')} ت`,
      `🔗 hash: ${tx.hash.slice(0, 16)}...`,
    ],
  });

  return 'matched';
}

// ─── Order matching ───────────────────────────────────────────────────────────

async function matchOrder(payment: TonPaymentRow, tx: TonTx, orderIdPrefix: string): Promise<'matched' | 'orphaned'> {
  const order = await prisma.order.findFirst({
    where: { id: { startsWith: orderIdPrefix } },
  });

  // No matching order or exact memo mismatch
  if (!order || order.tonMemo !== tx.comment?.trim()) {
    logger.warn({ txHash: tx.hash, orderIdPrefix, memo: tx.comment }, 'Order payment memo mismatch — orphaned');
    await markOrphaned(payment.id);
    await notifyAdminsOrphan(payment, tx);
    return 'orphaned';
  }

  // Order already processed (double-payment) → credit as topup
  if (order.status !== 'PENDING') {
    logger.warn({ orderId: order.id, txHash: tx.hash, status: order.status }, 'Order already processed — crediting as topup');
    return matchTopup(payment, tx, order.userId);
  }

  // Invoice expired → credit as topup; order is abandoned
  if (order.rateValidUntil && order.rateValidUntil < new Date()) {
    logger.warn({ orderId: order.id, txHash: tx.hash }, 'Order invoice expired — crediting as topup');
    return matchTopup(payment, tx, order.userId);
  }

  const expected = order.tonAmountNano ?? 0n;
  if (expected === 0n) {
    logger.warn({ orderId: order.id }, 'Order has no expected TON amount — orphaning');
    await markOrphaned(payment.id);
    return 'orphaned';
  }

  // Under-payment → credit wallet for what was sent, don't fulfil order
  const tolerance = (expected * BigInt(AMOUNT_TOLERANCE_PERCENT)) / 100n;
  if (tx.amountNano < expected - tolerance) {
    logger.warn({ orderId: order.id, expected: expected.toString(), received: tx.amountNano.toString() }, 'Order under-paid — crediting as topup');
    return matchTopup(payment, tx, order.userId);
  }

  // Sufficient payment — mark PAID, link payment, then fulfil
  await prisma.$transaction(async (tx2) => {
    await tx2.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await tx2.tonPayment.update({
      where: { id: payment.id },
      data: { status: 'MATCHED', matchedOrderId: order.id, matchedAt: new Date() },
    });
  });

  logger.info({ orderId: order.id, txHash: tx.hash }, 'Order paid via TON — asking user for account name');

  const generatedName = generatePasarGuardUsername();
  const { setUserPending } = await import('@/bot/state/pending-user-input');
  setUserPending(Number(order.userId), { kind: 'account-name-input', orderId: order.id, generatedName });
  await askUserForAccountName(Number(order.userId));

  return 'matched';
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

async function getLastSeenLt(): Promise<bigint | undefined> {
  const v = await redis.get(LAST_SEEN_LT_KEY);
  return v ? BigInt(v) : undefined;
}

async function setLastSeenLt(lt: bigint): Promise<void> {
  await redis.set(LAST_SEEN_LT_KEY, lt.toString());
}

// ─── Status helpers ───────────────────────────────────────────────────────────

async function markOrphaned(paymentId: string): Promise<void> {
  await prisma.tonPayment.update({
    where: { id: paymentId },
    data: { status: 'ORPHANED' },
  });
}

// ─── Notification helpers ─────────────────────────────────────────────────────

async function askUserForAccountName(userId: number): Promise<void> {
  const { bot } = await import('@/bot');
  const text =
    `✅ پرداخت تأیید شد!\n\n` +
    `یه اسم برای اکانتت انتخاب کن:\n\n` +
    `⚠️ فقط حروف انگلیسی و عدد — بدون فاصله یا کاراکتر خاص\n` +
    `مثال: john123 یا myaccount\n\n` +
    `برای اسم خودکار، فقط — بفرست`;
  try {
    await bot.api.sendMessage(userId, text);
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to ask user for account name');
  }
}

async function notifyUserTopup(userId: bigint, amountToman: bigint, amountTon: number): Promise<void> {
  const { bot } = await import('@/bot');
  try {
    await bot.api.sendMessage(
      Number(userId),
      `✅ شارژ ولت با موفقیت انجام شد\n\n🪙 مقدار: ${amountTon.toFixed(4)} TON\n💴 معادل: ${amountToman.toLocaleString('fa-IR')} ت\n\nبرای دیدن موجودی، روی «💰 کیف پول» بزن.`,
    );
  } catch (err) {
    logger.warn({ err, userId: userId.toString() }, 'Failed to notify user of topup');
  }
}

async function notifyAdminsOrphan(payment: TonPaymentRow, tx: TonTx): Promise<void> {
  const { bot } = await import('@/bot');
  const msg =
    `⚠️ پرداخت TON بدون مطابقت\n\n` +
    `🔗 hash: ${tx.hash}\n` +
    `👤 از: ${tx.fromAddress}\n` +
    `🪙 مبلغ: ${(Number(tx.amountNano) / 1e9).toFixed(4)} TON\n` +
    `💬 memo: ${tx.comment ?? '(خالی)'}\n\n` +
    `با Prisma Studio بررسی و دستی تخصیص بده.`;

  for (const adminId of config.ADMIN_IDS) {
    try {
      await bot.api.sendMessage(adminId, msg);
    } catch (err) {
      logger.warn({ err, adminId }, 'Failed to notify admin of orphan');
    }
  }
}

async function logToChannel(params: { icon: string; title: string; lines: string[] }): Promise<void> {
  const { bot } = await import('@/bot');
  const text = `${params.icon} ${params.title}\n\n${params.lines.join('\n')}`;
  try {
    await bot.api.sendMessage(config.LOG_CHANNEL_ID, text);
  } catch (err) {
    logger.warn({ err }, 'Failed to log to channel');
  }
}

function userMention(user: { username: string | null; firstName: string | null }): string {
  if (user.username) return `@${user.username}`;
  if (user.firstName) return user.firstName;
  return 'کاربر';
}
