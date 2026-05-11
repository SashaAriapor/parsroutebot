import { InlineKeyboard } from 'grammy';
import { type Server } from '@prisma/client';
import { formatToman, formatGB } from '@/lib/format';

export function gbPickerKeyboard(
  quickPicks: Array<{ gb: number; price: bigint }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of quickPicks) {
    kb.text(`📦 ${formatGB(p.gb)} — ${formatToman(p.price)}`, `buy:gb:${p.gb}`).row();
  }
  kb.text('✏️ حجم دلخواه', 'buy:custom-gb').row();
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
    .text('🪙 پرداخت با TON (به‌زودی)', 'buy:pay:ton').row()
    .text('⬅️ بازگشت', 'buy:back-to-discount').row()
    .text('❌ انصراف', 'buy:cancel');
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
