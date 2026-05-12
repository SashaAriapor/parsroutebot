import { Queue, Worker } from 'bullmq';
import { broadcastService, type BroadcastSegment } from '@/services/broadcast.service';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { redisConnection } from './index';

type BroadcastJobData = {
  adminId: number;
  segment: BroadcastSegment;
  text: string;
};

const QUEUE_NAME = 'broadcast';
const BATCH_SIZE = 100;
// Telegram allows ~30 msg/sec globally; pace at 25/sec to stay safe
const DELAY_PER_MESSAGE_MS = 40;

export const broadcastQueue = new Queue<BroadcastJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 50, removeOnFail: 20 },
});

export function startBroadcastWorker() {
  const worker = new Worker<BroadcastJobData>(
    QUEUE_NAME,
    async (job) => {
      const { bot } = await import('@/bot');
      const { adminId, segment, text } = job.data;

      let sent = 0;
      let failed = 0;
      let cursor: bigint | undefined = undefined;
      const total = await broadcastService.countSegment(segment);
      const startedAt = Date.now();

      await bot.api.sendMessage(
        config.LOG_CHANNEL_ID,
        `📢 شروع ارسال پیام همگانی\n\n👥 گروه: ${segment}\n📊 تعداد: ${total}\n👤 توسط: ${adminId}`,
      );

      while (true) {
        const batch = await broadcastService.findRecipients(segment, BATCH_SIZE, cursor);
        if (batch.length === 0) break;

        for (const u of batch) {
          try {
            await bot.api.sendMessage(Number(u.id), text, { parse_mode: 'Markdown' });
            sent++;
          } catch (err: any) {
            failed++;
            logger.debug({ userId: u.id.toString(), err: err.message }, 'Broadcast send failed');
          }

          if ((sent + failed) % 50 === 0) {
            await job.updateProgress({ sent, failed, total });
          }

          await sleep(DELAY_PER_MESSAGE_MS);
        }

        cursor = batch[batch.length - 1].id;
      }

      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

      await bot.api.sendMessage(
        config.LOG_CHANNEL_ID,
        `✅ ارسال پیام همگانی تمام شد\n\n` +
        `✓ موفق: ${sent}\n` +
        `✗ ناموفق: ${failed}\n` +
        `⏱ زمان: ${elapsedSec} ثانیه\n` +
        `👤 توسط: ${adminId}`,
      );

      try {
        await bot.api.sendMessage(
          adminId,
          `✅ پیام همگانی ارسال شد\n\nموفق: ${sent}\nناموفق: ${failed}\nزمان: ${elapsedSec} ثانیه`,
        );
      } catch {}

      return { sent, failed, total };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, 'Broadcast worker job failed');
  });

  return worker;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
