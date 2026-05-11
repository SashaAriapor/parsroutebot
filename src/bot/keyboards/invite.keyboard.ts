import { InlineKeyboard } from 'grammy';

export function inviteMainKeyboard(refLink: string): InlineKeyboard {
  const shareText = 'بهترین ربات فروش فیلترشکن! با این لینک ثبت‌نام کن:';
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;
  return new InlineKeyboard()
    .text('📋 کپی لینک', 'inv:copy').row()
    .url('📤 اشتراک‌گذاری در تلگرام', shareUrl).row()
    .text('📊 آمار کامل', 'inv:full-stats').row()
    .text('⬅️ بازگشت به منو', 'inv:back');
}

export function inviteFullStatsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ بازگشت', 'inv:main');
}
