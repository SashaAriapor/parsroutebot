import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { fxClient } from '@/adapters/fx';
import { config } from '@/lib/config';
import { formatToman, timeAgo } from '@/lib/format';
import { settingsService } from '@/services/settings.service';
import { setAdminPending, getAdminPending, clearAdminPending } from '../../state/pending-admin-input';

function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 به‌روزرسانی نرخ TON', 'admin:settings:refresh-fx').row()
    .text('💳 تنظیمات کارت به کارت', 'admin:settings:card').row()
    .text('📢 قفل کانال', 'admin:settings:channel-gate').row()
    .text('⬅️ بازگشت', 'admin:back');
}

function cardSettingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✏️ شماره کارت', 'admin:settings:card:number').row()
    .text('✏️ نام صاحب کارت', 'admin:settings:card:owner').row()
    .text('✏️ آی‌دی چنل رسید', 'admin:settings:card:channel').row()
    .text('✏️ درصد کارمزد', 'admin:settings:card:fee').row()
    .text('✏️ تاییدکننده‌های کارت', 'admin:settings:card:approvers').row()
    .text('⬅️ بازگشت', 'admin:settings');
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
    `- سرور: <code>${config.PASARGUARD_URL}</code>\n\n` +
    `👤 <b>ادمین‌ها</b>\n` +
    adminLines + `\n\n` +
    `📺 چنل لاگ: <code>${config.LOG_CHANNEL_ID}</code>\n\n` +
    `────────────────\n` +
    `💡 برای تغییر این مقادیر، فایل .env رو ویرایش کن و ربات رو ری‌استارت کن.`
  );
}

async function buildCardSettingsText(): Promise<string> {
  const { cardNumber, cardOwner, channelId, feePercent, approverIds } = await settingsService.getCardSettings();
  const numDisplay = cardNumber
    ? `<code>${cardNumber.replace(/(\d{4})(?=\d)/g, '$1-')}</code>`
    : '⚠️ تنظیم نشده';
  const approverDisplay = approverIds.length
    ? approverIds.map((id) => `<code>${id}</code>`).join(', ')
    : '⚠️ تنظیم نشده';
  return (
    `💳 <b>تنظیمات کارت به کارت</b>\n\n` +
    `شماره کارت: ${numDisplay}\n` +
    `نام صاحب کارت: ${cardOwner || '⚠️ تنظیم نشده'}\n` +
    `چنل رسید: ${channelId ? `<code>${channelId}</code>` : '⚠️ تنظیم نشده'}\n` +
    `کارمزد: <b>${feePercent}٪</b>\n` +
    `تاییدکننده‌ها: ${approverDisplay}`
  );
}

function channelGateKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✏️ آیدی کانال', 'admin:settings:channel-gate:id').row()
    .text('✏️ یوزرنیم کانال', 'admin:settings:channel-gate:username').row()
    .text('⬅️ بازگشت', 'admin:settings');
}

async function buildChannelGateText(): Promise<string> {
  const [channelId, channelUsername] = await Promise.all([
    settingsService.get('REQUIRED_CHANNEL_ID'),
    settingsService.get('REQUIRED_CHANNEL_USERNAME'),
  ]);
  return (
    `📢 <b>قفل کانال</b>\n\n` +
    `آیدی کانال: ${channelId ? `<code>${channelId}</code>` : '⚠️ تنظیم نشده (غیرفعال)'}\n` +
    `یوزرنیم کانال: ${channelUsername ? `<code>${channelUsername}</code>` : '⚠️ تنظیم نشده'}\n\n` +
    `💡 برای غیرفعال کردن قفل، آیدی کانال رو خالی بذار.`
  );
}

const CHANNEL_GATE_LABELS: Record<string, string> = {
  REQUIRED_CHANNEL_ID: 'آیدی کانال (عدد منفی، مثلاً -1001234567890 — خالی = غیرفعال)',
  REQUIRED_CHANNEL_USERNAME: 'یوزرنیم کانال (مثلاً @mychannel)',
};

const CARD_SETTING_LABELS: Record<string, string> = {
  card_number: 'شماره کارت (فقط عدد، بدون خط تیره)',
  card_owner: 'نام صاحب کارت',
  card_channel_id: 'آی‌دی چنل رسید (عدد منفی، مثلاً -1001234567890)',
  card_fee_percent: 'درصد کارمزد (عدد صحیح، مثلاً 15)',
  card_approver_ids: 'آیدی تلگرام تاییدکننده‌ها (با کاما جدا کنید، مثال: 123456789,987654321)',
};

