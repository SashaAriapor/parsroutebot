import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const MASK_MARKER = '••••';
const SENSITIVE_PATTERNS = ['TOKEN', 'PASSWORD', 'PASS', 'SECRET', 'HASH'];

function isSensitive(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((p) => upper.includes(p));
}

function parseEnvFile(content: string): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (key) entries.push({ key, value });
  }
  return entries;
}

function applyUpdates(content: string, updates: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^([ \\t]*${key}[ \\t]*)=(.*)$`, 'm');
    if (regex.test(result)) {
      result = result.replace(regex, `$1=${value}`);
    } else {
      result = result.trimEnd() + `\n${key}=${value}\n`;
    }
  }
  return result;
}

export const envRouter = new Hono();

envRouter.get('/', (c) => {
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const raw = parseEnvFile(content);
    const entries = raw.map(({ key, value }) => {
      const masked = isSensitive(key);
      return {
        key,
        value: masked && value.length > 6 ? value.slice(0, 6) + MASK_MARKER : value,
        masked,
      };
    });
    return c.json({ entries });
  } catch {
    return c.json({ error: 'Cannot read .env file' }, 500);
  }
});

envRouter.patch('/', async (c) => {
  const body = await c.req.json<{ updates: Record<string, string> }>().catch(() => null);
  if (!body?.updates || typeof body.updates !== 'object') {
    return c.json({ ok: false, error: 'Invalid request body' }, 400);
  }

  // Skip masked values — user didn't actually change those fields
  const filtered = Object.fromEntries(
    Object.entries(body.updates).filter(([, v]) => !String(v).includes(MASK_MARKER)),
  );

  if (Object.keys(filtered).length === 0) {
    return c.json({ ok: true, updated: 0, restarting: false });
  }

  try {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const updated = applyUpdates(content, filtered);
    fs.writeFileSync(ENV_PATH, updated, 'utf-8');
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);
    return c.json({ ok: true, updated: Object.keys(filtered).length, restarting: true });
  } catch {
    return c.json({ ok: false, error: 'Cannot update .env file' }, 500);
  }
});
