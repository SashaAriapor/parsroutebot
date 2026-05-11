import { randomUUID } from 'crypto';
import { OrderStatus, PaymentMethod, WalletTxType } from '@prisma/client';
import { prisma } from '@/db/client';
import { xuiClient, generateClientEmail, generateSubId } from '@/adapters/xui';
import { buildSubUrl } from './config.service';
import { discountService } from './discount.service';
import { referralService } from './referral.service';
import { logger } from '@/lib/logger';

type ExecuteParams = {
  userId: bigint;
  serverId: number;
  trafficGB: number;
  durationDays: number;
  pricePerGB: bigint;
  discountCode?: string;
  finalPriceToman: bigint;
};

type ReferralResult =
  | { credited: true; referrerId: bigint; commission: bigint }
  | { credited: false };

type ExecuteResult =
  | {
      ok: true;
      configId: number;
      subscriptionUrl: string;
      newBalance: bigint;
      referral: ReferralResult;
    }
  | {
      ok: false;
      reason: string;
      code: 'INSUFFICIENT_BALANCE' | 'PANEL_FAILED' | 'SERVER_INACTIVE' | 'INVALID_DISCOUNT' | 'UNKNOWN';
    };

export const buyService = {
  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const basePriceToman = params.pricePerGB * BigInt(params.trafficGB);

    // 1. Pre-validate
    const [user, server] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.userId } }),
      prisma.server.findUnique({ where: { id: params.serverId } }),
    ]);

    if (!user || !server) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
    if (!server.isActive) return { ok: false, reason: 'این سرور دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    if (user.walletBalance < params.finalPriceToman) return { ok: false, reason: 'موجودی کافی نیست.', code: 'INSUFFICIENT_BALANCE' };

    if (params.discountCode) {
      const dcCheck = await discountService.validate(params.discountCode, params.userId);
      if (!dcCheck.ok) return { ok: false, reason: dcCheck.reason, code: 'INVALID_DISCOUNT' };
    }

    // 2. Generate XUI client identifiers
    const email = generateClientEmail();
    const uuid = randomUUID();
    const subId = generateSubId();
    const expiryTimeMs = params.durationDays > 0
      ? Date.now() + params.durationDays * 24 * 3600 * 1000
      : 0;

    // 3. Create XUI client FIRST — if this fails, no DB changes yet
    try {
      await xuiClient.createClient({
        email,
        uuid,
        totalGB: params.trafficGB,
        expiryTimeMs,
        limitIp: 2,
        subId,
      });
    } catch (err) {
      logger.error({ err, params }, 'Failed to create XUI client during purchase');
      return { ok: false, reason: 'خطا در ساخت کانفیگ روی سرور. لطفاً به پشتیبانی پیام بده.', code: 'PANEL_FAILED' };
    }

    // 4. DB transaction
    try {
      const dbResult = await prisma.$transaction(async (tx) => {
        // Re-fetch user inside tx for fresh balance (guard against race)
        const freshUser = await tx.user.findUniqueOrThrow({ where: { id: params.userId } });
        if (freshUser.walletBalance < params.finalPriceToman) {
          throw Object.assign(new Error('INSUFFICIENT_BALANCE_RACE'), { code: 'INSUFFICIENT_BALANCE' });
        }

        if (params.discountCode) {
          await discountService.consume(tx, params.discountCode);
        }

        const order = await tx.order.create({
          data: {
            userId: params.userId,
            planId: null,
            serverId: params.serverId,
            trafficGB: params.trafficGB,
            durationDays: params.durationDays,
            pricePerGB: params.pricePerGB,
            priceToman: params.finalPriceToman,
            discountCode: params.discountCode ?? null,
            discountAmount: basePriceToman - params.finalPriceToman,
            paymentMethod: PaymentMethod.WALLET,
            status: OrderStatus.PAID,
            paidAt: new Date(),
          },
        });

        const cfg = await tx.vpnConfig.create({
          data: {
            userId: params.userId,
            serverId: params.serverId,
            email,
            uuid,
            subId,
            totalGB: params.trafficGB,
            expiryAt: expiryTimeMs > 0 ? new Date(expiryTimeMs) : null,
            status: 'ACTIVE',
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { configId: cfg.id, completedAt: new Date(), status: OrderStatus.COMPLETED },
        });

        const newBalance = freshUser.walletBalance - params.finalPriceToman;

        await tx.user.update({
          where: { id: params.userId },
          data: {
            walletBalance: newBalance,
            totalSpent: { increment: params.finalPriceToman },
            totalPurchases: { increment: 1 },
          },
        });

        await tx.walletTransaction.create({
          data: {
            userId: params.userId,
            type: WalletTxType.PURCHASE,
            amountToman: -params.finalPriceToman,
            balanceAfter: newBalance,
            orderId: order.id,
            description: `خرید ${params.trafficGB} گیگابایت`,
          },
        });

        return { cfg, order, newBalance };
      });

      // 5. Referral commission (separate transaction, after main tx commits)
      const referral = await referralService.tryCreditCommission(
        params.userId,
        params.finalPriceToman,
        dbResult.order.id,
      );

      const subscriptionUrl = buildSubUrl(server, subId);

      return {
        ok: true,
        configId: dbResult.cfg.id,
        subscriptionUrl,
        newBalance: dbResult.newBalance,
        referral,
      };
    } catch (err: unknown) {
      // DB transaction failed — XUI client was already created. Attempt compensating delete.
      logger.error({ err, email, uuid }, 'DB transaction failed AFTER XUI client created — attempting compensating delete');

      try {
        await xuiClient.deleteClient(uuid);
        logger.info({ uuid }, 'Compensating delete succeeded');
      } catch (delErr) {
        logger.error({ delErr, uuid }, 'Compensating delete FAILED — orphan client remains in panel');
      }

      const errCode = (err instanceof Error && (err as NodeJS.ErrnoException).code === 'INSUFFICIENT_BALANCE')
        ? 'INSUFFICIENT_BALANCE' as const
        : 'UNKNOWN' as const;

      return {
        ok: false,
        reason: errCode === 'INSUFFICIENT_BALANCE'
          ? 'موجودی کافی نیست.'
          : 'خطا در ثبت سفارش. اگه از کیف پولت کسر شد، با پشتیبانی تماس بگیر.',
        code: errCode,
      };
    }
  },
};
