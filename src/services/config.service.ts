import { type Server, type VpnConfig } from '@prisma/client';
import { prisma } from '@/db/client';
import { pasarguardClient } from '@/adapters/pasarguard';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export type VpnConfigWithServer = VpnConfig & { server: Server | null };

export function getServerDisplay(cfg: VpnConfig & { server: Server | null }): string {
  if (cfg.serverLabel) return cfg.serverLabel;
  if (cfg.server) return `${cfg.server.flag ?? ''}${cfg.server.name}`;
  return '—';
}

export const configService = {
  async listByUser(userId: bigint): Promise<VpnConfigWithServer[]> {
    return prisma.vpnConfig.findMany({
      where: { userId, status: { not: 'DELETED' } },
      include: { server: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  },

  async getById(id: number, userId: bigint): Promise<VpnConfigWithServer | null> {
    return prisma.vpnConfig.findFirst({
      where: { id, userId },
      include: { server: true },
    });
  },

  // Pulls fresh traffic from the panel and updates the DB.
  // Returns cached values with stale=true if the panel is unreachable.
  async syncTraffic(
    configId: number,
  ): Promise<{ up: bigint; down: bigint; total: bigint; stale: boolean }> {
    const cfg = await prisma.vpnConfig.findUnique({ where: { id: configId } });
    if (!cfg) throw new NotFoundError('VpnConfig');

    try {
      const t = await pasarguardClient.getUserUsed(cfg.email);
      await prisma.vpnConfig.update({
        where: { id: configId },
        data: {
          uploadBytes: 0n,
          downloadBytes: t.usedBytes,
          lastSyncAt: new Date(),
        },
      });
      return { up: 0n, down: t.usedBytes, total: t.usedBytes, stale: false };
    } catch (err) {
      logger.warn({ err, configId }, 'Traffic sync failed — returning cached values');
      return {
        up: cfg.uploadBytes,
        down: cfg.downloadBytes,
        total: cfg.uploadBytes + cfg.downloadBytes,
        stale: true,
      };
    }
  },
};