export function registerAdminSettingsHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();

  // ── Text input for channel gate settings ──────────────────────────────────
  admin.on('message:text', adminMiddleware, async (ctx, next) => {
    const pending = getAdminPending(ctx.from.id);
    if (!pending || pending.kind !== 'channel-gate-setting-input') return next();

    clearAdminPending(ctx.from.id);
    const value = ctx.message.text.trim();

    if (pending.settingKey === 'REQUIRED_CHANNEL_ID' && value !== '') {
      const n = parseInt(value, 10);
      if (isNaN(n) || n >= 0) {
        await ctx.reply('❌ آیدی کانال باید یک عدد منفی باشه (مثلاً -1001234567890) یا خالی برای غیرفعال کردن.');
        return;
      }
    }

    await settingsService.set(pending.settingKey, value);
    const text = await buildChannelGateText();
    await ctx.reply(`✅ ${pending.label} ذخیره شد.\n\n` + text, {
      parse_mode: 'HTML',
      reply_markup: channelGateKeyboard(),
    });
  });

  // ── Text input for card settings ───────────────────────────────────────────
  admin.on('message:text', adminMiddleware, async (ctx, next) => {
    const pending = getAdminPending(ctx.from.id);
    if (!pending || pending.kind !== 'card-setting-input') return next();

    clearAdminPending(ctx.from.id);
    const value = ctx.message.text.trim();

    if (pending.settingKey === 'card_number' && !/^\d+$/.test(value)) {
      await ctx.reply('❌ شماره کارت باید فقط عدد باشه. دوباره امتحان کن.');
      return;
    }
    if (pending.settingKey === 'card_fee_percent') {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 0 || n > 50) {
        await ctx.reply('❌ درصد کارمزد باید بین ۰ تا ۵۰ باشه.');
        return;
      }
    }
    if (pending.settingKey === 'card_channel_id') {
      const n = parseInt(value, 10);
      if (isNaN(n) || n >= 0) {
        await ctx.reply('❌ آی‌دی چنل باید یک عدد منفی باشه (مثلاً -1001234567890).');
        return;
      }
    }
    if (pending.settingKey === 'card_approver_ids' && value !== '') {
      const ids = value.split(',').map((s) => s.trim());
      if (!ids.every((id) => /^\d+$/.test(id))) {
        await ctx.reply('❌ آیدی‌ها باید عدد صحیح و با کاما جدا باشند. مثال: 123456789,987654321');
        return;
      }
    }

    await settingsService.set(pending.settingKey, value);
    const text = await buildCardSettingsText();
    await ctx.reply(`✅ ${pending.label} ذخیره شد.\n\n` + text, {
      parse_mode: 'HTML',
      reply_markup: cardSettingsKeyboard(),
    });
  });

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

  admin.callbackQuery('admin:settings:card', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = await buildCardSettingsText();
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: cardSettingsKeyboard() });
  });

  admin.callbackQuery(/^admin:settings:card:(number|owner|channel|fee|approvers)$/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sub = ctx.match[1] as 'number' | 'owner' | 'channel' | 'fee' | 'approvers';
    const keyMap = { number: 'card_number', owner: 'card_owner', channel: 'card_channel_id', fee: 'card_fee_percent', approvers: 'card_approver_ids' };
    const settingKey = keyMap[sub];
    const label = CARD_SETTING_LABELS[settingKey];
    setAdminPending(ctx.from.id, { kind: 'card-setting-input', settingKey, label });
    await ctx.reply(`✏️ <b>${label}</b> رو بفرست:`, { parse_mode: 'HTML' });
  });

  admin.callbackQuery('admin:settings:channel-gate', adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = await buildChannelGateText();
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: channelGateKeyboard() });
  });

  admin.callbackQuery(/^admin:settings:channel-gate:(id|username)$/, adminMiddleware, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sub = ctx.match[1] as 'id' | 'username';
    const settingKey = sub === 'id' ? 'REQUIRED_CHANNEL_ID' : 'REQUIRED_CHANNEL_USERNAME';
    const label = CHANNEL_GATE_LABELS[settingKey];
    setAdminPending(ctx.from.id, { kind: 'channel-gate-setting-input', settingKey, label });
    await ctx.reply(`✏️ <b>${label}</b> رو بفرست:`, { parse_mode: 'HTML' });
  });

  bot.use(admin);
}
