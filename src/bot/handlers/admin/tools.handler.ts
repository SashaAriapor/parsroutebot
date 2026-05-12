import { type Bot, Composer, InlineKeyboard } from 'grammy';
import { type BotContext } from '../../types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { clearAdminPending } from '@/bot/state/pending-admin-input';
import { popDiscountDraft } from './discount-create.handler';

// Queues imported lazily inside the callback to avoid loading worker code at bot startup
async function getQueueMap() {
  const [
    { trafficSyncQueue },
    { expiryNotifierQueue },
    { usageNotifierQueue },
    { invoiceExpirerQueue },
    { dailySummaryQueue },
  ] = await Promise.all([
    import('@/workers/traffic-sync.worker'),
    import('@/workers/expiry-notifier.worker'),
    import('@/workers/usage-notifier.worker'),
    import('@/workers/invoice-expirer.worker'),
    import('@/workers/daily-summary.worker'),
  ]);
  return {
    'traffic-sync': trafficSyncQueue,
    'expiry-notifier': expiryNotifierQueue,
    'usage-notifier': usageNotifierQueue,
    'invoice-expirer': invoiceExpirerQueue,
    'daily-summary': dailySummaryQueue,
  } as const;
}

export function toolsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📢 ارسال پیام همگانی', 'admin:tools:broadcast')
    .row()
    .text('🎟️ ساخت کد تخفیف', 'admin:tools:discount-create')
    .row()
    .text('📋 لیست کدهای تخفیف فعال', 'admin:tools:discount-list')
    .row()
    .text('⚙️ اجرای فوری Worker', 'admin:tools:workers')
    .row()
    .text('⬅️ بازگشت', 'admin:back');
}

function workersMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Traffic Sync', 'admin:worker:run:traffic-sync').row()
    .text('⏰ Expiry Notifier', 'admin:worker:run:expiry-notifier').row()
    .text('📊 Usage Notifier', 'admin:worker:run:usage-notifier').row()
    .text('⌛️ Invoice Expirer', 'admin:worker:run:invoice-expirer').row()
    .text('📅 Daily Summary (الان)', 'admin:worker:run:daily-summary').row()
    .text('⬅️ بازگشت', 'admin:tools');
}

export function registerAdminToolsHandler(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>(adminMiddleware);

  admin.callbackQuery('admin:tools', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '🛠️ <b>ابزارهای مدیریت</b>\n\nاز کدوم ابزار می‌خوای استفاده کنی؟',
      { parse_mode: 'HTML', reply_markup: toolsMenuKeyboard() },
    );
  });

  admin.callbackQuery('admin:tools:workers', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '⚙️ <b>اجرای فوری Worker</b>\n\n' +
      'برای تست یا نیاز فوری، می‌تونی هر worker رو دستی اجرا کنی:',
      { parse_mode: 'HTML', reply_markup: workersMenuKeyboard() },
    );
  });

  admin.callbackQuery(/^admin:worker:run:/, async (ctx) => {
    const name = ctx.callbackQuery.data.slice('admin:worker:run:'.length);
    const queues = await getQueueMap();
    const queue = queues[name as keyof typeof queues];

    if (!queue) {
      await ctx.answerCallbackQuery({ text: 'Worker نامعتبر', show_alert: true });
      return;
    }

    await queue.add('manual-trigger', {}, { removeOnComplete: true, removeOnFail: true });
    await ctx.answerCallbackQuery({ text: '✅ صف اضافه شد، تا چند ثانیه دیگه اجرا میشه' });
  });

  // Central cancel for broadcast/discount flows
  admin.callbackQuery('admin:cancel-pending', async (ctx) => {
    await ctx.answerCallbackQuery();
    clearAdminPending(ctx.from.id);
    popDiscountDraft(ctx.from.id);
    await ctx.editMessageText('❌ لغو شد.', {
      reply_markup: new InlineKeyboard().text('⬅️ بازگشت به ابزارها', 'admin:tools'),
    });
  });

  bot.use(admin);
}
