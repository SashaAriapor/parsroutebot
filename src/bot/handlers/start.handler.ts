import { type Bot, type Api } from 'grammy';
import { type User } from '@prisma/client';
import { type BotContext } from '../types';
import { MENU } from '../constants';
import { mainMenuKeyboard } from '../keyboards/user.keyboard';
import { config } from '@/lib/config';
import { prisma } from '@/db/client';
import { logger } from '../../lib/logger';

async function tryAttachReferral(api: Api, user: User, referralCode: string): Promise<void> {
  const existing = await prisma.referral.findUnique({ where: { refereeId: user.id } });
  if (existing) return;

  const referrer = await prisma.user.findFirst({ where: { referralCode } });
  if (!referrer) return;
  if (referrer.id === user.id) return;

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId: user.id,
    },
  });

  try {
    await api.sendMessage(
      Number(referrer.id),
      `🎉 یه کاربر جدید با لینک دعوت تو ثبت‌نام کرد!\n\nاز اولین خریدش <b>${config.REFERRAL_COMMISSION_PERCENT}٪</b> کمیسیون می‌گیری.`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    logger.warn({ err, referrerId: referrer.id }, 'Failed to notify referrer of new referral');
  }

  logger.info({ refereeId: user.id, referrerId: referrer.id, code: referralCode }, 'Referral attached');
}

export function registerStartHandler(bot: Bot<BotContext>): void {
  bot.command('start', async (ctx) => {
    logger.info({ from: ctx.from?.id, hasDbUser: !!ctx.dbUser, text: ctx.message?.text }, '🟨 [TRACE /start] handler entered');

    const firstName = ctx.from?.first_name ?? 'کاربر';

    const payload = ctx.match?.trim();
    const refMatch = payload?.match(/^ref_([a-zA-Z0-9_-]{4,32})$/);

    if (refMatch && ctx.dbUser) {
      await tryAttachReferral(ctx.api, ctx.dbUser, refMatch[1]).catch((err) => {
        logger.error({ err }, 'tryAttachReferral threw unexpectedly');
      });
    }

    logger.info({ from: ctx.from?.id }, '🟨 [TRACE /start] about to reply + send keyboard');
    await ctx.reply(`سلام ${firstName} 👋\nبه ربات ما خوش اومدی!`, {
      reply_markup: mainMenuKeyboard(),
    });
    logger.info({ from: ctx.from?.id }, '🟩 [TRACE /start] handler finished');
  });
}
