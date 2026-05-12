const TOPUP_TTL_MS = 10 * 60 * 1000;

export type TopupState = {
  awaitingCustomAmount: boolean;
  startedAt: number;
};

const store = new Map<number, TopupState>();

export function getTopupState(userId: number): TopupState | null {
  const s = store.get(userId);
  if (!s) return null;
  if (Date.now() - s.startedAt > TOPUP_TTL_MS) {
    store.delete(userId);
    return null;
  }
  return s;
}

export function setTopupState(userId: number, patch: Partial<TopupState>): void {
  const existing = store.get(userId) ?? { awaitingCustomAmount: false, startedAt: Date.now() };
  store.set(userId, { ...existing, ...patch });
}

export function clearTopupState(userId: number): void {
  store.delete(userId);
}
