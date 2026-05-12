import { nanoid } from 'nanoid';
import { fxClient } from '@/adapters/fx';

const INVOICE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MEMO_PREFIX_TOPUP = 'TOPUP';
const MEMO_PREFIX_ORDER = 'ORDER';

export type InvoiceContext =
  | { kind: 'topup'; userId: bigint; amountToman: bigint }
  | { kind: 'order'; orderId: string };

export const tonInvoiceService = {
  /**
   * Convert a Toman amount to nanoTON at the current exchange rate.
   * Rounds UP to ensure the user doesn't accidentally under-pay.
   */
  async tomanToNanoTon(amountToman: bigint): Promise<{
    nanoTon: bigint;
    rateTomanPerTon: number;
    fetchedAt: Date;
  }> {
    const { rate, fetchedAt } = await fxClient.getTonToIrr();
    if (rate <= 0) throw new Error('Invalid FX rate');

    const amountTon = Number(amountToman) / rate;
    const nanoTon = BigInt(Math.ceil(amountTon * 1e9));

    return { nanoTon, rateTomanPerTon: rate, fetchedAt };
  },

  /**
   * Generate a unique memo for an invoice.
   * Format: TOPUP-{userId}-{nonce6}  or  ORDER-{orderId8}-{nonce6}
   * Kept short (~25 chars) to fit comfortably in a TON text_comment payload.
   */
  generateMemo(ctx: InvoiceContext): string {
    const nonce = nanoid(6);
    if (ctx.kind === 'topup') {
      return `${MEMO_PREFIX_TOPUP}-${ctx.userId}-${nonce}`;
    }
    return `${MEMO_PREFIX_ORDER}-${ctx.orderId.slice(0, 8)}-${nonce}`;
  },

  /**
   * Parse a memo back into structured info.
   * Returns null for any memo that doesn't match our format.
   */
  parseMemo(memo: string | null):
    | { kind: 'topup'; userId: bigint }
    | { kind: 'order'; orderIdPrefix: string }
    | null {
    if (!memo) return null;
    const s = memo.trim();

    const topupMatch = s.match(/^TOPUP-(\d+)-[A-Za-z0-9_-]{4,}$/);
    if (topupMatch) {
      try {
        return { kind: 'topup', userId: BigInt(topupMatch[1]) };
      } catch {
        return null;
      }
    }

    const orderMatch = s.match(/^ORDER-([A-Za-z0-9]{4,})-[A-Za-z0-9_-]{4,}$/);
    if (orderMatch) {
      return { kind: 'order', orderIdPrefix: orderMatch[1] };
    }

    return null;
  },

  invoiceExpiry(): Date {
    return new Date(Date.now() + INVOICE_TTL_MS);
  },
};
