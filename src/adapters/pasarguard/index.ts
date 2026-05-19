import { config } from '@/lib/config';
import { PasarGuardClient } from './pasarguard.client';

export const pasarguardClient = new PasarGuardClient(
  config.PASARGUARD_URL,
  config.PASARGUARD_USERNAME,
  config.PASARGUARD_PASSWORD,
);

export * from './pasarguard.interface';
export * from './pasarguard.utils';
