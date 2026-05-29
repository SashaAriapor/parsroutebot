import { OrderStatus, PaymentMethod, WalletTxType } from '@prisma/client';
import { prisma } from '@/db/client';
import { pasarguardClient, generatePasarGuardUsername, gbToBytes, extractSubToken } from '@/adapters/pasarguard';
import type { PasarGuardUser } from '@/adapters/pasarguard';
import { discountService } from './discount.service';
import { referralService } from './referral.service';
import { tonInvoiceService } from './ton-invoice.service';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

type ExecuteParams = {
  userId: bigint;
  serverId?: number;
  categoryId?: number;
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

type PendingTonOrderParams = {
  userId: bigint;
  serverId?: number;
  categoryId?: number;
  trafficGB: number;
  durationDays: number;
  pricePerGB: bigint;
  discountCode?: string;
  finalPriceToman: bigint;
};

type PendingTonOrderResult =
  | { ok: true; orderId: string; tonAmountNano: bigint; tonMemo: string; tonAddress: string; expiresAt: Date }
  | { ok: false; reason: string; code: 'SERVER_INACTIVE' | 'INVALID_DISCOUNT' | 'UNKNOWN' };

type WalletOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string; code: 'INSUFFICIENT_BALANCE' | 'SERVER_INACTIVE' | 'INVALID_DISCOUNT' | 'UNKNOWN' };

type PendingCardOrderParams = {
  userId: bigint;
  serverId?: number;
  categoryId?: number;
  trafficGB: number;
  durationDays: number;
  pricePerGB: bigint;
  discountCode?: string;
  finalPriceToman: bigint;
  cardFeePercent: number;
};

type PendingCardOrderResult =
  | { ok: true; orderId: string; priceWithFee: bigint }
  | { ok: false; reason: string; code: 'SERVER_INACTIVE' | 'INVALID_DISCOUNT' | 'UNKNOWN' };

