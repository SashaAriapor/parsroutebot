import IORedis from 'ioredis';
import { config } from '@/lib/config';

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ; safe for general use too
});
