import 'dotenv/config';
import { prisma } from '@/db/client';
import { nanoid } from 'nanoid';

async function main() {
  // Find users with empty or null referralCode
  const users = await prisma.user.findMany({
    where: { OR: [{ referralCode: '' }, { referralCode: undefined as unknown as string }] },
  });

  if (users.length === 0) {
    console.log('✅ All users already have referral codes — nothing to backfill.');
    return;
  }

  console.log(`Backfilling ${users.length} users...`);
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { referralCode: nanoid(8) },
    });
  }
  console.log('✅ Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
