export interface ITonClient {
  getIncomingTransactions(address: string, sinceLt?: bigint, limit?: number): Promise<TonTx[]>;
  isAddressValid(addr: string): boolean;
}

export type TonTx = {
  hash: string;
  lt: bigint;           // logical time — monotonically increasing, used for incremental polling
  fromAddress: string;
  amountNano: bigint;   // amount in nanoTON (1 TON = 1_000_000_000 nanoTON)
  comment: string | null;
  timestamp: number;    // unix ms
};
