export type TrafficPackage = {
  id: number;
  gb: number;
  priceToman: bigint;
};

export const TRAFFIC_PACKAGES: readonly TrafficPackage[] = [
  { id: 1, gb: 10,  priceToman: 80_000n },
  { id: 2, gb: 30,  priceToman: 200_000n },
  { id: 3, gb: 50,  priceToman: 320_000n },
  { id: 4, gb: 100, priceToman: 600_000n },
] as const;

export function getTrafficPackage(id: number): TrafficPackage | undefined {
  return TRAFFIC_PACKAGES.find((p) => p.id === id);
}
