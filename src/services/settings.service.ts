import { prisma } from '@/db/client';

export const settingsService = {
  async get(key: string): Promise<string | null> {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  },

  async getCardSettings(): Promise<{
    cardNumber: string;
    cardOwner: string;
    channelId: number | null;
    feePercent: number;
  }> {
    const [num, owner, channelStr, feeStr] = await Promise.all([
      this.get('card_number'),
      this.get('card_owner'),
      this.get('card_channel_id'),
      this.get('card_fee_percent'),
    ]);
    return {
      cardNumber: num ?? '',
      cardOwner: owner ?? '',
      channelId: channelStr ? (parseInt(channelStr, 10) || null) : null,
      feePercent: feeStr ? (parseInt(feeStr, 10) || 15) : 15,
    };
  },
};
