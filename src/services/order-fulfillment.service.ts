import { OrderStatus, WalletTxType, Prisma } from '@prisma/client';
import { InputFile } from 'grammy';
import { prisma } from '@/db/client';
import { pasarguardClient, generatePasarGuardUsername, gbToBytes, extractSubToken } from '@/adapters/pasarguard';
import type { PasarGuardUser } from '@/adapters/pasarguard';
import { referralService } from './referral.service';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/html';
import { formatToman, formatGB, formatDateIR } from '@/lib/format';
import { generateQRBuffer } from '@/lib/qrcode';

type FulfillResult =
  | { ok: true; configId: number; subscriptionUrl: string }
  | { ok: false; reason: string; nameTaken?: true; retryable?: true };

export const orderFulfillmentService = {
  async fulfill(orderId: string, username?: string): Promise<FulfillResult> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      logger.error({ orderId }, 'fulfill: order not found');
      return { ok: false, reason: 'order not found' };
    }

    const isPendingWallet =
      order.status === OrderStatus.PENDING && order.paymentMethod === 'WALLET';
    const isPaid = order.status === OrderStatus.PAID;

    if (!isPendingWallet && !isPaid) {
      logger.warn({ orderId, status: order.status }, 'fulfill: order not in fulfillable status');
      return { ok: false, reason: `order status is ${order.status}` };
    }

    let serverDisplayName: string;
    let serverDisplayFlag: string | null = null;
    let pgGroupId: number | undefined;
    let uuidPrefix = '0';

    if (order.serverId) {
      const server = await prisma.server.findUnique({ where: { id: order.serverId } });
      if (!server) {
        logger.error({ orderId, serverId: order.serverId }, 'fulfill: server not found');
        return { ok: false, reason: 'server not found' };
      }
      if (!server.isActive) {
        logger.error({ orderId, serverId: order.serverId }, 'fulfill: server is inactive');
        return { ok: false, reason: 'server is inactive' };
      }
      serverDisplayName = server.name;
      serverDisplayFlag = server.flag;
      uuidPrefix = String(order.serverId);
    } else if (order.categoryId) {
      const category = await prisma.serviceCategory.findUnique({ where: { id: order.categoryId } });
      if (!category) {
        logger.error({ orderId, categoryId: order.categoryId }, 'fulfill: category not found');
        return { ok: false, reason: 'category not found' };
      }
      if (!category.isActive) {
        logger.error({ orderId, categoryId: order.categoryId }, 'fulfill: category is inactive');
        return { ok: false, reason: 'category is inactive' };
      }
      serverDisplayName = category.serverName;
      pgGroupId = parseInt(category.serverId, 10) || undefined;
      uuidPrefix = category.uuidPrefix;
    } else {
      logger.error({ orderId }, 'fulfill: order has no serverId or categoryId');
      return { ok: false, reason: 'no server or category on order' };
    }

    const pgUsername = username ?? generatePasarGuardUsername();
    const expireAt = order.durationDays > 0
      ? new Date(Date.now() + order.durationDays * 86400_000)
      : null;

    // 1. Create PasarGuard account FIRST (before any DB money movement)
    let pgUser: PasarGuardUser;
    try {
      pgUser = await pasarguardClient.createUser({
        username: pgUsername,
        dataLimitBytes: gbToBytes(order.trafficGB),
        expireAt,
        groupId: pgGroupId,
      });
    } catch (err) {
      const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (errMsg.includes('409') || errMsg.includes('conflict') || errMsg.includes('already') || errMsg.includes('exist') || errMsg.includes('duplicate')) {
        return { ok: false, reason: 'username taken', nameTaken: true };
      }
      const isRetryable = errMsg.includes('timeout') || errMsg.includes('request failed') || errMsg.includes('econnaborted');
      logger.error({ err, orderId }, 'PasarGuard user creation failed during fulfillment');
      return isRetryable
        ? { ok: false as const, reason: 'PasarGuard user creation failed', retryable: true as const }
        : { ok: false as const, reason: 'PasarGuard user creation failed' };
    }

    let configId: number;
    let subscriptionUrl: string;

    // 2. THEN deduct wallet (for wallet orders) + create config atomically
    try {
      const result = await prisma.$transaction(async (tx) => {
        const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        const stillFulfillable =
          freshOrder.status === OrderStatus.PAID ||
          (freshOrder.status === OrderStatus.PENDING && freshOrder.paymentMethod === 'WALLET');
        if (!stillFulfillable) {
          throw Object.assign(new Error('ORDER_STATE_CHANGED'), { code: 'ORDER_STATE_CHANGED' });
        }

        // For pending wallet orders: deduct balance inside the same transaction
        if (isPendingWallet) {
          const freshUser = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
          if (freshUser.walletBalance < order.priceToman) {
            throw Object.assign(new Error('INSUFFICIENT_BALANCE_RACE'), { code: 'INSUFFICIENT_BALANCE' });
          }
          const newBalance = freshUser.walletBalance - order.priceToman;
          await tx.user.update({
            where: { id: order.userId },
            data: { walletBalance: newBalance },
          });
          await tx.walletTransaction.create({
            data: {
              userId: order.userId,
              type: WalletTxType.PURCHASE,
              amountToman: -order.priceToman,
              balanceAfter: newBalance,
              orderId: order.id,
              description: `خرید ${order.trafficGB} گیگابایت`,
            },
          });
        }

        const cfg = await tx.vpnConfig.create({
          data: {
            userId: order.userId,
            serverId: order.serverId ?? null,
            serverLabel: serverDisplayName,
            email: pgUser.username,
            uuid: `${uuidPrefix}_${pgUser.id}`,
            subId: extractSubToken(pgUser.subscriptionUrl),
            subscriptionUrl: pgUser.subscriptionUrl,
            panelClientId: pgUser.id,
            totalGB: order.trafficGB,
            expiryAt: expireAt,
            status: 'ACTIVE',
          },
        });

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            configId: cfg.id,
            completedAt: new Date(),
            paidAt: isPendingWallet ? new Date() : undefined,
          },
        });

        await tx.user.update({
          where: { id: order.userId },
          data: {
            totalSpent: { increment: order.priceToman },
            totalPurchases: { increment: 1 },
          },
        });

        return { cfg };
      });

      configId = result.cfg.id;
      subscriptionUrl = pgUser.subscriptionUrl;
    } catch (err: unknown) {
      const isUuidCollision = (() => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
        const target = err.meta?.target;
        if (Array.isArray(target)) return (target as string[]).some((f) => f === 'uuid' || f === 'subId');
        if (typeof target === 'string') return target.includes('uuid') || target.includes('subId');
        return false;
      })();

      logger.error({ err, orderId, username: pgUser.username, isUuidCollision }, 'DB transaction failed after PasarGuard user created during fulfillment — attempting compensating delete');
      try {
        await pasarguardClient.deleteUser(pgUser.username);
        logger.info({ username: pgUser.username }, 'Compensating delete succeeded');
      } catch (delErr) {
        logger.error({ delErr, username: pgUser.username }, 'Compensating delete FAILED — orphan user remains in panel');
      }

      if (isUuidCollision) {
        return { ok: false, reason: 'uuid collision (panel ID reuse — try different username)', nameTaken: true };
      }
      return { ok: false, reason: 'DB transaction failed' };
    }

    // Referral commission (after main tx commits)
    await referralService.tryCreditCommission(order.userId, order.priceToman, orderId);

    // Notify user
    await notifyUserFulfilled({
      userId: order.userId,
      configId,
      accountName: pgUser.username,
      trafficGB: order.trafficGB,
      durationDays: order.durationDays,
      subscriptionUrl,
      expireAt,
      serverFlag: serverDisplayFlag,
      serverName: serverDisplayName,
    });

    // Channel log
    await logFulfillmentToChannel({
      orderId,
      userId: order.userId,
      trafficGB: order.trafficGB,
      durationDays: order.durationDays,
      priceToman: order.priceToman,
      tonMemo: order.tonMemo,
      configId,
      serverFlag: serverDisplayFlag,
      serverName: serverDisplayName,
    });

    return { ok: true, configId, subscriptionUrl };
  },
};

