import { config } from '@/lib/config';
import { XuiClient } from './xui.client';

export { buildSubscriptionUrl, generateClientEmail, generateSubId, gbToBytes, bytesToGB } from './xui.utils';
export type { IXuiClient, CreateClientParams, XuiVpnClient, XuiInbound } from './xui.interface';

export const xuiClient = new XuiClient(
  config.XUI_PANEL_URL,
  config.XUI_USERNAME,
  config.XUI_PASSWORD,
  config.XUI_INBOUND_ID,
);