export const buyService = {
  async createPendingTonOrder(params: PendingTonOrderParams): Promise<PendingTonOrderResult> {
    if (params.serverId) {
      const server = await prisma.server.findUnique({ where: { id: params.serverId } });
      if (!server) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!server.isActive) return { ok: false, reason: 'این سرور دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else if (params.categoryId) {
      const category = await prisma.serviceCategory.findUnique({ where: { id: params.categoryId } });
      if (!category) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!category.isActive) return { ok: false, reason: 'این دسته‌بندی دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else {
      return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
    }

    const basePriceToman = params.pricePerGB * BigInt(params.trafficGB);

    if (params.discountCode) {
      const dcCheck = await discountService.validate(params.discountCode, params.userId, null, basePriceToman);
      if (!dcCheck.ok) return { ok: false, reason: dcCheck.reason, code: 'INVALID_DISCOUNT' };
    }

    const { nanoTon, rateTomanPerTon } = await tonInvoiceService.tomanToNanoTon(params.finalPriceToman);
    const expiresAt = tonInvoiceService.invoiceExpiry();

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          userId: params.userId,
          planId: null,
          serverId: params.serverId ?? null,
          categoryId: params.categoryId ?? null,
          trafficGB: params.trafficGB,
          durationDays: params.durationDays,
          pricePerGB: params.pricePerGB,
          priceToman: params.finalPriceToman,
          discountCode: params.discountCode ?? null,
          discountAmount: basePriceToman - params.finalPriceToman,
          paymentMethod: PaymentMethod.TON,
          status: OrderStatus.PENDING,
          tonAmountNano: nanoTon,
          tonRateSnapshot: rateTomanPerTon,
          rateValidUntil: expiresAt,
        },
      });

      const memo = tonInvoiceService.generateMemo({ kind: 'order', orderId: o.id });

      if (params.discountCode) {
        await discountService.consume(tx, params.discountCode);
      }

      return tx.order.update({ where: { id: o.id }, data: { tonMemo: memo } });
    });

    return {
      ok: true,
      orderId: order.id,
      tonAmountNano: nanoTon,
      tonMemo: order.tonMemo!,
      tonAddress: config.TON_WALLET_ADDRESS,
      expiresAt,
    };
  },

  async createPendingCardOrder(params: PendingCardOrderParams): Promise<PendingCardOrderResult> {
    if (params.serverId) {
      const server = await prisma.server.findUnique({ where: { id: params.serverId } });
      if (!server) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!server.isActive) return { ok: false, reason: 'این سرور دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else if (params.categoryId) {
      const category = await prisma.serviceCategory.findUnique({ where: { id: params.categoryId } });
      if (!category) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!category.isActive) return { ok: false, reason: 'این دسته‌بندی دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else {
      return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
    }

    const basePriceToman = params.pricePerGB * BigInt(params.trafficGB);

    if (params.discountCode) {
      const dcCheck = await discountService.validate(params.discountCode, params.userId, null, basePriceToman);
      if (!dcCheck.ok) return { ok: false, reason: dcCheck.reason, code: 'INVALID_DISCOUNT' };
    }

    const priceWithFee = (params.finalPriceToman * BigInt(100 + params.cardFeePercent)) / 100n;

    const order = await prisma.$transaction(async (tx) => {
      if (params.discountCode) {
        await discountService.consume(tx, params.discountCode);
      }

      return tx.order.create({
        data: {
          userId: params.userId,
          planId: null,
          serverId: params.serverId ?? null,
          categoryId: params.categoryId ?? null,
          trafficGB: params.trafficGB,
          durationDays: params.durationDays,
          pricePerGB: params.pricePerGB,
          priceToman: priceWithFee,
          discountCode: params.discountCode ?? null,
          discountAmount: basePriceToman - params.finalPriceToman,
          paymentMethod: 'CARD',
          status: 'PENDING_CARD_APPROVAL',
          cardFeePercent: params.cardFeePercent,
        },
      });
    });

    return { ok: true, orderId: order.id, priceWithFee };
  },

  async createPendingWalletOrder(params: ExecuteParams): Promise<WalletOrderResult> {
    const basePriceToman = params.pricePerGB * BigInt(params.trafficGB);

    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };

    if (params.serverId) {
      const server = await prisma.server.findUnique({ where: { id: params.serverId } });
      if (!server) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!server.isActive) return { ok: false, reason: 'این سرور دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else if (params.categoryId) {
      const category = await prisma.serviceCategory.findUnique({ where: { id: params.categoryId } });
      if (!category) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!category.isActive) return { ok: false, reason: 'این دسته‌بندی دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else {
      return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
    }

    if (user.walletBalance < params.finalPriceToman) return { ok: false, reason: 'موجودی کافی نیست.', code: 'INSUFFICIENT_BALANCE' };

    if (params.discountCode) {
      const dcCheck = await discountService.validate(params.discountCode, params.userId, null, basePriceToman);
      if (!dcCheck.ok) return { ok: false, reason: dcCheck.reason, code: 'INVALID_DISCOUNT' };
    }

    try {
      const orderId = await prisma.$transaction(async (tx) => {
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
            serverId: params.serverId ?? null,
            categoryId: params.categoryId ?? null,
            trafficGB: params.trafficGB,
            durationDays: params.durationDays,
            pricePerGB: params.pricePerGB,
            priceToman: params.finalPriceToman,
            discountCode: params.discountCode ?? null,
            discountAmount: basePriceToman - params.finalPriceToman,
            paymentMethod: PaymentMethod.WALLET,
            status: OrderStatus.PENDING,
          },
        });

        return order.id;
      });

      return { ok: true, orderId };
    } catch (err: unknown) {
      const errCode = (err instanceof Error && (err as NodeJS.ErrnoException).code === 'INSUFFICIENT_BALANCE')
        ? 'INSUFFICIENT_BALANCE' as const
        : 'UNKNOWN' as const;
      return {
        ok: false,
        reason: errCode === 'INSUFFICIENT_BALANCE' ? 'موجودی کافی نیست.' : 'خطا در ثبت سفارش.',
        code: errCode,
      };
    }
  },

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const basePriceToman = params.pricePerGB * BigInt(params.trafficGB);

    // 1. Pre-validate
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };

    let pgGroupId: number | undefined;
    if (params.serverId) {
      const server = await prisma.server.findUnique({ where: { id: params.serverId } });
      if (!server) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!server.isActive) return { ok: false, reason: 'این سرور دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
    } else if (params.categoryId) {
      const category = await prisma.serviceCategory.findUnique({ where: { id: params.categoryId } });
      if (!category) return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
      if (!category.isActive) return { ok: false, reason: 'این دسته‌بندی دیگه فعال نیست.', code: 'SERVER_INACTIVE' };
      pgGroupId = parseInt(category.serverId, 10) || undefined;
    } else {
      return { ok: false, reason: 'اطلاعات سفارش یافت نشد.', code: 'UNKNOWN' };
    }
    if (user.walletBalance < params.finalPriceToman) return { ok: false, reason: 'موجودی کافی نیست.', code: 'INSUFFICIENT_BALANCE' };

    if (params.discountCode) {
      const dcCheck = await discountService.validate(params.discountCode, params.userId, null, basePriceToman);
      if (!dcCheck.ok) return { ok: false, reason: dcCheck.reason, code: 'INVALID_DISCOUNT' };
    }

    // 2. Create PasarGuard user FIRST — if this fails, no DB changes yet
    const pgUsername = generatePasarGuardUsername();
    const expireAt = params.durationDays > 0
      ? new Date(Date.now() + params.durationDays * 86400_000)
      : null;

    let pgUser: PasarGuardUser;
    try {
      pgUser = await pasarguardClient.createUser({
        username: pgUsername,
        dataLimitBytes: gbToBytes(params.trafficGB),
        expireAt,
        groupId: pgGroupId,
      });
    } catch (err) {
      logger.error({ err, params }, 'Failed to create PasarGuard user during purchase');
      return { ok: false, reason: 'خطا در ساخت کانفیگ روی سرور. لطفاً به پشتیبانی پیام بده.', code: 'PANEL_FAILED' };
    }

    // 3. DB transaction
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
            serverId: params.serverId ?? null,
            categoryId: params.categoryId ?? null,
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
            serverId: params.serverId ?? null,
            email: pgUser.username,
            uuid: String(pgUser.id),
            subId: extractSubToken(pgUser.subscriptionUrl),
            subscriptionUrl: pgUser.subscriptionUrl,
            panelClientId: pgUser.id,
            totalGB: params.trafficGB,
            expiryAt: expireAt,
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

      // 4. Referral commission (separate transaction, after main tx commits)
      const referral = await referralService.tryCreditCommission(
        params.userId,
        params.finalPriceToman,
        dbResult.order.id,
      );

      return {
        ok: true,
        configId: dbResult.cfg.id,
        subscriptionUrl: pgUser.subscriptionUrl,
        newBalance: dbResult.newBalance,
        referral,
      };
    } catch (err: unknown) {
      // DB transaction failed — PasarGuard user was already created. Attempt compensating delete.
      logger.error({ err, username: pgUser.username }, 'DB transaction failed AFTER PasarGuard user created — attempting compensating delete');

      try {
        await pasarguardClient.deleteUser(pgUser.username);
        logger.info({ username: pgUser.username }, 'Compensating delete succeeded');
      } catch (delErr) {
        logger.error({ delErr, username: pgUser.username }, 'Compensating delete FAILED — orphan user remains in panel');
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
