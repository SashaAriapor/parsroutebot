import { config } from '@/lib/config';
import { TonClient } from './ton.client';

export const tonClient = new TonClient(config.TONAPI_KEY);
export * from './ton.interface';
