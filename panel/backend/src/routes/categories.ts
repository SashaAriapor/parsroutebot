import { Hono } from 'hono';
import { prisma } from '../prisma';
import { pasarguardClient } from '@/adapters/pasarguard';
import { serialize } from '../utils';

export const categoriesRouter = new Hono();

categoriesRouter.get('/', async (c) => {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { id: 'asc' },
  });
  return c.json(serialize(categories));
});

categoriesRouter.get('/servers', async (c) => {
  try {
    const servers = await pasarguardClient.listServers();
    return c.json(servers);
  } catch (err) {
    return c.json({ ok: false, error: 'Failed to fetch servers from PasarGuard' }, 502);
  }
});

categoriesRouter.post('/', async (c) => {
  const body = await c.req.json<{
    nameFa: string;
    pricePerGb: string;
    serverId: string;
    serverName: string;
    isActive?: boolean;
  }>();

  if (!body.nameFa?.trim()) return c.json({ ok: false, error: 'nameFa is required' }, 400);
  if (!body.serverId?.trim()) return c.json({ ok: false, error: 'serverId is required' }, 400);
  if (!body.serverName?.trim()) return c.json({ ok: false, error: 'serverName is required' }, 400);

  const pricePerGb = parseInt(String(body.pricePerGb), 10);
  if (isNaN(pricePerGb) || pricePerGb <= 0)
    return c.json({ ok: false, error: 'pricePerGb must be a positive integer' }, 400);

  const category = await prisma.serviceCategory.create({
    data: {
      nameFa: body.nameFa.trim(),
      pricePerGb: BigInt(pricePerGb),
      serverId: body.serverId.trim(),
      serverName: body.serverName.trim(),
      isActive: body.isActive ?? true,
    },
  });

  return c.json(serialize(category), 201);
});

categoriesRouter.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ ok: false, error: 'invalid id' }, 400);

  const body = await c.req.json<{
    nameFa?: string;
    pricePerGb?: string;
    serverId?: string;
    serverName?: string;
    isActive?: boolean;
  }>();

  const data: Record<string, unknown> = {};

  if (body.nameFa !== undefined) data.nameFa = body.nameFa.trim();
  if (body.serverId !== undefined) data.serverId = body.serverId.trim();
  if (body.serverName !== undefined) data.serverName = body.serverName.trim();
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (body.pricePerGb !== undefined) {
    const pricePerGb = parseInt(String(body.pricePerGb), 10);
    if (isNaN(pricePerGb) || pricePerGb <= 0)
      return c.json({ ok: false, error: 'pricePerGb must be a positive integer' }, 400);
    data.pricePerGb = BigInt(pricePerGb);
  }

  try {
    const updated = await prisma.serviceCategory.update({ where: { id }, data });
    return c.json(serialize(updated));
  } catch {
    return c.json({ ok: false, error: 'category not found' }, 404);
  }
});

categoriesRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ ok: false, error: 'invalid id' }, 400);

  try {
    await prisma.serviceCategory.delete({ where: { id } });
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: 'category not found' }, 404);
  }
});
