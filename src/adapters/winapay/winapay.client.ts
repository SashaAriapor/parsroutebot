import { createHttpClient } from '@/lib/axios';
import { logger } from '@/lib/logger';

const BASE = 'https://winapay.io/webservice/rest';

export type PaymentRequestResult =
  | { ok: true; authority: string; paymentUrl: string }
  | { ok: false; status: number };

export type PaymentVerifyResult =
  | { ok: true; refId: string }
  | { ok: false; status: number };

export const winapayClient = {
  async requestPayment(params: {
    merchantId: string;
    amount: bigint;
    invoiceId: string;
    description: string;
    callbackUrl: string;
  }): Promise<PaymentRequestResult> {
    try {
      const http = createHttpClient(15_000);
      const res = await http.post<{ Status: string; Authority: string; PaymentUrl: string }>(
        `${BASE}/PaymentRequest`,
        {
          MerchantID: params.merchantId,
          Amount: Number(params.amount),
          InvoiceID: params.invoiceId,
          Description: params.description,
          CallbackURL: params.callbackUrl,
        },
      );
      const { Status, Authority, PaymentUrl } = res.data;
      if (parseInt(Status) === 100) return { ok: true, authority: Authority, paymentUrl: PaymentUrl };
      logger.warn({ status: Status, invoiceId: params.invoiceId }, 'WinaPay PaymentRequest non-100 status');
      return { ok: false, status: parseInt(Status) };
    } catch (err) {
      logger.error({ err }, 'WinaPay PaymentRequest failed');
      return { ok: false, status: -1 };
    }
  },

  async verifyPayment(params: {
    merchantId: string;
    amount: bigint;
    authority: string;
  }): Promise<PaymentVerifyResult> {
    try {
      const http = createHttpClient(15_000);
      const body = new URLSearchParams({
        MerchantID: params.merchantId,
        Amount: String(Number(params.amount)),
        Authority: params.authority,
      });
      const res = await http.post<{ Status: string; RefID?: string }>(
        `${BASE}/PaymentVerification`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const { Status, RefID } = res.data;
      if (parseInt(Status) === 100 && RefID) return { ok: true, refId: RefID };
      logger.warn({ status: Status, authority: params.authority }, 'WinaPay PaymentVerification non-100 status');
      return { ok: false, status: parseInt(Status) };
    } catch (err) {
      logger.error({ err }, 'WinaPay PaymentVerification failed');
      return { ok: false, status: -1 };
    }
  },
};
