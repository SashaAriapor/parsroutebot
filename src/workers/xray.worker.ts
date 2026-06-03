import { spawn, ChildProcess } from 'child_process';
import { writeFileSync } from 'fs';
import { generateXrayConfig } from '@/utils/xray-config';
import { prisma } from '@/db/client';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import { resetProxyAgent } from '@/lib/proxy';

const XRAY_BIN = '/usr/local/bin/xray';
const XRAY_CONFIG_PATH = '/tmp/xray-config.json';
const READY_WAIT_MS = 1500;
const MAX_CRASHES = 3;
const STABLE_MS = 30_000;

let xrayProcess: ChildProcess | null = null;
let currentLink: string | null = null;
let crashCount = 0;
let stableTimer: ReturnType<typeof setTimeout> | null = null;

interface OriginalProxy {
  host: string | undefined;
  port: number | undefined;
  user: string | undefined;
  pass: string | undefined;
}

let originalProxy: OriginalProxy | null = null;

export function setOriginalProxy(proxy: OriginalProxy): void {
  originalProxy = proxy;
}

function restoreOriginalProxy(): void {
  const cfg = config as Record<string, unknown>;
  cfg['SOCKS5_HOST'] = originalProxy?.host;
  cfg['SOCKS5_PORT'] = originalProxy?.port;
  cfg['SOCKS5_USER'] = originalProxy?.user;
  cfg['SOCKS5_PASS'] = originalProxy?.pass;
  resetProxyAgent();

  if (originalProxy?.host) {
    logger.info({ host: originalProxy.host, port: originalProxy.port }, 'Restored original SOCKS5 proxy');
  } else {
    logger.info('No original proxy configured, running without proxy');
  }
}

async function startXray(link: string): Promise<void> {
  if (xrayProcess) {
    xrayProcess.removeAllListeners('exit');
    xrayProcess.kill();
    xrayProcess = null;
  }

  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimer = null;
  }

  currentLink = link;

  const xrayConfig = generateXrayConfig(link);
  writeFileSync(XRAY_CONFIG_PATH, JSON.stringify(xrayConfig));

  xrayProcess = spawn(XRAY_BIN, ['run', '-config', XRAY_CONFIG_PATH], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  logger.info({ pid: xrayProcess.pid, port: 10808 }, 'Xray process started');

  xrayProcess.stdout?.on('data', (d: Buffer) => {
    logger.info({ msg: d.toString().trim() }, 'Xray');
  });
  xrayProcess.stderr?.on('data', (d: Buffer) => {
    logger.warn({ msg: d.toString().trim() }, 'Xray');
  });

  xrayProcess.on('exit', (code) => {
    if (stableTimer) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }

    xrayProcess = null;
    crashCount++;

    if (crashCount >= MAX_CRASHES) {
      logger.error({ crashCount }, 'Xray crashed too many times, falling back to original SOCKS5');
      restoreOriginalProxy();
      return;
    }

    logger.warn({ code, crashCount }, 'Xray process exited, restarting in 5s…');
    setTimeout(() => {
      if (currentLink) void startXray(currentLink);
    }, 5000);
  });

  stableTimer = setTimeout(() => {
    crashCount = 0;
    stableTimer = null;
    logger.debug('Xray stable for 30s, resetting crash count');
  }, STABLE_MS);

  await new Promise<void>((resolve) => setTimeout(resolve, READY_WAIT_MS));
  logger.info({ port: 10808 }, 'Xray SOCKS5 proxy ready on 127.0.0.1:10808');
}

export async function startXrayWorker(): Promise<boolean> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'VRAY_CONFIG_LINK' } });
    const link = setting?.value;

    if (!link || link.trim() === '') {
      logger.info('VRAY_CONFIG_LINK not set, skipping Xray');
      return false;
    }

    logger.info({ link: link.substring(0, 30) + '...' }, 'Starting Xray with V2Ray config');
    await startXray(link);
    return true;
  } catch (err) {
    logger.error({ err }, 'Failed to start Xray worker');
    return false;
  }
}

export async function restartXray(): Promise<void> {
  const setting = await prisma.setting.findUnique({ where: { key: 'VRAY_CONFIG_LINK' } });
  const link = setting?.value;
  if (!link) {
    logger.info('No V2Ray config link set, cannot restart Xray');
    return;
  }
  crashCount = 0;
  await startXray(link);
  resetProxyAgent();
}

export function isXrayRunning(): boolean {
  return xrayProcess !== null;
}
