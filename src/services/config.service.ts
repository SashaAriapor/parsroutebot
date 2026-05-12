import { type Server, type VpnConfig } from '@prisma/client';
import { prisma } from '@/db/client';
import { xuiClient } from '@/adapters/xui';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export type VpnConfigWithServer = VpnConfig & { server: Server };

export function buildSubUrl(
  server: Pick<Server, 'subDomain' | 'subPort' | 'subPath'>,
  subId: string,
): string {
  const raw = server.subDomain.trim();

  // Detect protocol from raw value (backward-compat: DB may store full URLs)
  const protoMatch = raw.match(/^(https?):\/\//i);
  const protocol = protoMatch ? protoMatch[1].toLowerCase() : 'http';

  // Strip protocol then split host:port from any trailing path
  const withoutProto = raw.replace(/^https?:\/\//i, '');
  const hostAndPort = withoutProto.split('/')[0];
  const [hostname, embeddedPort] = hostAndPort.split(':');

  // Prefer port embedded in the domain string; fall back to server.subPort
  const port = embeddedPort ? parseInt(embeddedPort, 10) : server.subPort;

  // Normalise path
  let path = server.subPath.trim();
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.endsWith('/')) path = path + '/';

  const omitPort =
    (protocol === 'http' && port === 80) ||
    (protocol === 'https' && port === 443);
  const portPart = omitPort ? '' : `:${port}`;

  const url = `${protocol}://${hostname}${portPart}${path}${subId}`;
  logger.debug({ protocol, hostname, port, path, subId, url }, 'buildSubUrl');
  return url;
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
      // TODO: multi-server support — use server-specific XUI client when server has panelUrl set
      const t = await xuiClient.getClientTraffic(cfg.email);
      await prisma.vpnConfig.update({
        where: { id: configId },
        data: {
          uploadBytes: t.up,
          downloadBytes: t.down,
          lastSyncAt: new Date(),
        },
      });
      return { up: t.up, down: t.down, total: t.up + t.down, stale: false };
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
