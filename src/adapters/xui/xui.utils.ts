import { nanoid } from 'nanoid';
import { config } from '@/lib/config';

/** Convert GB to bytes for the 3X-UI API (which expects totalGB in bytes, despite the name). */
export function gbToBytes(gb: number): number {
  return gb === 0 ? 0 : Math.round(gb * 1024 ** 3);
}

/** Convert bytes to GB for display / internal storage. */
export function bytesToGB(bytes: bigint | number): number {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  return n / 1024 ** 3;
}

/** Generate a unique per-panel client email identifier, e.g. "usr_Ab3dEf7g". */
export function generateClientEmail(prefix = 'usr'): string {
  return `${prefix}_${nanoid(8)}`;
}

/** Generate a 16-char subscription ID for building sub links. */
export function generateSubId(): string {
  return nanoid(16);
}

/**
 * Build the subscription URL that users paste into V2rayNG / Hiddify / etc.
 * Example: buildSubscriptionUrl('ZdyNgKq1Bc2X1abi')
 * → "http://p.swshao.ir:2095/sub/ZdyNgKq1Bc2X1abi"
 */
export function buildSubscriptionUrl(subId: string): string {
  const { XUI_SUB_PROTOCOL, XUI_SUB_DOMAIN, XUI_SUB_PORT, XUI_SUB_PATH } = config;
  const isDefaultPort =
    (XUI_SUB_PROTOCOL === 'http' && XUI_SUB_PORT === 80) ||
    (XUI_SUB_PROTOCOL === 'https' && XUI_SUB_PORT === 443);
  const portPart = isDefaultPort ? '' : `:${XUI_SUB_PORT}`;
  return `${XUI_SUB_PROTOCOL}://${XUI_SUB_DOMAIN}${portPart}${XUI_SUB_PATH}${subId}`;
}
