import { InlineKeyboard } from 'grammy';
import { type Server, type VpnConfig, type Plan, ConfigStatus } from '@prisma/client';
import { daysRemaining } from '@/lib/format';
import { TRAFFIC_PACKAGES } from '@/services/traffic-packages';

function configStatusEmoji(config: VpnConfig): string {
  if (config.status !== ConfigStatus.ACTIVE) return '🔴';
  const days = daysRemaining(config.expiryAt);
  if (days !== null && days <= 3) return '🟡';
  return '🟢';
}

export function configListKeyboard(
  configs: (VpnConfig & { server: Server })[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const cfg of configs) {
    const emoji = configStatusEmoji(cfg);
    const days = daysRemaining(cfg.expiryAt);
    const daysText =
      cfg.status !== ConfigStatus.ACTIVE
        ? 'منقضی'
        : days === null
          ? 'نامحدود'
          : days === 0
            ? 'منقضی'
            : `${days} روز مونده`;
    const serverLabel = `${cfg.server.flag ?? ''}${cfg.server.name}`;
    kb.text(`${emoji} سرویس #${cfg.id} — ${serverLabel} — ${daysText}`, `svc:view:${cfg.id}`).row();
  }
  return kb;
}

export function configDetailKeyboard(
  configId: number,
  status: ConfigStatus,
  isUnlimited: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (status === ConfigStatus.ACTIVE || status === ConfigStatus.EXPIRED) {
    if (status === ConfigStatus.ACTIVE) {
      kb.text('📋 کپی لینک ساب', `svc:sub:${configId}`)
        .text('🔳 QR کد', `svc:qr:${configId}`)
        .row();
    }
    // TODO: re-enable when extension/traffic-add features are ready
    // kb.text('➕ تمدید', `svc:extend:${configId}`);
    // if (!isUnlimited && status === ConfigStatus.ACTIVE) {
    //   kb.text('📦 افزایش حجم', `svc:traffic:${configId}`);
    // }
    // kb.row();
  }

  kb.text('💬 پشتیبانی', `svc:support:${configId}`).row();
  kb.text('⬅️ بازگشت به لیست', 'svc:list');
  return kb;
}

export function extendPlansKeyboard(configId: number, plans: Plan[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const plan of plans) {
    const price = Number(plan.priceToman).toLocaleString('fa-IR');
    kb.text(`${plan.durationDays} روزه — ${price} ت`, `svc:extend-confirm:${configId}:${plan.id}`).row();
  }
  kb.text('⬅️ بازگشت', `svc:view:${configId}`);
  return kb;
}

export function extendConfirmKeyboard(configId: number, planId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ تأیید و خرید از کیف پول', `svc:extend-do:${configId}:${planId}`)
    .row()
    .text('❌ انصراف', `svc:view:${configId}`);
}

export function insufficientBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('💰 شارژ کیف پول', 'wallet:topup');
}

export function trafficPackagesKeyboard(configId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const pkg of TRAFFIC_PACKAGES) {
    const price = Number(pkg.priceToman).toLocaleString('fa-IR');
    kb.text(`+${pkg.gb} گیگ — ${price} ت`, `svc:traffic-confirm:${configId}:${pkg.id}`).row();
  }
  kb.text('⬅️ بازگشت', `svc:view:${configId}`);
  return kb;
}

export function trafficConfirmKeyboard(configId: number, pkgId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ تأیید و خرید از کیف پول', `svc:traffic-do:${configId}:${pkgId}`)
    .row()
    .text('❌ انصراف', `svc:view:${configId}`);
}

export function backToConfigKeyboard(configId: number): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ بازگشت به سرویس', `svc:view:${configId}`);
}
