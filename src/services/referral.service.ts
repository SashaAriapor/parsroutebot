import { WalletTxType } from '@prisma/client';
import { prisma } from '@/db/client';
import { logger } from '@/lib/logger';

const COMMISSION_PERCENT = 10;

type CommissionResult =
  | { credited: true; referrerId: bigint; commission: bigint }
  | { credited: false };

export const referralService = {
  async tryCreditCommission(
    buyerId: bigint,
    purchaseAmount: bigint,
    orderId: string,
  ): Promise<CommissionResult> {
    try {
      const referral = await prisma.referral.findUnique({ where: { refereeId: buyerId } });
      if (!referral) return { credited: false };

      const commission = (purchaseAmount * BigInt(COMMISSION_PERCENT)) / 100n;
      if (commission <= 0n) return { credited: false };

      await prisma.$transaction(async (tx) => {
        const referrer = await tx.user.findUnique({ where: { id: referral.referrerId } });
        if (!referrer) return;

        const newBalance = referrer.walletBalance + commission;

        await tx.user.update({
          where: { id: referrer.id },
          data: { walletBalance: newBalance },
        });

        await tx.referral.update({
          where: { id: referral.id },
          data: { totalCommission: { increment: commission } },
        });

        await tx.walletTransaction.create({
          data: {
            userId: referrer.id,
            type: WalletTxType.REFERRAL_COMMISSION,
            amountToman: commission,
            balanceAfter: newBalance,
            orderId,
            description: `کمیسیون رفرال از خرید کاربر ${buyerId}`,
          },
        });
      });

      return { credited: true, referrerId: referral.referrerId, commission };
    } catch (err) {
      logger.error({ err, buyerId, orderId }, 'Referral commission failed silently');
      return { credited: false };
    }
  },
};
