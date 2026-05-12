import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { fxClient } from '@/adapters/fx';
import { config } from '@/lib/config';
import { formatToman, timeAgo } from '@/lib/format';

function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 به‌روزرسانی نرخ TON', 'admin:settings:refresh-fx')
    .row()
    .text('⬅️ بازگشت', 'admin:back');
}

async function buildSettingsText(): Promise<string> {
  let fxRate: { rate: number; fetchedAt: Date } | null = null;
  try {
    fxRate = await fxClient.getTonToIrr();
  } catch {}

  const rateStr = fxRate
    ? `<b>${formatToman(BigInt(Math.round(fxRate.rate)))}/تن</b>`
    : '❌ در دسترس نیست';
  const fetchedAtStr = fxRate ? `\n• به‌روز شده: ${timeAgo(fxRate.fetchedAt)}` : '';

  const adminLines = config.ADMIN_IDS.map((id) => `• <code>${id}</code>`).join('\n');

  return (
    `⚙️ <b>تنظیمات سیستم</b>\n\n` +
    `💰 <b>قیمت‌گذاری</b>\n` +
    `- قیمت هر گیگ: <b>${formatToman(config.PRICE_PER_GB_TOMAN)}</b>\n` +
    `- حداقل خرید: ${config.MIN_GB} گیگ\n` +
    `- حداکثر خرید: ${config.MAX_GB} گیگ\n` +
    `- مدت پیش‌فرض: ${config.DEFAULT_DURATION_DAYS} روز\n\n` +
    `🤝 <b>رفرال</b>\n` +
    `- کمیسیون: <b>${config.REFERRAL_COMMISSION_PERCENT}٪</b>\n\n` +
    `🪙 <b>TON</b>\n` +
    `- آدرس: <code>${config.TON_WALLET_ADDRESS}</code>\n` +
    `- نرخ لحظه‌ای: ${rateStr}${fetchedAtStr}\n\n` +
    `📡 <b>پنل</b>\n` +
    `- پروتکل ساب: ${config.XUI_SUB_PROTOCOL}\n` +
    `- دامنه: <code>${config.XUI_SUB_DOMAIN}:${config.XUI_SUB_PORT}${config.XUI_SUB_PATH}</code>\n` +
    `- Inbound ID: ${config.XUI_INBOUND_ID}\n\n` +
    `👤 <b>ادمین‌ها</b>\n` +
    adminLines + `\n\n` +
    `📺 چنل لاگ: <code>${config.LOG_CHANNEL_ID}</code>\n\n` +
    `────────────────\n` +
    `💡 برای تغییر این مقادیر، فایل .env رو ویرایش کن و ربات رو ری‌استارت کن.`
  );
}

export function registerAdminSettingsHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();

  admin.callbackQuery('admin:settings', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = await buildSettingsText();
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: settingsKeyboard() });
  });

  admin.callbackQuery('admin:settings:refresh-fx', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'در حال به‌روزرسانی...' });
    try {
      await fxClient.forceRefresh();
    } catch {
      await ctx.answerCallbackQuery({ text: '❌ خطا در دریافت نرخ', show_alert: true });
    }
    const text = await buildSettingsText();
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: settingsKeyboard() });
  });

  bot.use(admin);
}
