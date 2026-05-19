import IORedis from 'ioredis';
import { config } from '@/lib/config';

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError() {
    return true;
  },
});

redis.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
    return;
  }
  console.error('Redis error:', err.message);
});

redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});
