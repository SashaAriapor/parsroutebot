import { Queue, Worker } from 'bullmq';
import { prisma } from '@/db/client';
import { logger } from '@/lib/logger';
import { redisConnection } from './index';
import { safeSendMessage, sleep } from './shared';

const QUEUE_NAME = 'usage-notifier';
const INTERVAL_MS = 60 * 60 * 1000;

export const usageNotifierQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startUsageNotifierWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      let notified80 = 0;
      let notified95 = 0;

      const configs = await prisma.vpnConfig.findMany({
        where: { status: 'ACTIVE', totalGB: { gt: 0 } },
        include: { server: { select: { name: true } } },
      });

      for (const cfg of configs) {
        const usedBytes = cfg.uploadBytes + cfg.downloadBytes;
        const totalBytes = BigInt(cfg.totalGB) * 1024n ** 3n;
        if (totalBytes === 0n) continue;

        const ratio = Number(usedBytes) / Number(totalBytes);

        if (ratio >= 0.95 && !cfg.notified95Pct) {
          const remainingGB = Math.max(0, cfg.totalGB - Number(usedBytes) / 1024 ** 3);
          const sent = await safeSendMessage(
            cfg.userId,
            `🚨 <b>حجم سرویس تموم شدنیه</b>\n\n` +
            `🛡️ سرویس #${cfg.id} (${cfg.server.name})\n` +
            `📦 <b>${Math.round(ratio * 100)}٪</b> حجم مصرف شده — حدود ${remainingGB.toFixed(1)} گیگ باقی مونده.\n\n` +
            `از «🛡️ سرویس‌های من» می‌تونی حجم اضافه کنی.`,
            { parse_mode: 'HTML' },
          );
          if (sent) {
            await prisma.vpnConfig.update({
              where: { id: cfg.id },
              data: { notified95Pct: true, notified80Pct: true },
            });
            notified95++;
          }
        } else if (ratio >= 0.80 && !cfg.notified80Pct) {
          const sent = await safeSendMessage(
            cfg.userId,
            `⚠️ <b>هشدار مصرف حجم</b>\n\n` +
            `🛡️ سرویس #${cfg.id} (${cfg.server.name})\n` +
            `📦 <b>${Math.round(ratio * 100)}٪</b> حجم سرویست مصرف شده.\n\n` +
            `اگه نیاز داری، از «🛡️ سرویس‌های من» حجم اضافه کن.`,
            { parse_mode: 'HTML' },
          );
          if (sent) {
            await prisma.vpnConfig.update({
              where: { id: cfg.id },
              data: { notified80Pct: true },
            });
            notified80++;
          }
        }

        await sleep(50);
      }

      logger.info({ notified80, notified95, totalChecked: configs.length }, 'usage-notifier cycle');
      return { notified80, notified95 };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, 'usage-notifier job failed');
  });

  return worker;
}

export async function scheduleUsageNotifier() {
  await usageNotifierQueue.upsertJobScheduler(
    'usage-notifier-repeat',
    { every: INTERVAL_MS },
    { name: 'notify', data: {}, opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 } } },
  );
  logger.info({ intervalMs: INTERVAL_MS }, 'usage-notifier scheduled');
}
