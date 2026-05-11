import { WalletTxType } from '@prisma/client';
import { prisma } from '@/db/client';
import { xuiClient } from '@/adapters/xui';
import { logger } from '@/lib/logger';
import { getTrafficPackage } from './traffic-packages';

type ExtendResult = { ok: true; newExpiry: Date; newBalance: bigint } | { ok: false; reason: 'NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'PANEL_ERROR' | 'PLAN_INACTIVE' };
type TrafficResult = { ok: true; newTotalGB: number; newBalance: bigint } | { ok: false; reason: 'NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'PANEL_ERROR' | 'UNLIMITED' };

export const renewalService = {
  async extend(params: {
    userId: bigint;
    configId: number;
    planId: number;
  }): Promise<ExtendResult> {
    const [user, config, plan] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.userId } }),
      prisma.vpnConfig.findFirst({ where: { id: params.configId, userId: params.userId } }),
      prisma.plan.findUnique({ where: { id: params.planId } }),
    ]);

    if (!user || !config || !plan) return { ok: false, reason: 'NOT_FOUND' };
    if (!plan.isActive) return { ok: false, reason: 'PLAN_INACTIVE' };
    if (user.walletBalance < plan.priceToman) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };

    const baseTime =
      config.expiryAt && config.expiryAt > new Date()
        ? config.expiryAt.getTime()
        : Date.now();
    const newExpiryMs = baseTime + plan.durationDays * 24 * 3600 * 1000;
    const newExpiry = new Date(newExpiryMs);

    // Panel call BEFORE DB transaction. If panel fails, transaction never runs.
    try {
      await xuiClient.updateClient(config.uuid, { expiryTimeMs: newExpiryMs });
    } catch (err) {
      logger.error({ err, uuid: config.uuid, configId: config.id }, 'Panel updateClient failed during extend');
      return { ok: false, reason: 'PANEL_ERROR' };
    }

    const newBalance = user.walletBalance - plan.priceToman;

    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { walletBalance: newBalance, totalSpent: user.totalSpent + plan.priceToman },
        }),
        prisma.vpnConfig.update({
          where: { id: config.id },
          data: {
            expiryAt: newExpiry,
            status: 'ACTIVE',
            notifiedExpiry3d: false,
            notifiedExpiry1d: false,
          },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: user.id,
            type: WalletTxType.PURCHASE,
            amountToman: -plan.priceToman,
            balanceAfter: newBalance,
            description: `تمدید سرویس #${config.id} (${plan.title})`,
          },
        }),
      ]);
    } catch (err) {
      // Panel was updated but DB failed — log loudly for manual reconciliation.
      logger.error(
        { err, uuid: config.uuid, configId: config.id, newExpiryMs },
        'CRITICAL: panel updated but DB transaction failed — manual fix required',
      );
      return { ok: false, reason: 'PANEL_ERROR' };
    }

    return { ok: true, newExpiry, newBalance };
  },

  async addTraffic(params: {
    userId: bigint;
    configId: number;
    packageId: number;
  }): Promise<TrafficResult> {
    const pkg = getTrafficPackage(params.packageId);
    if (!pkg) return { ok: false, reason: 'NOT_FOUND' };

    const [user, config] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.userId } }),
      prisma.vpnConfig.findFirst({ where: { id: params.configId, userId: params.userId } }),
    ]);

    if (!user || !config) return { ok: false, reason: 'NOT_FOUND' };
    if (config.totalGB === 0) return { ok: false, reason: 'UNLIMITED' };
    if (user.walletBalance < pkg.priceToman) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };

    const newTotalGB = config.totalGB + pkg.gb;

    try {
      await xuiClient.updateClient(config.uuid, { totalGB: newTotalGB });
    } catch (err) {
      logger.error({ err, uuid: config.uuid, configId: config.id }, 'Panel updateClient failed during addTraffic');
      return { ok: false, reason: 'PANEL_ERROR' };
    }

    const newBalance = user.walletBalance - pkg.priceToman;

    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { walletBalance: newBalance, totalSpent: user.totalSpent + pkg.priceToman },
        }),
        prisma.vpnConfig.update({
          where: { id: config.id },
          data: {
            totalGB: newTotalGB,
            notified80Pct: false,
            notified95Pct: false,
          },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: user.id,
            type: WalletTxType.PURCHASE,
            amountToman: -pkg.priceToman,
            balanceAfter: newBalance,
            description: `افزایش حجم سرویس #${config.id} (+${pkg.gb} گیگ)`,
          },
        }),
      ]);
    } catch (err) {
      logger.error(
        { err, uuid: config.uuid, configId: config.id, newTotalGB },
        'CRITICAL: panel updated but DB transaction failed during addTraffic — manual fix required',
      );
      return { ok: false, reason: 'PANEL_ERROR' };
    }

    return { ok: true, newTotalGB, newBalance };
  },
};
