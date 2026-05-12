import { AdminActionType, Prisma } from '@prisma/client';
import { prisma } from '@/db/client';
import { NotFoundError } from '@/lib/errors';
import { adminAuditService } from './admin-audit.service';

export const adminUserService = {
  async getProfile(userId: bigint) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        configs: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
        _count: {
          select: { configs: true, orders: true },
        },
      },
    });
  },

  async search(query: string) {
    const trimmed = query.trim();

    if (/^\d+$/.test(trimmed)) {
      try {
        const byId = await prisma.user.findUnique({ where: { id: BigInt(trimmed) } });
        return byId ? [byId] : [];
      } catch {
        return [];
      }
    }

    const usernameQuery = trimmed.startsWith('@') ? trimmed.slice(1) : null;
    if (usernameQuery) {
      const byUsername = await prisma.user.findFirst({ where: { username: usernameQuery } });
      return byUsername ? [byUsername] : [];
    }

    return prisma.user.findMany({
      where: { firstName: { contains: trimmed, mode: 'insensitive' } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  },

  async listRecent(limit = 15) {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async getWalletHistory(userId: bigint, limit = 10) {
    return prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async adjustWallet(params: {
    adminId: bigint;
    userId: bigint;
    amount: bigint;
    op: 'add' | 'deduct';
    reason: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) throw new NotFoundError('User');

      const delta = params.op === 'add' ? params.amount : -params.amount;
      const newBalance = user.walletBalance + delta;
      if (newBalance < 0n) throw new Error('موجودی کیف پول کافی نیست');

      const updated = await tx.user.update({
        where: { id: params.userId },
        data: { walletBalance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          userId: params.userId,
          type: params.op === 'add' ? 'TOPUP_ADMIN' : 'ADMIN_DEDUCT',
          amountToman: params.op === 'add' ? params.amount : -params.amount,
          balanceAfter: newBalance,
          description:
            params.reason ?? (params.op === 'add' ? 'شارژ توسط ادمین' : 'کسر توسط ادمین'),
          adminId: params.adminId,
        },
      });

      await adminAuditService.log(tx, {
        adminId: params.adminId,
        type: params.op === 'add' ? AdminActionType.WALLET_ADD : AdminActionType.WALLET_DEDUCT,
        targetUserId: params.userId,
        payload: {
          amount: params.amount.toString(),
          newBalance: newBalance.toString(),
          reason: params.reason ?? '',
        } satisfies Prisma.InputJsonObject,
      });

      return updated;
    });
  },

  async setBanned(params: { adminId: bigint; userId: bigint; isBanned: boolean }) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: params.userId },
        data: { isBanned: params.isBanned },
      });

      await adminAuditService.log(tx, {
        adminId: params.adminId,
        type: params.isBanned ? AdminActionType.BAN_USER : AdminActionType.UNBAN_USER,
        targetUserId: params.userId,
        payload: {} satisfies Prisma.InputJsonObject,
      });

      return updated;
    });
  },
};
