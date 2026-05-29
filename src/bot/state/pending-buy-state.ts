export type BuyState = {
  categoryId?: number;
  categoryServerName?: string;
  trafficGB?: number;
  durationDays?: number;
  pricePerGB?: bigint;
  basePriceToman?: bigint;
  serverId?: number;
  discountCode?: string;
  discountPercent?: number;
  discountAmount?: bigint;
  finalPriceToman?: bigint;
  awaitingGBInput?: boolean;
  awaitingDiscountInput?: boolean;
  startedAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const store = new Map<number, BuyState>();

export function getBuyState(userId: number): BuyState | null {
  const s = store.get(userId);
  if (!s) return null;
  if (Date.now() - s.startedAt > TTL_MS) {
    store.delete(userId);
    return null;
  }
  return s;
}

export function setBuyState(userId: number, partial: Partial<Omit<BuyState, 'startedAt'>>): void {
  const existing = store.get(userId);
  store.set(userId, {
    startedAt: existing?.startedAt ?? Date.now(),
    ...existing,
    ...partial,
  });
}

export function clearBuyState(userId: number): void {
  store.delete(userId);
}
