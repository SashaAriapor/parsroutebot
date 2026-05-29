import { Hono } from 'hono';
import { prisma } from '../prisma';

const SETTINGS_KEYS = [
  'card_number',
  'card_owner',
  'card_channel_id',
  'card_fee_percent',
  'card_approver_ids',
  'price_per_gb',
  'welcome_text',
  'required_channel_id',
  'required_channel_username',
  'PRICE_PER_GB_TOMAN',
  'SERVICE_DURATION_DAYS',
  'QUICK_PICK_GB',
] as const;

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...SETTINGS_KEYS] } },
  });

  const result: Record<string, string> = {};
  for (const key of SETTINGS_KEYS) {
    result[key] = rows.find((r) => r.key === key)?.value ?? '';
  }

  return c.json(result);
});

settingsRouter.patch('/', async (c) => {
  const body = await c.req.json<Partial<Record<(typeof SETTINGS_KEYS)[number], string>>>();

  const updates = Object.entries(body).filter(
    ([k]) => (SETTINGS_KEYS as readonly string[]).includes(k),
  ) as [string, string][];

  const errors: string[] = [];
  for (const [key, value] of updates) {
    if (key === 'PRICE_PER_GB_TOMAN') {
      const n = parseInt(value, 10);
      if (!/^\d+$/.test(value.trim()) || isNaN(n) || n <= 0)
        errors.push('PRICE_PER_GB_TOMAN must be a positive integer');
    }
    if (key === 'SERVICE_DURATION_DAYS') {
      const n = parseInt(value, 10);
      if (!/^\d+$/.test(value.trim()) || isNaN(n) || n <= 0)
        errors.push('SERVICE_DURATION_DAYS must be a positive integer');
    }
    if (key === 'QUICK_PICK_GB') {
      const raw = value.split(',').map((s) => s.trim()).filter((s) => s !== '');
      const valid = raw.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n > 0);
      if (valid.length !== raw.length || valid.length < 1 || valid.length > 4)
        errors.push('QUICK_PICK_GB must have 1–4 comma-separated positive integers');
    }
  }

  if (errors.length > 0) return c.json({ ok: false, errors }, 400);

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );

  return c.json({ ok: true, updated: updates.map(([k]) => k) });
});
