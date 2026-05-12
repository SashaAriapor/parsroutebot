import { Queue, Worker } from 'bullmq';
import { prisma } from '@/db/client';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { formatToman } from '@/lib/format';
import { redisConnection } from './index';
import { getBot, TZ } from './shared';

const QUEUE_NAME = 'daily-summary';
// 00:05 Tehran time — Iran is UTC+3:30 and does not observe DST
const CRON = '5 0 * * *';

export const dailySummaryQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startDailySummaryWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const { start: yesterdayStart, end: yesterdayEnd, label } = getYesterdayRange();

      const [
        newUsers,
        completedOrders,
        revenue,
        topupTon,
        newConfigs,
        ordersByMethod,
      ] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: yesterdayEnd } } }),
        prisma.order.count({
          where: { status: 'COMPLETED', completedAt: { gte: yesterdayStart, lt: yesterdayEnd } },
        }),
        prisma.order.aggregate({
          where: { status: 'COMPLETED', completedAt: { gte: yesterdayStart, lt: yesterdayEnd } },
          _sum: { priceToman: true },
        }),
        prisma.walletTransaction.aggregate({
          where: { type: 'TOPUP_TON', createdAt: { gte: yesterdayStart, lt: yesterdayEnd } },
          _sum: { amountToman: true },
        }),
        prisma.vpnConfig.count({ where: { createdAt: { gte: yesterdayStart, lt: yesterdayEnd } } }),
        prisma.order.groupBy({
          by: ['paymentMethod'],
          where: { status: 'COMPLETED', completedAt: { gte: yesterdayStart, lt: yesterdayEnd } },
          _count: true,
        }),
      ]);

      const revenueToman = revenue._sum.priceToman ?? 0n;
      const topupToman = topupTon._sum.amountToman ?? 0n;
      const walletCount = ordersByMethod.find((o) => o.paymentMethod === 'WALLET')?._count ?? 0;
      const tonCount = ordersByMethod.find((o) => o.paymentMethod === 'TON')?._count ?? 0;

      const text =
        `📊 <b>گزارش روزانه — ${label}</b>\n\n` +
        `👥 کاربر جدید: <b>${newUsers}</b>\n` +
        `🛒 سفارش تکمیل‌شده: <b>${completedOrders}</b>\n` +
        `🛡️ سرویس جدید: <b>${newConfigs}</b>\n\n` +
        `💰 درآمد: <b>${formatToman(revenueToman)}</b>\n` +
        `   • از کیف پول: ${walletCount} سفارش\n` +
        `   • از TON: ${tonCount} سفارش\n\n` +
        `🪙 شارژ ولت با TON: <b>${formatToman(topupToman)}</b>\n\n` +
        `───────────────`;

      const bot = await getBot();

      try {
        const msg = await bot.api.sendMessage(config.LOG_CHANNEL_ID, text, { parse_mode: 'HTML' });
        try {
          await bot.api.pinChatMessage(config.LOG_CHANNEL_ID, msg.message_id, {
            disable_notification: true,
          });
        } catch (err: any) {
          logger.debug({ err: err.message }, 'Failed to pin daily summary (no pin permission)');
        }
      } catch (err: any) {
        logger.error({ err: err.message }, 'Failed to post daily summary');
      }

      logger.info(
        { newUsers, completedOrders, revenueToman: revenueToman.toString() },
        'daily-summary posted',
      );
      return { newUsers, completedOrders, revenueToman: revenueToman.toString() };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, 'daily-summary job failed');
  });

  return worker;
}

export async function scheduleDailySummary() {
  await dailySummaryQueue.upsertJobScheduler(
    'daily-summary-repeat',
    { pattern: CRON, tz: TZ },
    { name: 'daily', data: {}, opts: { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } } },
  );
  logger.info({ cron: CRON, tz: TZ }, 'daily-summary scheduled');
}

function getYesterdayRange(): { start: Date; end: Date; label: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(Date.now() - 24 * 3600 * 1000));
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;

  // Tehran is UTC+3:30
  const start = new Date(`${y}-${m}-${d}T00:00:00+03:30`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);

  const label = new Intl.DateTimeFormat('fa-IR', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(start);

  return { start, end, label };
}