// Mark an order FAILED and, for already-PAID orders (TON/card), refund priceToman to wallet.
// For PENDING wallet orders, the balance was never deducted so no refund is needed.
export async function markOrderFailed(orderId: string): Promise<{ refunded: boolean }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { refunded: false };

  if (order.status === OrderStatus.PAID) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.FAILED } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
      const newBalance = user.walletBalance + order.priceToman;
      await tx.user.update({ where: { id: order.userId }, data: { walletBalance: newBalance } });
      await tx.walletTransaction.create({
        data: {
          userId: order.userId,
          type: WalletTxType.REFUND,
          amountToman: order.priceToman,
          balanceAfter: newBalance,
          orderId: order.id,
          description: `بازگشت مبلغ سفارش ${order.id.slice(-6)}`,
        },
      });
    });
    logger.info({ orderId, userId: order.userId.toString() }, 'Order marked FAILED with wallet refund');
    return { refunded: true };
  }

  // PENDING order (wallet payment awaiting fulfillment, or card/ton not yet processed)
  await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.FAILED } });
  logger.info({ orderId }, 'Order marked FAILED (no wallet deduction to refund)');
  return { refunded: false };
}

async function notifyUserFulfilled(params: {
  userId: bigint;
  configId: number;
  accountName: string;
  trafficGB: number;
  durationDays: number;
  subscriptionUrl: string;
  expireAt: Date | null;
  serverFlag: string | null;
  serverName: string;
}): Promise<void> {
  const { bot } = await import('@/bot');
  const expiryDate = params.expireAt;

  const text =
    `✅ <b>سرویس جدیدت آماده شد!</b>\n\n` +
    `🛡️ سرویس #${params.configId}\n` +
    `👤 نام اکانت: <code>${escapeHtml(params.accountName)}</code>\n` +
    `📍 ${params.serverFlag ?? ''}${escapeHtml(params.serverName)}\n` +
    `📦 ${formatGB(params.trafficGB)}  •  ${params.durationDays} روز` +
    (expiryDate ? `\n📅 انقضا: ${formatDateIR(expiryDate)}` : '') +
    `\n\n🔗 لینک اشتراک:\n<code>${params.subscriptionUrl}</code>\n\n` +
    'این لینک رو کپی کن و توی برنامه VPN ایمپورت کن.';

  try {
    await bot.api.sendMessage(Number(params.userId), text, { parse_mode: 'HTML' });
  } catch (err) {
    logger.warn({ err, userId: params.userId.toString() }, 'Failed to notify user of fulfillment');
    return;
  }

  try {
    const buffer = await generateQRBuffer(params.subscriptionUrl);
    await bot.api.sendPhoto(Number(params.userId), new InputFile(buffer, 'qr.png'), {
      caption: '🔳 برای ایمپورت سریع، این QR رو با برنامه VPN خودت اسکن کن.',
    });
  } catch (err) {
    logger.warn({ err, userId: params.userId.toString() }, 'Failed to send QR after fulfillment');
  }
}

async function logFulfillmentToChannel(params: {
  orderId: string;
  userId: bigint;
  trafficGB: number;
  durationDays: number;
  priceToman: bigint;
  tonMemo: string | null;
  configId: number;
  serverFlag: string | null;
  serverName: string;
}): Promise<void> {
  const { bot } = await import('@/bot');

  const text =
    `🪙 <b>خرید جدید — پرداخت TON</b>\n\n` +
    `👤 کاربر: #${params.userId}\n` +
    `🛡️ سرویس: #${params.configId}\n` +
    `📦 ${formatGB(params.trafficGB)} — ${params.durationDays} روز\n` +
    `📍 ${params.serverFlag ?? ''}${escapeHtml(params.serverName)}\n` +
    `💰 مبلغ: ${formatToman(params.priceToman)}` +
    (params.tonMemo ? `\n📝 memo: ${params.tonMemo}` : '');

  try {
    await bot.api.sendMessage(config.LOG_CHANNEL_ID, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '👤 پروفایل کاربر', callback_data: `admin:user:${params.userId}` },
          { text: '🛡️ مشاهده سرویس', callback_data: `admin:config:${params.configId}` },
        ]],
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to log fulfillment to channel');
  }
}
