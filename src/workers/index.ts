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
  const [
    { schedulePaymentPolling },
    { startBroadcastWorker },
    { startTrafficSyncWorker, scheduleTrafficSync },
    { startExpiryNotifierWorker, scheduleExpiryNotifier },
    { startUsageNotifierWorker, scheduleUsageNotifier },
    { startInvoiceExpirerWorker, scheduleInvoiceExpirer },
    { startDailySummaryWorker, scheduleDailySummary },
  ] = await Promise.all([
    import('./payment-poller.worker'),
    import('./broadcast.worker'),
    import('./traffic-sync.worker'),
    import('./expiry-notifier.worker'),
    import('./usage-notifier.worker'),
    import('./invoice-expirer.worker'),
    import('./daily-summary.worker'),
  ]);

  const workers = [
    startBroadcastWorker(),
    startTrafficSyncWorker(),
    startExpiryNotifierWorker(),
    startUsageNotifierWorker(),
    startInvoiceExpirerWorker(),
    startDailySummaryWorker(),
  ];

  await schedulePaymentPolling();
  await Promise.all([
    scheduleTrafficSync(),
    scheduleExpiryNotifier(),
    scheduleUsageNotifier(),
    scheduleInvoiceExpirer(),
    scheduleDailySummary(),
  ]);

  logger.info({ count: workers.length + 1 }, 'All workers started + scheduled');

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
