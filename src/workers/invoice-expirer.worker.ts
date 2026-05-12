import { Queue, Worker } from 'bullmq';
import { prisma } from '@/db/client';
import { logger } from '@/lib/logger';
import { redisConnection } from './index';
import { safeSendMessage, sleep } from './shared';

const QUEUE_NAME = 'invoice-expirer';
const INTERVAL_MS = 5 * 60 * 1000;

export const invoiceExpirerQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startInvoiceExpirerWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const now = new Date();

      const expired = await prisma.order.findMany({
        where: { status: 'PENDING', rateValidUntil: { lt: now } },
        select: { id: true, userId: true },
      });

      if (expired.length === 0) return { expired: 0 };

      await prisma.order.updateMany({
        where: { id: { in: expired.map((o) => o.id) } },
        data: { status: 'EXPIRED' },
      });

      for (const o of expired) {
        await safeSendMessage(
          o.userId,
          `⌛️ مهلت پرداخت سفارش تمام شد\n\n` +
          `سفارشی که ساخته بودی منقضی شد. اگه پولی فرستادی، به ولتت اضافه میشه.\n\n` +
          `می‌تونی دوباره سفارش جدید بدی.`,
        );
        await sleep(50);
      }

      logger.info({ expired: expired.length }, 'invoice-expirer cycle');
      return { expired: expired.length };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, 'invoice-expirer job failed');
  });

  return worker;
}

export async function scheduleInvoiceExpirer() {
  await invoiceExpirerQueue.upsertJobScheduler(
    'invoice-expirer-repeat',
    { every: INTERVAL_MS },
    { name: 'expire', data: {}, opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 } } },
  );
  logger.info({ intervalMs: INTERVAL_MS }, 'invoice-expirer scheduled');
}
