export interface ITonClient {
  getIncomingTransactions(address: string, sinceLt?: bigint): Promise<TonTx[]>;
  isAddressValid(addr: string): boolean;
}

export type TonTx = {
  hash: string;
  fromAddress: string;
  amountNano: bigint; // amount in nanoTON (1 TON = 1_000_000_000 nanoTON)
  comment: string | null;
  timestamp: number; // unix seconds
};
