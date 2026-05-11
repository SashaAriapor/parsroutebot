import { nanoid } from 'nanoid';
import { prisma } from '../db/client';

interface UpsertParams {
  id: bigint;
  username: string | null;
  firstName: string;
  languageCode: string | null;
}

export const userService = {
  async upsert(params: UpsertParams) {
    return prisma.user.upsert({
      where: { id: params.id },
      update: {
        username: params.username,
        firstName: params.firstName,
        languageCode: params.languageCode,
      },
      create: {
        id: params.id,
        username: params.username,
        firstName: params.firstName,
        languageCode: params.languageCode,
        referralCode: nanoid(8),
      },
    });
  },

  async findById(id: bigint) {
    return prisma.user.findUnique({ where: { id } });
  },

  async findByReferralCode(code: string) {
    return prisma.user.findUnique({ where: { referralCode: code } });
  },
};
