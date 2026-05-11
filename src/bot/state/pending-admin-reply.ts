type PendingReply = {
  ticketId: number;
  startedAt: number;
};

const store = new Map<number, PendingReply>();
const TTL_MS = 10 * 60 * 1000;

export function setPendingReply(adminId: number, ticketId: number): void {
  store.set(adminId, { ticketId, startedAt: Date.now() });
}

export function getPendingReply(adminId: number): PendingReply | null {
  const pending = store.get(adminId);
  if (!pending) return null;
  if (Date.now() - pending.startedAt > TTL_MS) {
    store.delete(adminId);
    return null;
  }
  return pending;
}

export function clearPendingReply(adminId: number): void {
  store.delete(adminId);
}
