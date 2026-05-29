import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { serialize } from '../utils';

export const usersRouter = new Hono();

usersRouter.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
  const search = c.req.query('search')?.trim() ?? '';
  const skip = (page - 1) * limit;

  let where: Prisma.UserWhereInput = {};
  if (search) {
    if (/^\d+$/.test(search)) {
      try {
        where = { id: BigInt(search) };
      } catch {
        where = {};
      }
    } else if (search.startsWith('@')) {
      where = { username: { equals: search.slice(1), mode: 'insensitive' } };
    } else {
      where = { firstName: { contains: search, mode: 'insensitive' } };
    }
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return c.json({ data: serialize(users), total, page, limit });
});

usersRouter.get('/:id', async (c) => {
  const id = BigInt(c.req.param('id'));

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      configs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          email: true,
          status: true,
          totalGB: true,
          expiryAt: true,
          createdAt: true,
        },
      },
      walletTxs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          amountToman: true,
          balanceAfter: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(serialize(user));
});

usersRouter.patch('/:id', async (c) => {
  const id = BigInt(c.req.param('id'));
  const body = await c.req.json<{
    isBanned?: boolean;
    walletDelta?: string;
    walletOp?: 'add' | 'deduct';
  }>();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ error: 'User not found' }, 404);

  const updates: Parameters<typeof prisma.user.update>[0]['data'] = {};

  if (typeof body.isBanned === 'boolean') {
    updates.isBanned = body.isBanned;
  }

  if (body.walletDelta) {
    const delta = BigInt(body.walletDelta);
    const op = body.walletOp ?? 'add';
    const newBalance = op === 'add'
      ? user.walletBalance + delta
      : user.walletBalance - delta;
    if (newBalance < 0n) return c.json({ error: 'Insufficient balance' }, 400);
    updates.walletBalance = newBalance;
  }

  const updated = await prisma.user.update({ where: { id }, data: updates });
  return c.json(serialize(updated));
});

usersRouter.delete('/:id', async (c) => {
  const id = BigInt(c.req.param('id'));
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ error: 'User not found' }, 404);

  await prisma.user.delete({ where: { id } });
  return c.json({ ok: true });
});
