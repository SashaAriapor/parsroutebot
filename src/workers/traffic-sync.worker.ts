import { Queue, Worker } from 'bullmq';
import { prisma } from '@/db/client';
import { pasarguardClient } from '@/adapters/pasarguard';
import { logger } from '@/lib/logger';
import { redisConnection } from './index';
import { sleep } from './shared';

const QUEUE_NAME = 'traffic-sync';
const INTERVAL_MS = 30 * 60 * 1000;
const BATCH_SIZE = 50;
const DELAY_PER_CALL_MS = 100;

export const trafficSyncQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startTrafficSyncWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const startedAt = Date.now();
      let processed = 0;
      let failed = 0;
      let lastId: number | undefined;

      // eslint-disable-next-line no-constant-condition
      outer: while (true) {
        const ids = await prisma.vpnConfig.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          cursor: lastId !== undefined ? { id: lastId } : undefined,
          skip: lastId !== undefined ? 1 : 0,
          select: { id: true, email: true },
        });

        if (ids.length === 0) break outer;

        for (const c of ids) {
          try {
            const t = await pasarguardClient.getUserUsed(c.email);
            await prisma.vpnConfig.update({
              where: { id: c.id },
              data: {
                uploadBytes: 0n,
                downloadBytes: t.usedBytes,
                lastSyncAt: new Date(),
              },
            });
            processed++;
          } catch (err: any) {
            failed++;
            logger.debug({ err: err.message, email: c.email }, 'traffic-sync: failed for config');
          }
          await sleep(DELAY_PER_CALL_MS);
        }

        lastId = ids[ids.length - 1].id;
      }

      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      logger.info({ processed, failed, elapsedSec }, 'traffic-sync cycle complete');
      return { processed, failed, elapsedSec };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, 'traffic-sync job failed');
  });

  return worker;
}

export async function scheduleTrafficSync() {
  await trafficSyncQueue.upsertJobScheduler(
    'traffic-sync-repeat',
    { every: INTERVAL_MS },
    { name: 'sync', data: {}, opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 } } },
  );
  logger.info({ intervalMs: INTERVAL_MS }, 'traffic-sync scheduled');
}
