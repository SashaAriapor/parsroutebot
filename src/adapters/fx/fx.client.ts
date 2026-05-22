import axios from 'axios';
import { logger } from '@/lib/logger';
import type { IFxClient } from './fx.interface';

const CACHE_TTL_MS = 5 * 60 * 1_000;
const RAMZINEX_URL =
  'https://publicapi.ramzinex.com/exchange/api/v1.0/exchange/chart/statistics-24';

export class FxClient implements IFxClient {
  private cache: { rate: number; fetchedAt: Date } | null = null;

  async getTonToIrr(): Promise<{ rate: number; fetchedAt: Date }> {
    if (this.cache && Date.now() - this.cache.fetchedAt.getTime() < CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const res = await axios.get(RAMZINEX_URL, { timeout: 10_000 });

      const rlsPrice = res.data?.data?.['272']?.close;
      if (!rlsPrice || rlsPrice <= 0) throw new Error('Invalid Ramzinex response');

      const rate = Math.round(rlsPrice / 10);
      this.cache = { rate, fetchedAt: new Date() };
      logger.info({ rate, rlsPrice }, 'FX rate fetched from Ramzinex (pair 272 TON/IRR)');
      return this.cache;
    } catch (err) {
      logger.warn({ err }, 'Ramzinex FX fetch failed');
    }

    if (this.cache) {
      logger.warn({ rate: this.cache.rate }, 'Using stale FX cache');
      return this.cache;
    }

    throw new Error('FX rate unavailable and no cache');
  }

  async forceRefresh(): Promise<{ rate: number; fetchedAt: Date }> {
    this.cache = null;
    return this.getTonToIrr();
  }
}
