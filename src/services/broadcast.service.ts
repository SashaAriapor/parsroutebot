import { type Prisma } from '@prisma/client';
import { prisma } from '@/db/client';
import type { BroadcastSegment } from '@/bot/state/pending-admin-input';

export type { BroadcastSegment };

function segmentToWhere(segment: BroadcastSegment): Prisma.UserWhereInput {
  const notBanned = { isBanned: false };
  switch (segment) {
    case 'all':            return notBanned;
    case 'active':         return { ...notBanned, totalPurchases: { gt: 0 } };
    case 'vip':            return { ...notBanned, totalPurchases: { gte: 3 } };
    case 'never-bought':   return { ...notBanned, totalPurchases: 0 };
    case 'has-active-config':
      return { ...notBanned, configs: { some: { status: 'ACTIVE' } } };
  }
}

export const broadcastService = {
  async countSegment(segment: BroadcastSegment): Promise<number> {
    return prisma.user.count({ where: segmentToWhere(segment) });
  },

  async findRecipients(segment: BroadcastSegment, batchSize: number, cursor?: bigint) {
    const where = segmentToWhere(segment);
    return prisma.user.findMany({
      where,
      select: { id: true },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });
  },
};
