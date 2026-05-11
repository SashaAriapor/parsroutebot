import { InlineKeyboard } from 'grammy';

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👥 کاربران', 'admin:users').row()
    .text('📊 آمار', 'admin:stats').row()
    .text('📢 ابزارها', 'admin:tools');
}
