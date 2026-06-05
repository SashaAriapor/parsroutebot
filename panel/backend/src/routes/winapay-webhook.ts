import { Hono } from 'hono';
import axios from 'axios';
import { prisma } from '../prisma';
import { logger } from '../../../../src/lib/logger';

const WINAPAY_BASE = 'https://winapay.io/webservice/rest';

export type OnWinapayPaid = (userId: bigint, orderId: string, generatedName: string) => Promise<void>;

function generateUsername(prefix = 'usr'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const id = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}_${id}`;
}

export function buildWinapayWebhookRouter(onPaid?: OnWinapayPaid): Hono {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = await c.req.parseBody();
    const PaymentStatus = String(body['PaymentStatus'] ?? '');
    const Authority = String(body['Authority'] ?? '');
    const InvoiceID = String(body['InvoiceID'] ?? '');

    if (PaymentStatus !== 'OK' || !Authority || !InvoiceID) {
      return c.text('ok');
    }

    const order = await prisma.order.findUnique({ where: { id: InvoiceID } });
    if (!order || order.status !== 'PENDING' || order.paymentMethod !== 'WINAPAY') {
      return c.text('ok');
    }

    const merchantIdRow = await prisma.setting.findUnique({ where: { key: 'WINAPAY_MERCHANT_ID' } });
    const merchantId = merchantIdRow?.value || process.env['WINAPAY_MERCHANT_ID'];

    if (!merchantId) {
      logger.error({ orderId: InvoiceID }, 'WinaPay webhook: merchant ID not configured');
      return c.text('ok');
    }

    let refId: string;
    try {
      const res = await axios.post<{ Status: number; RefID?: string }>(
        `${WINAPAY_BASE}/PaymentVerification`,
        new URLSearchParams({
          MerchantID: merchantId,
          Amount: String(Number(order.priceToman)),
          Authority,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const { Status, RefID } = res.data;
      if (Status !== 100 || !RefID) {
        logger.warn({ status: Status, authority: Authority, orderId: InvoiceID }, 'WinaPay verification failed');
        return c.text('ok');
      }
      refId = RefID;
    } catch (err) {
      logger.error({ err, orderId: InvoiceID }, 'WinaPay verification request error');
      return c.text('ok');
    }

    await prisma.order.update({
      where: { id: InvoiceID },
      data: {
        status: 'PAID',
        winapayAuthority: Authority,
        winapayRefId: refId,
        paidAt: new Date(),
      },
    });

    logger.info({ orderId: InvoiceID, refId, userId: String(order.userId) }, 'WinaPay payment verified and order marked PAID');

    if (onPaid) {
      const generatedName = generateUsername();
      try {
        await onPaid(order.userId, InvoiceID, generatedName);
      } catch (err) {
        logger.error({ err, orderId: InvoiceID }, 'WinaPay webhook: onPaid callback failed');
      }
    }

    return c.text('ok');
  });

  return router;
}
