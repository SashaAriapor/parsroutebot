import { InlineKeyboard } from 'grammy';
import { type Server } from '@prisma/client';
import { formatToman, formatGB } from '@/lib/format';

export function gbPickerKeyboard(
  quickPicks: Array<{ gb: number; price: bigint }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < quickPicks.length; i += 2) {
    const a = quickPicks[i];
    const b = quickPicks[i + 1];
    if (b) {
      kb.text(`📦 ${formatGB(a.gb)} — ${formatToman(a.price)}`, `buy:gb:${a.gb}`)
        .text(`📦 ${formatGB(b.gb)} — ${formatToman(b.price)}`, `buy:gb:${b.gb}`)
        .row();
    } else {
      kb.text(`📦 ${formatGB(a.gb)} — ${formatToman(a.price)}`, `buy:gb:${a.gb}`).row();
    }
  }
  kb.text('✏️ مقدار دلخواه', 'buy:custom-gb').row();
  kb.text('❌ انصراف', 'buy:cancel');
  return kb;
}

export function serverListKeyboard(servers: Server[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const srv of servers) {
    kb.text(`${srv.flag ?? ''}${srv.name}`, `buy:server:${srv.id}`).row();
  }
  kb.text('⬅️ تغییر حجم', 'buy:back-to-gb').row();
  kb.text('❌ انصراف', 'buy:cancel');
  return kb;
}

export function discountScreenKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⏭️ بدون تخفیف', 'buy:skip-discount').row()
    .text('⬅️ بازگشت', 'buy:back-to-gb').row()
    .text('❌ انصراف', 'buy:cancel');
}

export function summaryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 پرداخت از کیف پول', 'buy:pay:wallet').row()
    .text('🪙 پرداخت با TON', 'buy:pay:ton').row()
    .text('💳 پرداخت کارت به کارت', 'buy:pay:card').row()
    .text('⬅️ بازگشت', 'buy:back-to-discount').row()
    .text('❌ انصراف', 'buy:cancel');
}

export function buyTonInvoiceKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔳 کد QR', `buy:ton-qr:${orderId}`).row()
    .text('✅ پرداخت کردم', 'buy:ton-paid').row()
    .text('❌ لغو سفارش', `buy:cancel-pending:${orderId}`);
}

export function walletConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ تأیید و خرید', 'buy:execute').row()
    .text('❌ انصراف', 'buy:cancel');
}

export function insufficientBuyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 شارژ کیف پول', 'wallet:topup').row()
    .text('⬅️ بازگشت', 'buy:summary');
}

export function successKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🛡️ سرویس‌های من', 'svc:list')
    .text('📲 راهنمای اتصال', 'apps:back');
}
