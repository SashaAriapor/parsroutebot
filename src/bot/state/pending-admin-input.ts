export type BroadcastSegment = 'all' | 'active' | 'vip' | 'never-bought' | 'has-active-config';

export type AdminInputAction =
  | { kind: 'user-search' }
  | { kind: 'wallet-add'; targetUserId: bigint }
  | { kind: 'wallet-deduct'; targetUserId: bigint }
  | { kind: 'wallet-amount-reason'; targetUserId: bigint; amount: bigint; op: 'add' | 'deduct' }
  | { kind: 'broadcast-message'; segment: BroadcastSegment }
  | { kind: 'discount-code-input' }
  | { kind: 'discount-percent-input'; code: string }
  | { kind: 'discount-max-uses-input'; code: string; percentOff: number }
  | { kind: 'discount-expiry-input'; code: string; percentOff: number; maxUses: number | null };

type Pending = {
  action: AdminInputAction;
  startedAt: number;
};

const TTL_MS = 10 * 60 * 1000;
const store = new Map<number, Pending>();
const reasonStore = new Map<number, string | null>();

export function setAdminPending(adminId: number, action: AdminInputAction): void {
  store.set(adminId, { action, startedAt: Date.now() });
}

export function getAdminPending(adminId: number): AdminInputAction | null {
  const p = store.get(adminId);
  if (!p) return null;
  if (Date.now() - p.startedAt > TTL_MS) {
    store.delete(adminId);
    return null;
  }
  return p.action;
}

export function clearAdminPending(adminId: number): void {
  store.delete(adminId);
}

export function stashReason(adminId: number, reason: string | null): void {
  reasonStore.set(adminId, reason);
}

export function popReason(adminId: number): string | null | undefined {
  const r = reasonStore.get(adminId);
  reasonStore.delete(adminId);
  return r;
}
