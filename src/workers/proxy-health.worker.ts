import { SocksProxyAgent } from 'socks-proxy-agent';
import axios from 'axios';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

const CHECK_INTERVAL_MS = 30_000;
const TIMEOUT_MS = 5_000;

let consecutiveFailures = 0;

function buildProxyUrl(): string {
  const { SOCKS5_HOST, SOCKS5_PORT, SOCKS5_USER, SOCKS5_PASS } = config;
  const auth = SOCKS5_USER ? `${SOCKS5_USER}:${SOCKS5_PASS}@` : '';
  return `socks5://${auth}${SOCKS5_HOST}:${SOCKS5_PORT ?? 1080}`;
}

async function checkProxy(): Promise<void> {
  const agent = new SocksProxyAgent(buildProxyUrl());
  const start = Date.now();

  try {
    await axios.get('https://api.telegram.org', {
      httpsAgent: agent,
      timeout: TIMEOUT_MS,
    });

    const elapsed = Date.now() - start;

    if (elapsed > TIMEOUT_MS) {
      consecutiveFailures++;
      logger.warn({ elapsed, consecutiveFailures }, 'Proxy too slow');
    } else {
      if (consecutiveFailures > 0) {
        logger.info({ consecutiveFailures }, 'Proxy recovered');
      }
      consecutiveFailures = 0;
    }
  } catch (err) {
    consecutiveFailures++;
    logger.warn({ err, consecutiveFailures }, 'Proxy health check failed');
  }
}

export function startProxyHealthWorker(): void {
  if (!config.SOCKS5_HOST) {
    logger.debug('No SOCKS5_HOST configured — proxy health worker disabled');
    return;
  }

  logger.info({ intervalMs: CHECK_INTERVAL_MS }, 'Proxy health worker started');
  setInterval(() => void checkProxy(), CHECK_INTERVAL_MS);
}
