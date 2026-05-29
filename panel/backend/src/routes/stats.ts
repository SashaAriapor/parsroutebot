import { Hono } from 'hono';
import { prisma } from '../prisma';
import { serialize } from '../utils';

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

function startOfDay(d = new Date()) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export const statsRouter = new Hono();

statsRouter.get('/overview', async (c) => {
  const today = startOfDay();
  const monthStart = startOfMonth();

  const [
    totalUsers,
    activeServices,
    revToday,
    revMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.vpnConfig.count({ where: { status: 'ACTIVE' } }),
    prisma.order.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: today } },
      _sum: { priceToman: true },
    }),
    prisma.order.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: monthStart } },
      _sum: { priceToman: true },
    }),
  ]);

  return c.json(serialize({
    totalUsers,
    activeServices,
    revenueToday: revToday._sum.priceToman ?? 0n,
    revenueMonth: revMonth._sum.priceToman ?? 0n,
  }));
});

statsRouter.get('/chart', async (c) => {
  type RawRow = { date: Date; revenue: bigint };

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      DATE_TRUNC('day', "completedAt") AS date,
      COALESCE(SUM("priceToman"), 0) AS revenue
    FROM "Order"
    WHERE status = 'COMPLETED'
      AND "completedAt" >= ${daysAgo(30)}
    GROUP BY DATE_TRUNC('day', "completedAt")
    ORDER BY date ASC
  `;

  return c.json(rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    revenue: r.revenue.toString(),
  })));
});

statsRouter.get('/top-users', async (c) => {
  const users = await prisma.user.findMany({
    where: { totalPurchases: { gt: 0 } },
    orderBy: { totalSpent: 'desc' },
    take: 20,
    select: {
      id: true,
      username: true,
      firstName: true,
      totalSpent: true,
      totalPurchases: true,
    },
  });

  return c.json(serialize(users));
});
