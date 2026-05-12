import axios from 'axios';
import { logger } from '@/lib/logger';
import type { IFxClient } from './fx.interface';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd';
// Nobitex: works from Iranian IPs; lastTradePrice is in Toman (IRT)
const NOBITEX_URL = 'https://api.nobitex.ir/v3/orderbook/USDTIRT';
// Wallex: globally accessible; depth ask[0].price is in Toman (TMN)
const WALLEX_URL = 'https://api.wallex.ir/v1/depth?symbol=USDTTMN';

export class FxClient implements IFxClient {
  private cache: { tonToman: number; fetchedAt: Date } | null = null;
  private readonly CACHE_TTL_MS = 60_000;

  async getTonToIrr(): Promise<{ rate: number; fetchedAt: Date }> {
    if (this.cache && Date.now() - this.cache.fetchedAt.getTime() < this.CACHE_TTL_MS) {
      return { rate: this.cache.tonToman, fetchedAt: this.cache.fetchedAt };
    }

    try {
      const tonUsd = await fetchTonUsd();
      const usdtToman = await fetchUsdtToman();
      const tonToman = tonUsd * usdtToman;

      this.cache = { tonToman, fetchedAt: new Date() };
      logger.debug({ tonUsd, usdtToman, tonToman }, 'FX rate updated');

      return { rate: tonToman, fetchedAt: this.cache.fetchedAt };
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to fetch FX rates');

      if (this.cache) {
        logger.warn('Using stale FX cache as fallback');
        return { rate: this.cache.tonToman, fetchedAt: this.cache.fetchedAt };
      }

      throw new Error('FX rate unavailable and no cache');
    }
  }

  async forceRefresh(): Promise<{ rate: number; fetchedAt: Date }> {
    this.cache = null;
    return this.getTonToIrr();
  }
}

async function fetchTonUsd(): Promise<number> {
  const res = await axios.get(COINGECKO_URL, { timeout: 10_000 });
  const rate = Number(res.data?.['the-open-network']?.usd);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid TON/USD rate from CoinGecko');
  return rate;
}

async function fetchUsdtToman(): Promise<number> {
  // Try Nobitex first (accurate from within Iran)
  try {
    const res = await axios.get(NOBITEX_URL, { timeout: 8_000 });
    // lastTradePrice is in Toman (IRT pair)
    const rate = Number(res.data?.lastTradePrice);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch (err: any) {
    logger.debug({ err: err.message }, 'Nobitex unavailable, trying Wallex');
  }

  // Fallback: Wallex (globally accessible; ask[0].price is in Toman)
  const res = await axios.get(WALLEX_URL, { timeout: 8_000 });
  const rate = Number(res.data?.result?.ask?.[0]?.price);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid USDT/TMN rate from Wallex');
  return rate;
}
