import 'dotenv/config';
import { xuiClient } from '@/adapters/xui';
import { nanoid } from 'nanoid';

async function main() {
  console.log('1. Logging in...');
  await xuiClient.login();
  console.log('✅ Logged in\n');

  console.log('2. Listing inbounds...');
  const inbounds = await xuiClient.listInbounds();
  console.log(
    `Found ${inbounds.length} inbound(s):`,
    inbounds.map((i) => ({ id: i.id, protocol: i.protocol, port: i.port, remark: i.remark })),
  );
  console.log();

  console.log('3. Creating test client...');
  const email = `test_${nanoid(6)}`;
  const created = await xuiClient.createClient({
    email,
    uuid: crypto.randomUUID(),
    totalGB: 1,
    expiryTimeMs: Date.now() + 24 * 3600 * 1000, // 1 day
    limitIp: 2,
    subId: nanoid(16),
  });
  console.log('✅ Client created:', {
    uuid: created.uuid,
    email: created.email,
    totalGB: created.totalGB,
    expiryTime: new Date(created.expiryTime).toISOString(),
  });
  console.log();

  console.log('4. Fetching created client by UUID...');
  const fetched = await xuiClient.getClient(created.uuid);
  console.log('getClient result:', fetched);
  console.log();

  console.log('5. Getting traffic (expect zeros for new client)...');
  const traffic = await xuiClient.getClientTraffic(email);
  console.log('Traffic:', {
    up: traffic.up.toString() + ' bytes',
    down: traffic.down.toString() + ' bytes',
    total: traffic.total.toString() + ' bytes',
  });
  console.log();

  console.log('6. Updating client (extend expiry by 1 more day)...');
  await xuiClient.updateClient(created.uuid, {
    expiryTimeMs: Date.now() + 48 * 3600 * 1000,
  });
  console.log('✅ Client updated\n');

  console.log('7. Deleting test client...');
  await xuiClient.deleteClient(created.uuid);
  console.log('✅ Deleted\n');

  console.log('8. Verifying deletion (getClient should return null)...');
  const afterDelete = await xuiClient.getClient(created.uuid);
  console.log('getClient after delete:', afterDelete, '(expected: null)');

  console.log('\n✅ All tests passed');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
