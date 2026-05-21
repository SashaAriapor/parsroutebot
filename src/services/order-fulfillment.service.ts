import { OrderStatus } from '@prisma/client';
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
  | { ok: false; reason: string; nameTaken?: true };

export const orderFulfillmentService = {
  async fulfill(orderId: string, username?: string): Promise<FulfillResult> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      logger.error({ orderId }, 'fulfill: order not found');
      return { ok: false, reason: 'order not found' };
    }
    if (order.status !== OrderStatus.PAID) {
      logger.warn({ orderId, status: order.status }, 'fulfill: order not in PAID status');
      return { ok: false, reason: `order status is ${order.status}` };
    }

    const server = await prisma.server.findUnique({ where: { id: order.serverId! } });
    if (!server) {
      logger.error({ orderId, serverId: order.serverId }, 'fulfill: server not found');
      return { ok: false, reason: 'server not found' };
    }
    if (!server.isActive) {
      logger.error({ orderId, serverId: order.serverId }, 'fulfill: server is inactive');
      return { ok: false, reason: 'server is inactive' };
    }

    const pgUsername = username ?? generatePasarGuardUsername();
    const expireAt = order.durationDays > 0
      ? new Date(Date.now() + order.durationDays * 86400_000)
      : null;

    let pgUser: PasarGuardUser;
    try {
      pgUser = await pasarguardClient.createUser({
        username: pgUsername,
        dataLimitBytes: gbToBytes(order.trafficGB),
        expireAt,
      });
    } catch (err) {
      const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (errMsg.includes('409') || errMsg.includes('conflict') || errMsg.includes('already') || errMsg.includes('exist') || errMsg.includes('duplicate')) {
        return { ok: false, reason: 'username taken', nameTaken: true };
      }
      logger.error({ err, orderId }, 'PasarGuard user creation failed during fulfillment');
      return { ok: false, reason: 'PasarGuard user creation failed' };
    }

    let configId: number;
    let subscriptionUrl: string;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Guard against concurrent fulfillment
        const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        if (freshOrder.status !== OrderStatus.PAID) {
          throw Object.assign(new Error('ORDER_NOT_PAID'), { code: 'ORDER_NOT_PAID' });
        }

        const cfg = await tx.vpnConfig.create({
          data: {
            userId: order.userId,
            serverId: order.serverId!,
            email: pgUser.username,
            uuid: String(pgUser.id),
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
          data: { status: OrderStatus.COMPLETED, configId: cfg.id, completedAt: new Date() },
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
      logger.error({ err, orderId, username: pgUser.username }, 'DB transaction failed after PasarGuard user created during fulfillment — attempting compensating delete');
      try {
        await pasarguardClient.deleteUser(pgUser.username);
        logger.info({ username: pgUser.username }, 'Compensating delete succeeded');
      } catch (delErr) {
        logger.error({ delErr, username: pgUser.username }, 'Compensating delete FAILED — orphan user remains in panel');
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
      serverFlag: server.flag,
      serverName: server.name,
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
      serverFlag: server.flag,
      serverName: server.name,
    });

    return { ok: true, configId, subscriptionUrl };
  },
};

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
