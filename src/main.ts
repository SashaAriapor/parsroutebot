import 'dotenv/config';
// Config validation runs on import — process exits immediately if env is invalid.
import { config } from './lib/config';
import { logger } from './lib/logger';
import { createBot } from './bot/index';
import { prisma } from './db/client';

async function main() {
  logger.info({ env: config.NODE_ENV }, 'Starting bot');

  const bot = createBot();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    await bot.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, 'Bot is running');
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
