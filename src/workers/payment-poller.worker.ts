import { Queue, Worker } from 'bullmq';
import { tonPaymentService } from '@/services/ton-payment.service';
import { logger } from '@/lib/logger';
import { redisConnection } from './index';

const QUEUE_NAME = 'payment-poller';
const POLL_INTERVAL_MS = 12_000;

export async function schedulePaymentPolling(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });

  await queue.upsertJobScheduler(
    'poll-ton-payments',
    { every: POLL_INTERVAL_MS },
    { name: 'poll-ton-payments', data: {} },
  );

  new Worker(
    QUEUE_NAME,
    async () => {
      const result = await tonPaymentService.pollAndProcess();
      if (result.processed > 0) {
        logger.info(result, 'TON poll cycle');
      }
    },
    { connection: redisConnection },
  );

  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'TON payment poller scheduled');
}
