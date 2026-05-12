export interface IFxClient {
  getTonToIrr(): Promise<{ rate: number; fetchedAt: Date }>;
  forceRefresh(): Promise<{ rate: number; fetchedAt: Date }>;
}
