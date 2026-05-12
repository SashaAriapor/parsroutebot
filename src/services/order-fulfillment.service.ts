import { randomUUID } from 'crypto';
import { OrderStatus } from '@prisma/client';
import { InputFile } from 'grammy';
import { prisma } from '@/db/client';
import { xuiClient, generateClientEmail, generateSubId } from '@/adapters/xui';
import { buildSubUrl } from './config.service';
import { referralService } from './referral.service';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/html';
import { formatToman, formatGB, formatDateIR } from '@/lib/format';
import { generateQRBuffer } from '@/lib/qrcode';

type FulfillResult =
  | { ok: true; configId: number; subscriptionUrl: string }
  | { ok: false; reason: string };

export const orderFulfillmentService = {
  async fulfill(orderId: string): Promise<FulfillResult> {
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

    const email = generateClientEmail();
    const uuid = randomUUID();
    const subId = generateSubId();
    const expiryTimeMs = order.durationDays > 0
      ? Date.now() + order.durationDays * 24 * 3600 * 1000
      : 0;

    try {
      await xuiClient.createClient({
        email,
        uuid,
        totalGB: order.trafficGB,
        expiryTimeMs,
        limitIp: 2,
        subId,
      });
    } catch (err) {
      logger.error({ err, orderId }, 'XUI client creation failed during fulfillment');
      return { ok: false, reason: 'XUI client creation failed' };
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
            email,
            uuid,
            subId,
            totalGB: order.trafficGB,
            expiryAt: expiryTimeMs > 0 ? new Date(expiryTimeMs) : null,
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
      subscriptionUrl = buildSubUrl(server, subId);
    } catch (err: unknown) {
      logger.error({ err, orderId, uuid }, 'DB transaction failed after XUI client created during fulfillment — attempting compensating delete');
      try {
        await xuiClient.deleteClient(uuid);
        logger.info({ uuid }, 'Compensating delete succeeded');
      } catch (delErr) {
        logger.error({ delErr, uuid }, 'Compensating delete FAILED — orphan client remains in panel');
      }
      return { ok: false, reason: 'DB transaction failed' };
    }

    // Referral commission (after main tx commits)
    await referralService.tryCreditCommission(order.userId, order.priceToman, orderId);

    // Notify user
    await notifyUserFulfilled({
      userId: order.userId,
      configId,
      trafficGB: order.trafficGB,
      durationDays: order.durationDays,
      subscriptionUrl,
      expiryTimeMs,
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
  trafficGB: number;
  durationDays: number;
  subscriptionUrl: string;
  expiryTimeMs: number;
  serverFlag: string | null;
  serverName: string;
}): Promise<void> {
  const { bot } = await import('@/bot');
  const expiryDate = params.expiryTimeMs > 0 ? new Date(params.expiryTimeMs) : null;

  const text =
    `✅ <b>سرویس جدیدت آماده شد!</b>\n\n` +
    `🛡️ سرویس #${params.configId}\n` +
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
