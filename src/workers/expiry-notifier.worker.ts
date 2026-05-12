import { Queue, Worker } from 'bullmq';
import { prisma } from '@/db/client';
import { logger } from '@/lib/logger';
import { redisConnection } from './index';
import { safeSendMessage, sleep } from './shared';

const QUEUE_NAME = 'expiry-notifier';
const INTERVAL_MS = 6 * 3600 * 1000;

export const expiryNotifierQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startExpiryNotifierWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const now = new Date();
      const in1Day = new Date(now.getTime() + 24 * 3600 * 1000);
      const in3Days = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

      let notified3d = 0;
      let notified1d = 0;

      // ── 3-day warning ──────────────────────────────────────────────────────
      const due3d = await prisma.vpnConfig.findMany({
        where: {
          status: 'ACTIVE',
          expiryAt: { gt: in1Day, lte: in3Days },
          notifiedExpiry3d: false,
        },
        include: { server: { select: { name: true } } },
      });

      for (const cfg of due3d) {
        const daysLeft = Math.ceil((cfg.expiryAt!.getTime() - now.getTime()) / (24 * 3600 * 1000));
        const sent = await safeSendMessage(
          cfg.userId,
          `⏰ <b>یادآور تمدید سرویس</b>\n\n` +
          `🛡️ سرویس #${cfg.id} (${cfg.server.name}) <b>${daysLeft} روز</b> دیگه منقضی میشه.\n\n` +
          `برای جلوگیری از قطعی، الان تمدیدش کن.\n\n` +
          `از منوی «🛡️ سرویس‌های من» اقدام کن.`,
          { parse_mode: 'HTML' },
        );
        if (sent) {
          await prisma.vpnConfig.update({
            where: { id: cfg.id },
            data: { notifiedExpiry3d: true },
          });
          notified3d++;
        }
        await sleep(50);
      }

      // ── 1-day warning ──────────────────────────────────────────────────────
      const due1d = await prisma.vpnConfig.findMany({
        where: {
          status: 'ACTIVE',
          expiryAt: { gt: now, lte: in1Day },
          notifiedExpiry1d: false,
        },
        include: { server: { select: { name: true } } },
      });

      for (const cfg of due1d) {
        const hoursLeft = Math.ceil((cfg.expiryAt!.getTime() - now.getTime()) / (3600 * 1000));
        const sent = await safeSendMessage(
          cfg.userId,
          `🚨 <b>سرویس نزدیک به انقضا</b>\n\n` +
          `🛡️ سرویس #${cfg.id} (${cfg.server.name}) فقط <b>${hoursLeft} ساعت</b> دیگه فعاله.\n\n` +
          `همین الان تمدیدش کن تا قطع نشه!`,
          { parse_mode: 'HTML' },
        );
        if (sent) {
          await prisma.vpnConfig.update({
            where: { id: cfg.id },
            data: { notifiedExpiry1d: true },
          });
          notified1d++;
        }
        await sleep(50);
      }

      // ── Mark expired configs ───────────────────────────────────────────────
      const justExpired = await prisma.vpnConfig.updateMany({
        where: { status: 'ACTIVE', expiryAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });

      logger.info({ notified3d, notified1d, justExpired: justExpired.count }, 'expiry-notifier cycle');
      return { notified3d, notified1d, justExpired: justExpired.count };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, 'expiry-notifier job failed');
  });

  return worker;
}

export async function scheduleExpiryNotifier() {
  await expiryNotifierQueue.upsertJobScheduler(
    'expiry-notifier-repeat',
    { every: INTERVAL_MS },
    { name: 'notify', data: {}, opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 } } },
  );
  logger.info({ intervalMs: INTERVAL_MS }, 'expiry-notifier scheduled');
}
