import { Hono } from 'hono';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import Redis from 'ioredis';
import { prisma } from '../prisma';
import { restartXray, isXrayRunning } from '../../../../src/workers/xray.worker';

type ServiceStatus = 'ok' | 'error';

interface CheckResult {
  status: ServiceStatus;
  latency?: number;
  note?: string;
  [key: string]: unknown;
}

async function checkProxy(): Promise<CheckResult> {
  const host = process.env.SOCKS5_HOST;
  if (!host) return { status: 'error', note: 'SOCKS5_HOST not configured' };

  const port = parseInt(process.env.SOCKS5_PORT ?? '1080', 10);
  const user = process.env.SOCKS5_USER;
  const pass = process.env.SOCKS5_PASS;
  const auth = user && pass ? `${user}:${pass}@` : '';
  const proxyUrl = `socks5h://${auth}${host}:${port}`;

  try {
    const agent = new SocksProxyAgent(proxyUrl);
    const start = Date.now();
    await axios.get('https://api.telegram.org', {
      httpsAgent: agent,
      proxy: false,
      timeout: 10_000,
      validateStatus: () => true,
    });
    return { status: 'ok', latency: Date.now() - start, ip: host, port };
  } catch (e: unknown) {
    return { status: 'error', note: e instanceof Error ? e.message : String(e), ip: host, port };
  }
}

async function checkPasarGuard(): Promise<CheckResult> {
  const url = process.env.PASARGUARD_URL;
  if (!url) return { status: 'error', note: 'PASARGUARD_URL not configured' };

  try {
    const start = Date.now();
    await axios.get(url, { timeout: 10_000, validateStatus: () => true });
    return { status: 'ok', latency: Date.now() - start, url };
  } catch (e: unknown) {
    return { status: 'error', url, note: e instanceof Error ? e.message : String(e) };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redis = new Redis(redisUrl, {
    connectTimeout: 3_000,
    maxRetriesPerRequest: 0,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const start = Date.now();
    await redis.ping();
    return { status: 'ok', latency: Date.now() - start };
  } catch (e: unknown) {
    return { status: 'error', note: e instanceof Error ? e.message : String(e) };
  } finally {
    redis.disconnect();
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latency: Date.now() - start };
  } catch (e: unknown) {
    return { status: 'error', note: e instanceof Error ? e.message : String(e) };
  }
}

async function checkTon(): Promise<CheckResult> {
  try {
    const start = Date.now();
    await axios.get('https://toncenter.com/api/v2/getMasterchainInfo', {
      timeout: 10_000,
      validateStatus: () => true,
    });
    return { status: 'ok', latency: Date.now() - start };
  } catch (e: unknown) {
    return { status: 'error', note: e instanceof Error ? e.message : String(e) };
  }
}

export const healthRouter = new Hono();

healthRouter.get('/', async (c) => {
  const [proxy, pasarguard, redis, database, ton] = await Promise.allSettled([
    checkProxy(),
    checkPasarGuard(),
    checkRedis(),
    checkDatabase(),
    checkTon(),
  ]);

  const unwrap = (r: PromiseSettledResult<CheckResult>): CheckResult =>
    r.status === 'fulfilled' ? r.value : { status: 'error', note: String(r.reason) };

  return c.json({
    proxy: unwrap(proxy),
    pasarguard: unwrap(pasarguard),
    redis: unwrap(redis),
    database: unwrap(database),
    ton: unwrap(ton),
    bot: {
      status: 'ok' as const,
      uptime: Math.round(process.uptime()),
    },
  });
});

healthRouter.post('/restart', (c) => {
  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 300);
  return c.json({ ok: true, message: 'Restarting…' });
});

healthRouter.post('/proxy/reconnect', async (c) => {
  if (isXrayRunning()) {
    try {
      await restartXray();
    } catch (e: unknown) {
      return c.json({ ok: false, note: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  const result = await checkProxy();
  return c.json({ ok: result.status === 'ok', ...result });
});
