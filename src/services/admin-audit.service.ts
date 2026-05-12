import { Prisma, AdminActionType } from '@prisma/client';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/html';

const actionLabel: Partial<Record<AdminActionType, string>> = {
  WALLET_ADD: '💰 افزودن موجودی',
  WALLET_DEDUCT: '💸 کسر موجودی',
  GIFT_SERVICE: '🎁 هدیه سرویس',
  EXTEND_SERVICE: '🔄 تمدید سرویس',
  ADD_TRAFFIC: '📦 افزایش حجم',
  BAN_USER: '🚫 مسدود کردن',
  UNBAN_USER: '✅ رفع مسدودیت',
  BROADCAST: '📢 پیام همگانی',
  CREATE_DISCOUNT: '🏷️ ایجاد کد تخفیف',
  REPLY_TICKET: '💬 پاسخ تیکت',
};

export const adminAuditService = {
  async log(
    tx: Prisma.TransactionClient,
    params: {
      adminId: bigint;
      type: AdminActionType;
      targetUserId?: bigint;
      payload: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await tx.adminAction.create({
      data: {
        adminId: params.adminId,
        type: params.type,
        targetUserId: params.targetUserId ?? null,
        payload: params.payload,
      },
    });

    setImmediate(async () => {
      try {
        const { bot } = await import('@/bot');
        const label = actionLabel[params.type] ?? params.type;
        const targetPart = params.targetUserId
          ? `\n👤 کاربر: <a href="tg://user?id=${params.targetUserId}">${params.targetUserId}</a>`
          : '';
        const payloadEntries = Object.entries(params.payload).filter(([, v]) => v !== '');
        const payloadLines = payloadEntries
          .map(([k, v]) => `  ${escapeHtml(k)}: ${escapeHtml(String(v))}`)
          .join('\n');

        const text =
          `🔧 <b>عملیات ادمین — ${label}</b>\n` +
          `👨‍💼 ادمین: <a href="tg://user?id=${params.adminId}">${params.adminId}</a>` +
          targetPart +
          (payloadLines ? `\n📋 جزئیات:\n${payloadLines}` : '');

        await bot.api.sendMessage(config.LOG_CHANNEL_ID, text, { parse_mode: 'HTML' });
      } catch (err) {
        logger.error({ err }, 'Failed to post admin audit to log channel');
      }
    });
  },
};
