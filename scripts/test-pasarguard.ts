import 'dotenv/config';
import { pasarguardClient } from '@/adapters/pasarguard';
import { generatePasarGuardUsername, gbToBytes } from '@/adapters/pasarguard/pasarguard.utils';

async function main() {
  console.log('1. Logging in...');
  await pasarguardClient.login();
  console.log('✅ Login OK');

  console.log('0. Listing groups...');
  const groups = await pasarguardClient.listGroups();
  console.log('Groups:', groups);

  console.log('2. Creating test user...');
  const username = generatePasarGuardUsername('test');
  const user = await pasarguardClient.createUser({
    username,
    dataLimitBytes: gbToBytes(1),
    expireAt: new Date(Date.now() + 24 * 3600 * 1000),
  });
  console.log('✅ Created:', user);
  console.log('   Sub URL:', user.subscriptionUrl);

  console.log('3. Getting user...');
  const fetched = await pasarguardClient.getUser(username);
  console.log('✅ Fetched:', fetched);

  console.log('4. Modifying user (extend 7 days, add 10GB)...');
  const modified = await pasarguardClient.modifyUser(username, {
    expireAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    dataLimitBytes: gbToBytes(10),
  });
  console.log('✅ Modified:', modified);

  console.log('5. Getting used traffic...');
  const used = await pasarguardClient.getUserUsed(username);
  console.log('✅ Used:', used);

  console.log('6. Deleting test user...');
  await pasarguardClient.deleteUser(username);
  console.log('✅ Deleted');

  console.log('\n✅ All tests passed!');
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
