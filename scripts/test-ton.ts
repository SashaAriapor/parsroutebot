import 'dotenv/config';
import { tonClient } from '@/adapters/ton';
import { fxClient } from '@/adapters/fx';
import { tonInvoiceService } from '@/services/ton-invoice.service';
import { tonPaymentService } from '@/services/ton-payment.service';
import { config } from '@/lib/config';

async function main() {
  console.log('=== TON Adapter Test ===\n');

  console.log('1. Address validation:');
  console.log('  My address valid?', tonClient.isAddressValid(config.TON_WALLET_ADDRESS));
  console.log('  Bad address valid?', tonClient.isAddressValid('invalid'));

  console.log('\n2. FX rate:');
  const fx = await fxClient.getTonToIrr();
  console.log(`  1 TON = ${fx.rate.toLocaleString('fa-IR')} ت  (fetched at ${fx.fetchedAt.toISOString()})`);

  console.log('\n3. Convert 100,000 Toman → nanoTon:');
  const conv = await tonInvoiceService.tomanToNanoTon(100_000n);
  console.log(`  ${conv.nanoTon} nanoTon  (${(Number(conv.nanoTon) / 1e9).toFixed(6)} TON)  @ rate ${Math.round(conv.rateTomanPerTon).toLocaleString('fa-IR')} ت/تن`);

  console.log('\n4. Memo generation:');
  const topupMemo = tonInvoiceService.generateMemo({ kind: 'topup', userId: 123456789n, amountToman: 100_000n });
  const orderMemo = tonInvoiceService.generateMemo({ kind: 'order', orderId: 'clxyz12345abcdef' });
  console.log(`  Topup: ${topupMemo}`);
  console.log(`  Order: ${orderMemo}`);

  console.log('\n5. Memo parsing:');
  console.log('  Topup memo:', tonInvoiceService.parseMemo(topupMemo));
  console.log('  Order memo:', tonInvoiceService.parseMemo(orderMemo));
  console.log('  garbage   :', tonInvoiceService.parseMemo('garbage'));
  console.log('  null      :', tonInvoiceService.parseMemo(null));

  console.log('\n6. Fetch recent incoming transactions (limit 5):');
  const txs = await tonClient.getIncomingTransactions(config.TON_WALLET_ADDRESS, undefined, 5);
  if (txs.length === 0) {
    console.log('  No incoming transactions found.');
  } else {
    for (const tx of txs) {
      console.log(
        `  - ${(Number(tx.amountNano) / 1e9).toFixed(4)} TON` +
        `  memo="${tx.comment ?? ''}"` +
        `  from=${tx.fromAddress.slice(0, 16)}...` +
        `  lt=${tx.lt}`,
      );
    }
  }

  console.log('\n7. pollAndProcess (no side effects if no new txs):');
  const result = await tonPaymentService.pollAndProcess();
  console.log(`  processed=${result.processed}  matched=${result.matched}  orphaned=${result.orphaned}`);

  console.log('\n✅ Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
