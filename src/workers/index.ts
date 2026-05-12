import { config } from '../lib/config';
import { logger } from '../lib/logger';

const redisUrl = new URL(config.REDIS_URL);

// Shared Redis connection options for all BullMQ queues and workers.
export const redisConnection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
  ...(redisUrl.username ? { username: redisUrl.username } : {}),
};

logger.debug({ host: redisConnection.host, port: redisConnection.port }, 'BullMQ connection configured');

export async function startAllWorkers(): Promise<void> {
  const { schedulePaymentPolling } = await import('./payment-poller.worker');
  await schedulePaymentPolling();
  logger.info('All workers started');
}
