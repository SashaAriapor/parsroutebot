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
    pricePerGb: string | number;
    serverId: string;
    serverName: string;
    uuidPrefix?: string;
    hwidLimit?: number;
    userChoosesGb?: boolean;
    volumes?: string;
    unlimitedPrice?: string | number;
    isActive?: boolean;
  }>();

  if (!body.nameFa?.trim()) return c.json({ ok: false, error: 'nameFa is required' }, 400);
  if (!body.serverId?.trim()) return c.json({ ok: false, error: 'serverId is required' }, 400);
  if (!body.serverName?.trim()) return c.json({ ok: false, error: 'serverName is required' }, 400);

  const isTunnel = body.userChoosesGb !== false;
  const pricePerGb = parseInt(String(body.pricePerGb ?? '0'), 10);
  if (isTunnel && (isNaN(pricePerGb) || pricePerGb <= 0))
    return c.json({ ok: false, error: 'pricePerGb must be a positive integer for Tunnel type' }, 400);

  const unlimitedPrice = body.unlimitedPrice !== undefined
    ? parseInt(String(body.unlimitedPrice), 10)
    : 0;

  let volumesStr = '';
  if (body.volumes !== undefined) {
    if (Array.isArray(body.volumes)) {
      volumesStr = JSON.stringify(body.volumes);
    } else {
      volumesStr = String(body.volumes).trim();
    }
  }

  const category = await prisma.serviceCategory.create({
    data: {
      nameFa: body.nameFa.trim(),
      pricePerGb: BigInt(isNaN(pricePerGb) ? 0 : pricePerGb),
      serverId: body.serverId.trim(),
      serverName: body.serverName.trim(),
      uuidPrefix: body.uuidPrefix?.trim() ?? '1',
      hwidLimit: body.hwidLimit ?? 0,
      userChoosesGb: body.userChoosesGb ?? true,
      volumes: volumesStr,
      unlimitedPrice: BigInt(isNaN(unlimitedPrice) ? 0 : unlimitedPrice),
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
    pricePerGb?: string | number;
    serverId?: string;
    serverName?: string;
    uuidPrefix?: string;
    hwidLimit?: number;
    userChoosesGb?: boolean;
    volumes?: string;
    unlimitedPrice?: string | number;
    isActive?: boolean;
  }>();

  const data: Record<string, unknown> = {};

  if (body.nameFa !== undefined) data.nameFa = body.nameFa.trim();
  if (body.serverId !== undefined) data.serverId = body.serverId.trim();
  if (body.serverName !== undefined) data.serverName = body.serverName.trim();
  if (body.uuidPrefix !== undefined) data.uuidPrefix = body.uuidPrefix.trim();
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.hwidLimit !== undefined) data.hwidLimit = Number(body.hwidLimit);
  if (body.userChoosesGb !== undefined) data.userChoosesGb = Boolean(body.userChoosesGb);

  if (body.pricePerGb !== undefined) {
    const pricePerGb = parseInt(String(body.pricePerGb), 10);
    const patchIsTunnel = body.userChoosesGb !== false;
    if (patchIsTunnel && (isNaN(pricePerGb) || pricePerGb <= 0))
      return c.json({ ok: false, error: 'pricePerGb must be a positive integer for Tunnel type' }, 400);
    data.pricePerGb = BigInt(isNaN(pricePerGb) ? 0 : pricePerGb);
  }

  if (body.unlimitedPrice !== undefined) {
    const unlimitedPrice = parseInt(String(body.unlimitedPrice), 10);
    data.unlimitedPrice = BigInt(isNaN(unlimitedPrice) ? 0 : Math.max(0, unlimitedPrice));
  }

  if (body.volumes !== undefined) {
    if (Array.isArray(body.volumes)) {
      data.volumes = JSON.stringify(body.volumes);
    } else {
      data.volumes = String(body.volumes).trim();
    }
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
