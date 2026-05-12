import { InlineKeyboard } from 'grammy';
import { type User } from '@prisma/client';

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👥 کاربران', 'admin:users')
    .text('📊 آمار', 'admin:stats')
    .row()
    .text('📢 ابزارها', 'admin:tools')
    .text('⚙️ تنظیمات', 'admin:settings');
}

export function adminUsersKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔍 جستجوی کاربر', 'admin:users:search')
    .row()
    .text('🕐 آخرین کاربران', 'admin:users:recent')
    .row()
    .text('⬅️ بازگشت', 'admin:back');
}

export function adminUserProfileKeyboard(user: User): InlineKeyboard {
  const uid = user.id.toString();
  const kb = new InlineKeyboard()
    .text('💰 افزودن موجودی', `admin:user:wallet-add:${uid}`)
    .text('💸 کسر موجودی', `admin:user:wallet-deduct:${uid}`)
    .row();

  if (user.isBanned) {
    kb.text('✅ رفع مسدودیت', `admin:user:unban:${uid}`).row();
  } else {
    kb.text('🚫 مسدود کردن', `admin:user:ban:${uid}`).row();
  }

  kb.text('📋 سرویس‌ها', `admin:user:configs:${uid}`)
    .text('💳 کیف پول', `admin:user:wh:${uid}`)
    .row()
    .url('🔗 DM', `tg://user?id=${uid}`)
    .row()
    .text('⬅️ بازگشت', 'admin:users');

  return kb;
}

export function adminWalletConfirmKeyboard(
  op: 'add' | 'ded',
  userId: string,
  amount: bigint,
): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ تأیید', `admin:user:wc:${op}:${userId}:${amount}`)
    .text('❌ انصراف', `admin:user:view:${userId}`);
}

export function adminBanConfirmKeyboard(userId: string, action: 'ban' | 'unban'): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ تأیید', `admin:user:${action}-confirm:${userId}`)
    .text('❌ انصراف', `admin:user:view:${userId}`);
}

export function adminCancelInputKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ انصراف', 'admin:cancel');
}
