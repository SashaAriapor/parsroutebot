import { prisma } from '@/db/client';

export type ReferralEntry = {
  refereeId: bigint;
  refereeUsername: string | null;
  refereeFirstName: string | null;
  joinedAt: Date;
  hasPurchased: boolean;
  purchases: number;
  commission: bigint;
};

export type ReferralStats = {
  totalReferred: number;
  totalActiveReferred: number;
  totalCommissionEarned: bigint;
  recentReferrals: ReferralEntry[];
};

export const referralStatsService = {
  async getStats(userId: bigint, recentLimit = 5): Promise<ReferralStats> {
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            totalPurchases: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalReferred = referrals.length;
    const totalActiveReferred = referrals.filter((r) => r.referee.totalPurchases > 0).length;
    const totalCommissionEarned = referrals.reduce((sum, r) => sum + r.totalCommission, 0n);

    const recentReferrals = referrals.slice(0, recentLimit).map((r) => ({
      refereeId: r.refereeId,
      refereeUsername: r.referee.username,
      refereeFirstName: r.referee.firstName,
      joinedAt: r.createdAt,
      hasPurchased: r.referee.totalPurchases > 0,
      purchases: r.referee.totalPurchases,
      commission: r.totalCommission,
    }));

    return { totalReferred, totalActiveReferred, totalCommissionEarned, recentReferrals };
  },
};
