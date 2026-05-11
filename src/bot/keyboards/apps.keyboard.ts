import { InlineKeyboard } from 'grammy';

export function platformSelectionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🤖 اندروید', 'apps:android').text('🍎 آی‌اواس', 'apps:ios').row()
    .text('🪟 ویندوز', 'apps:windows').text('🍏 مک', 'apps:mac').row()
    .text('🐧 لینوکس', 'apps:linux');
}

export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ بازگشت', 'apps:back');
}
