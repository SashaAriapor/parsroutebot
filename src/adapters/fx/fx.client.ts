import { logger } from '@/lib/logger';
import { createHttpClient } from '@/lib/axios';
import type { IFxClient } from './fx.interface';

const directClient = createHttpClient(8_000, { direct: true });
const proxyClient = createHttpClient(10_000);

const CACHE_TTL_MS = 5 * 60 * 1_000;

export class FxClient implements IFxClient {
  private cache: { rate: number; fetchedAt: Date } | null = null;

  async getTonToIrr(): Promise<{ rate: number; fetchedAt: Date }> {
    if (this.cache && Date.now() - this.cache.fetchedAt.getTime() < CACHE_TTL_MS) {
      return this.cache;
    }

    // 1. Nobitex TON/RLS — direct, no proxy
    try {
      const rate = await fetchTonFromNobitex();
      this.cache = { rate, fetchedAt: new Date() };
      logger.info({ rate }, 'FX rate fetched from Nobitex');
      return this.cache;
    } catch (err) {
      logger.warn({ err }, 'Nobitex TON/RLS failed, trying Binance fallback');
    }

    // 2. Binance TON/USDT (proxy) × Nobitex USDT/RLS (direct)
    try {
      const rate = await fetchTonFromBinance();
      this.cache = { rate, fetchedAt: new Date() };
      logger.info({ rate, source: 'binance' }, 'FX rate fetched from Binance fallback');
      return this.cache;
    } catch (err) {
      logger.warn({ err }, 'Binance fallback FX fetch failed');
    }

    // 3. Stale cache (any age)
    if (this.cache) {
      logger.warn('Using stale FX cache');
      return this.cache;
    }

    throw new Error('FX rate unavailable and no cache');
  }

  async forceRefresh(): Promise<{ rate: number; fetchedAt: Date }> {
    this.cache = null;
    return this.getTonToIrr();
  }
}

async function fetchTonFromNobitex(): Promise<number> {
  const res = await directClient.get('https://api.nobitex.ir/market/stats', {
    params: { srcCurrency: 'ton', dstCurrency: 'rls' },
  });
  const rlsPrice = parseFloat(res.data?.stats?.['ton-rls']?.latest);
  if (!Number.isFinite(rlsPrice) || rlsPrice <= 0) {
    throw new Error(`Invalid TON/RLS from Nobitex: ${rlsPrice}`);
  }
  return rlsPrice / 10;
}

async function fetchUsdtToToman(): Promise<number> {
  const res = await directClient.get('https://api.nobitex.ir/market/stats', {
    params: { srcCurrency: 'usdt', dstCurrency: 'rls' },
  });
  const rlsPrice = parseFloat(res.data?.stats?.['usdt-rls']?.latest);
  if (!Number.isFinite(rlsPrice) || rlsPrice <= 0) {
    throw new Error(`Invalid USDT/RLS from Nobitex: ${rlsPrice}`);
  }
  return rlsPrice / 10; // Rials → Toman
}

async function fetchTonFromBinance(): Promise<number> {
  const [tonRes, usdtToman] = await Promise.all([
    proxyClient.get('https://api.binance.com/api/v3/ticker/price', {
      params: { symbol: 'TONUSDT' },
    }),
    fetchUsdtToToman(),
  ]);
  const tonUsd = parseFloat(tonRes.data?.price);
  if (!Number.isFinite(tonUsd) || tonUsd <= 0) {
    throw new Error(`Invalid TON/USDT from Binance: ${tonUsd}`);
  }
  const tonToman = tonUsd * usdtToman;
  logger.info({ tonToman, tonUsd, usdtToman }, 'FX rate calculated');
  return tonToman;
}
