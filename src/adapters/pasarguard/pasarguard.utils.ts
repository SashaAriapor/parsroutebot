export function generatePasarGuardUsername(prefix = 'usr'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const id = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}_${id}`;
}

export function bytesToGB(bytes: bigint | number): number {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  return n / 1024 ** 3;
}

export function gbToBytes(gb: number): bigint {
  return gb === 0 ? 0n : BigInt(Math.floor(gb * 1024 ** 3));
}

// Extract the subscription token from a PasarGuard subscription URL.
// URL format: https://domain/sub/{token}/
export function extractSubToken(subscriptionUrl: string): string {
  const match = subscriptionUrl.match(/\/sub\/([^/]+)\//);
  return match ? match[1] : subscriptionUrl;
}
