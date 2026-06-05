import 'dotenv/config';
// Config validation runs on import — process exits immediately if env is invalid.
import { config } from './lib/config';
import { logger } from './lib/logger';
import { createBot } from './bot/index';
import { prisma } from './db/client';
import { startAllWorkers } from './workers/index';
import { startProxyHealthWorker } from './workers/proxy-health.worker';
import { startXrayWorker, setOriginalProxy } from './workers/xray.worker';
import { resetProxyAgent } from './lib/proxy';
import { startPanel } from '../panel/backend/src/index';
import { setUserPending } from './bot/state/pending-user-input';
import { generatePasarGuardUsername } from './adapters/pasarguard';

async function main() {
  logger.info({ env: config.NODE_ENV }, 'Starting bot');

  // 1. Capture original proxy config before Xray may override it
  setOriginalProxy({
    host: config.SOCKS5_HOST,
    port: config.SOCKS5_PORT,
    user: config.SOCKS5_USER,
    pass: config.SOCKS5_PASS,
  });

  // 2. Start Xray first so the proxy is ready before any outbound connections
  const xrayStarted = await startXrayWorker();

  // 3. If xray started, override proxy config before the proxy agent is created
  if (xrayStarted) {
    process.env.SOCKS5_HOST = '127.0.0.1';
    process.env.SOCKS5_PORT = '10808';
    process.env.SOCKS5_USER = '';
    process.env.SOCKS5_PASS = '';
    (config as Record<string, unknown>)['SOCKS5_HOST'] = '127.0.0.1';
    (config as Record<string, unknown>)['SOCKS5_PORT'] = 10808;
    (config as Record<string, unknown>)['SOCKS5_USER'] = undefined;
    (config as Record<string, unknown>)['SOCKS5_PASS'] = undefined;
    resetProxyAgent();
    logger.info('Using Xray SOCKS5 proxy on 127.0.0.1:10808');
  }

  const bot = createBot();
  startProxyHealthWorker();
  await startAllWorkers();

  if (config.PANEL_PORT && config.PANEL_JWT_SECRET && config.PANEL_ADMIN_PASSWORD) {
    startPanel({
      port: config.PANEL_PORT,
      jwtSecret: config.PANEL_JWT_SECRET,
      adminUsername: config.PANEL_ADMIN_USERNAME,
      adminPassword: config.PANEL_ADMIN_PASSWORD,
      onWinapayPaid: async (userId, orderId, generatedName) => {
        setUserPending(Number(userId), { kind: 'account-name-input', orderId, generatedName });
        await bot.api.sendMessage(
          Number(userId),
          '✅ پرداخت موفق!\n\n' +
          'یه اسم برای اکانتت انتخاب کن:\n\n' +
          '⚠️ فقط حروف انگلیسی و عدد — بدون فاصله یا کاراکتر خاص\n' +
          'مثال: john123 یا myaccount\n\n' +
          'برای اسم خودکار، فقط — بفرست',
        );
      },
    });
    logger.info({ port: config.PANEL_PORT }, 'Admin panel started');
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    await bot.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await bot.start({
    allowed_updates: [
      'message',
      'callback_query',
      'my_chat_member',
      'chat_member',
    ],
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, 'Bot is running');
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
