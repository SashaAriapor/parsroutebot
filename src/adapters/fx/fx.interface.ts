export interface IFxClient {
  // Returns the current TON/IRR exchange rate and when it was fetched.
  getTonToIrr(): Promise<{ rate: number; fetchedAt: Date }>;
}
