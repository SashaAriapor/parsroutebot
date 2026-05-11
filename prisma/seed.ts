import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Plans — upsert by title so re-running is idempotent
  const plans = [
    { title: '30 گیگ یک ماهه',  trafficGB: 30,  durationDays: 30, priceToman: 200_000n, sortOrder: 1 },
    { title: '60 گیگ دو ماهه',  trafficGB: 60,  durationDays: 60, priceToman: 380_000n, sortOrder: 2 },
    { title: '100 گیگ سه ماهه', trafficGB: 100, durationDays: 90, priceToman: 600_000n, sortOrder: 3 },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: (await prisma.plan.findFirst({ where: { title: plan.title } }))?.id ?? 0 },
      update: plan,
      create: plan,
    });
  }
  console.log(`✅ Seeded ${plans.length} plans`);

  // Default server — upsert by name
  const inboundId = parseInt(process.env.XUI_INBOUND_ID ?? '1', 10);
  const subDomain = process.env.XUI_SUB_DOMAIN ?? 'sub.example.com';
  const subPort   = parseInt(process.env.XUI_SUB_PORT ?? '2096', 10);
  const subPath   = process.env.XUI_SUB_PATH ?? '/sub/';

  await prisma.server.upsert({
    where:  { name: 'Germany-1' },
    update: { inboundId, subDomain, subPort, subPath },
    create: {
      name:          'Germany-1',
      flag:          '🇩🇪',
      panelUrl:      null,
      panelUsername: null,
      panelPassword: null,
      inboundId,
      subDomain,
      subPort,
      subPath,
      isActive:  true,
      sortOrder: 1,
    },
  });
  console.log('✅ Seeded default server (Germany-1)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
