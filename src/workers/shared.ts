import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export const TZ = 'Asia/Tehran';

export async function getBot() {
  const { bot } = await import('@/bot');
  return bot;
}

export async function safeSendMessage(
  userId: bigint,
  text: string,
  options?: Parameters<Awaited<ReturnType<typeof getBot>>['api']['sendMessage']>[2],
): Promise<boolean> {
  const bot = await getBot();
  try {
    await bot.api.sendMessage(Number(userId), text, options as any);
    return true;
  } catch (err: any) {
    if (err?.error_code === 403 || err?.error_code === 400) return false;
    logger.warn({ err: err.message, userId: userId.toString() }, 'safeSendMessage failed');
    return false;
  }
}

export async function logChannel(text: string): Promise<void> {
  const bot = await getBot();
  try {
    await bot.api.sendMessage(config.LOG_CHANNEL_ID, text, { parse_mode: 'HTML' });
  } catch (err: any) {
    logger.warn({ err: err.message }, 'logChannel failed');
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
