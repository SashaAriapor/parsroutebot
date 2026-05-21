export type UserInputAction =
  | { kind: 'account-name-input'; orderId: string; generatedName: string };

type Pending = {
  action: UserInputAction;
  startedAt: number;
};

const TTL_MS = 10 * 60 * 1000;
const store = new Map<number, Pending>();

export function setUserPending(userId: number, action: UserInputAction): void {
  store.set(userId, { action, startedAt: Date.now() });
}

export function getUserPending(userId: number): UserInputAction | null {
  const p = store.get(userId);
  if (!p) return null;
  if (Date.now() - p.startedAt > TTL_MS) {
    store.delete(userId);
    return null;
  }
  return p.action;
}

export function clearUserPending(userId: number): void {
  store.delete(userId);
}
