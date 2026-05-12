import { InlineKeyboard } from 'grammy';
import { formatToman } from '@/lib/format';

export const TOPUP_QUICK_AMOUNTS = [50_000n, 100_000n, 200_000n, 500_000n] as const;

export function walletMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💳 شارژ کیف پول', 'wallet:topup').row()
    .text('📋 تاریخچه تراکنش‌ها', 'wallet:history');
}

export function walletTopupPickerKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const amount of TOPUP_QUICK_AMOUNTS) {
    kb.text(formatToman(amount), `wallet:topup:${amount}`).row();
  }
  kb.text('✏️ مبلغ دلخواه', 'wallet:topup:custom').row();
  kb.text('⬅️ بازگشت', 'wallet:main');
  return kb;
}

export function walletInvoiceKeyboard(memo: string, nanoTon: bigint): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔳 کد QR', `wallet:topup-qr:${memo}:${nanoTon}`).row()
    .text('✅ پرداخت کردم', 'wallet:main').row()
    .text('⬅️ بازگشت', 'wallet:topup');
}

export function walletHistoryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⬅️ بازگشت', 'wallet:main');
}
