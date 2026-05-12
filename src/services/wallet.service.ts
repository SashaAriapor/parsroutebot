import { tonInvoiceService } from './ton-invoice.service';
import { config } from '@/lib/config';

export type TopupInvoice = {
  memo: string;
  nanoTon: bigint;
  rateTomanPerTon: number;
  amountToman: bigint;
  tonAddress: string;
  expiresAt: Date;
};

export const walletService = {
  async createTopupInvoice(userId: bigint, amountToman: bigint): Promise<TopupInvoice> {
    const { nanoTon, rateTomanPerTon } = await tonInvoiceService.tomanToNanoTon(amountToman);
    const memo = tonInvoiceService.generateMemo({ kind: 'topup', userId, amountToman });
    const expiresAt = tonInvoiceService.invoiceExpiry();

    return {
      memo,
      nanoTon,
      rateTomanPerTon,
      amountToman,
      tonAddress: config.TON_WALLET_ADDRESS,
      expiresAt,
    };
  },
};
