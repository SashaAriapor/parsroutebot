import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { serialize } from '../utils';

export const servicesRouter = new Hono();

servicesRouter.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
  const filter = c.req.query('filter') ?? 'all';
  const skip = (page - 1) * limit;

  let where: Prisma.VpnConfigWhereInput = {};
  if (filter === 'active') where = { status: 'ACTIVE' };
  else if (filter === 'expired') where = { status: 'EXPIRED' };
  else if (filter === 'disabled') where = { status: 'DISABLED' };

  const [services, total] = await Promise.all([
    prisma.vpnConfig.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, firstName: true } },
        server: { select: { id: true, name: true, flag: true } },
      },
    }),
    prisma.vpnConfig.count({ where }),
  ]);

  return c.json({ data: serialize(services), total, page, limit });
});

servicesRouter.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);

  const service = await prisma.vpnConfig.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, firstName: true } },
      server: { select: { id: true, name: true, flag: true } },
      order: { select: { id: true, priceToman: true, paymentMethod: true, createdAt: true } },
    },
  });

  if (!service) return c.json({ error: 'Service not found' }, 404);
  return c.json(serialize(service));
});

servicesRouter.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{ extendDays?: number; status?: string }>();

  const service = await prisma.vpnConfig.findUnique({ where: { id } });
  if (!service) return c.json({ error: 'Service not found' }, 404);

  const updates: Parameters<typeof prisma.vpnConfig.update>[0]['data'] = {};

  if (body.extendDays && body.extendDays > 0) {
    const base = service.expiryAt && service.expiryAt > new Date()
      ? service.expiryAt
      : new Date();
    updates.expiryAt = new Date(base.getTime() + body.extendDays * 24 * 3600 * 1000);
  }

  if (body.status === 'DISABLED' || body.status === 'ACTIVE') {
    updates.status = body.status;
  }

  const updated = await prisma.vpnConfig.update({ where: { id }, data: updates });
  return c.json(serialize(updated));
});

servicesRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const service = await prisma.vpnConfig.findUnique({ where: { id } });
  if (!service) return c.json({ error: 'Service not found' }, 404);

  await prisma.vpnConfig.delete({ where: { id } });
  return c.json({ ok: true });
});
