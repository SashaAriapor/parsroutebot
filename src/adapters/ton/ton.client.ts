import { Address } from '@ton/core';
import { logger } from '@/lib/logger';
import { TonError } from '@/lib/errors';
import { createHttpClient } from '@/lib/axios';
import type { AxiosInstance } from 'axios';
import type { ITonClient, TonTx } from './ton.interface';

const TONAPI_BASE = 'https://tonapi.io';

export class TonClient implements ITonClient {
  private http: AxiosInstance;

  constructor(private apiKey: string | undefined) {
    this.http = createHttpClient(15_000);
    this.http.defaults.baseURL = TONAPI_BASE;
    if (apiKey) this.http.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
  }

  isAddressValid(addr: string): boolean {
    try {
      Address.parse(addr);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch incoming transactions for a TON address.
   * Returns transactions sorted by lt descending (newest first) from the API;
   * callers should sort ascending if they need chronological order.
   *
   * @param address  Non-bounceable address (UQ...)
   * @param sinceLt  Return only transactions with lt > sinceLt
   * @param limit    Max results to request from API (default 50)
   */
  async getIncomingTransactions(address: string, sinceLt?: bigint, limit = 50): Promise<TonTx[]> {
    try {
      const res = await this.http.get(`/v2/blockchain/accounts/${address}/transactions`, {
        params: { limit },
      });

      const txs: any[] = res.data?.transactions ?? [];
      const incoming: TonTx[] = [];

      for (const tx of txs) {
        const inMsg = tx.in_msg;
        if (!inMsg) continue;

        // Only care about transfers that sent value to us
        const valueNano = BigInt(inMsg.value ?? 0);
        if (valueNano === 0n) continue;

        // Skip messages originating from our own address (outgoing mirror)
        if (inMsg.source?.address === address) continue;

        const lt = BigInt(tx.lt ?? 0);
        if (sinceLt !== undefined && lt <= sinceLt) continue;

        incoming.push({
          hash: tx.hash,
          lt,
          fromAddress: inMsg.source?.address ?? 'unknown',
          amountNano: valueNano,
          comment: extractComment(inMsg),
          timestamp: tx.utime ? tx.utime * 1000 : Date.now(),
        });
      }

      return incoming;
    } catch (err: any) {
      logger.error({ err: err.message, address }, 'TonAPI getIncomingTransactions failed');
      throw new TonError(`Failed to fetch TON transactions: ${err.message}`);
    }
  }
}

/**
 * Extract the text comment from a TON message.
 * TonAPI v2 decodes simple text_comment ops into decoded_body.text.
 */
function extractComment(inMsg: any): string | null {
  if (inMsg.decoded_op_name === 'text_comment' && inMsg.decoded_body?.text) {
    return String(inMsg.decoded_body.text);
  }
  if (inMsg.message_content?.decoded?.comment) {
    return String(inMsg.message_content.decoded.comment);
  }
  return null;
}
