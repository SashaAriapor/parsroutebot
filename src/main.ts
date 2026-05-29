import 'dotenv/config';
// Config validation runs on import — process exits immediately if env is invalid.
import { config } from './lib/config';
import { logger } from './lib/logger';
import { createBot } from './bot/index';
import { prisma } from './db/client';
import { startAllWorkers } from './workers/index';
import { startProxyHealthWorker } from './workers/proxy-health.worker';
import { startPanel } from '../panel/backend/src/index';

async function main() {
  logger.info({ env: config.NODE_ENV }, 'Starting bot');

  const bot = createBot();
  startProxyHealthWorker();
  await startAllWorkers();

  if (config.PANEL_PORT && config.PANEL_JWT_SECRET && config.PANEL_ADMIN_PASSWORD) {
    startPanel({
      port: config.PANEL_PORT,
      jwtSecret: config.PANEL_JWT_SECRET,
      adminUsername: config.PANEL_ADMIN_USERNAME,
      adminPassword: config.PANEL_ADMIN_PASSWORD,
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
