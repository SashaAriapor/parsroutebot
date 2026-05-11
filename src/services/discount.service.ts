import { type Prisma } from '@prisma/client';
import { prisma } from '@/db/client';

type ValidateResult =
  | { ok: true; percentOff: number; id: number }
  | { ok: false; reason: string };

export const discountService = {
  async validate(code: string, userId: bigint): Promise<ValidateResult> {
    const dc = await prisma.discountCode.findUnique({ where: { code } });
    if (!dc) return { ok: false, reason: 'این کد تخفیف وجود نداره.' };
    if (!dc.isActive) return { ok: false, reason: 'این کد تخفیف غیرفعاله.' };
    if (dc.expiresAt && dc.expiresAt < new Date()) return { ok: false, reason: 'این کد تخفیف منقضی شده.' };
    if (dc.maxUses != null && dc.usedCount >= dc.maxUses) return { ok: false, reason: 'سقف استفاده از این کد پر شده.' };
    if (dc.onlyForUserId != null && dc.onlyForUserId !== userId) return { ok: false, reason: 'این کد برای حساب شما نیست.' };
    return { ok: true, percentOff: dc.percentOff, id: dc.id };
  },

  async consume(tx: Prisma.TransactionClient, code: string): Promise<void> {
    await tx.discountCode.update({
      where: { code },
      data: { usedCount: { increment: 1 } },
    });
  },
};
