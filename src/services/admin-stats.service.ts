import { prisma } from '@/db/client';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

export const adminStatsService = {
  async getOverall() {
    const [
      userTotal,
      userBanned,
      userActiveLast7d,
      configsTotal,
      configsActive,
      configsExpired,
      ordersTotal,
      ordersCompleted,
      ordersPending,
      revenueAgg,
      revenueByMethod,
      topupTonAgg,
      tonPaymentOrphans,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { updatedAt: { gte: daysAgo(7) } } }),
      prisma.vpnConfig.count(),
      prisma.vpnConfig.count({ where: { status: 'ACTIVE' } }),
      prisma.vpnConfig.count({ where: { status: 'EXPIRED' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'COMPLETED' } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { priceToman: true },
      }),
      prisma.order.groupBy({
        by: ['paymentMethod'],
        where: { status: 'COMPLETED' },
        _sum: { priceToman: true },
        _count: true,
      }),
      prisma.walletTransaction.aggregate({
        where: { type: 'TOPUP_TON' },
        _sum: { amountToman: true },
      }),
      prisma.tonPayment.count({ where: { status: 'ORPHANED' } }),
    ]);

    const totalRevenue = revenueAgg._sum.priceToman ?? 0n;
    const totalTopupToman = topupTonAgg._sum.amountToman ?? 0n;

    const byMethod: Record<string, { count: number; sum: bigint }> = {};
    for (const row of revenueByMethod) {
      byMethod[row.paymentMethod] = {
        count: row._count,
        sum: row._sum.priceToman ?? 0n,
      };
    }

    return {
      users: { total: userTotal, banned: userBanned, activeLast7d: userActiveLast7d },
      configs: { total: configsTotal, active: configsActive, expired: configsExpired },
      orders: { total: ordersTotal, completed: ordersCompleted, pending: ordersPending },
      revenue: {
        total: totalRevenue,
        wallet: byMethod['WALLET']?.sum ?? 0n,
        ton: byMethod['TON']?.sum ?? 0n,
      },
      ton: { totalTopupToman, orphans: tonPaymentOrphans },
    };
  },

  async getTopCustomers(sortBy: 'spent' | 'count', limit = 15) {
    return prisma.user.findMany({
      where: { totalPurchases: { gt: 0 } },
      orderBy: sortBy === 'spent' ? { totalSpent: 'desc' } : { totalPurchases: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        username: true,
        totalSpent: true,
        totalPurchases: true,
      },
    });
  },

  async getTopReferrers(limit = 10) {
    const rows = await prisma.referral.groupBy({
      by: ['referrerId'],
      where: {
        referee: {
          orders: { some: { status: 'COMPLETED' } },
        },
      },
      _count: { refereeId: true },
      orderBy: { _count: { refereeId: 'desc' } },
      take: limit,
    });

    if (rows.length === 0) return [];

    const users = await prisma.user.findMany({
      where: { id: { in: rows.map(r => r.referrerId) } },
      select: { id: true, username: true, firstName: true },
    });

    const byId = new Map(users.map(u => [u.id.toString(), u]));

    return rows.map(r => ({
      referrerId: r.referrerId,
      count: r._count.refereeId,
      username: byId.get(r.referrerId.toString())?.username ?? null,
      firstName: byId.get(r.referrerId.toString())?.firstName ?? null,
    }));
  },
};
