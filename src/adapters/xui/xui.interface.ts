// Implementation notes for whoever builds XuiClient:
//
// 3X-UI uses session cookies for auth. The implementation needs:
//   - A cookie jar (e.g. tough-cookie + axios-cookiejar-support)
//   - Auto re-login on 401/403 responses (the panel invalidates sessions)
//   - The base URL from config.XUI_PANEL_URL (already has webBasePath included)
//
// Endpoints:
//   POST {XUI_PANEL_URL}/login          body: form-data { username, password }
//   GET  {XUI_PANEL_URL}/xui/inbounds   returns array of inbounds
//   POST {XUI_PANEL_URL}/xui/inbound/addClient
//   GET  {XUI_PANEL_URL}/xui/client/{uuid}
//   POST {XUI_PANEL_URL}/xui/inbound/updateClient/{uuid}
//   POST {XUI_PANEL_URL}/xui/inbound/{inboundId}/delClient/{uuid}
//   GET  {XUI_PANEL_URL}/xui/client/getClientTraffics/{email}
//   POST {XUI_PANEL_URL}/xui/inbound/{inboundId}/resetClientTraffic/{email}

export interface IXuiClient {
  // Establishes a session. Called automatically; also available for manual re-auth.
  login(): Promise<void>;

  // Returns all configured inbounds on the panel.
  listInbounds(): Promise<XuiInbound[]>;

  createClient(inboundId: number, params: CreateClientParams): Promise<XuiVpnClient>;
  getClient(uuid: string): Promise<XuiVpnClient | null>;
  updateClient(uuid: string, params: Partial<CreateClientParams>): Promise<void>;
  deleteClient(uuid: string): Promise<void>;

  getClientTraffic(email: string): Promise<{ up: bigint; down: bigint; total: bigint }>;
  resetClientTraffic(email: string): Promise<void>;
}

export type CreateClientParams = {
  email: string;        // unique per-client identifier inside the panel
  uuid: string;         // VLESS/VMess UUID
  totalGB: number;      // traffic cap in GB; 0 = unlimited
  expiryTimeMs: number; // expiry as unix milliseconds; 0 = no expiry
  limitIp?: number;     // max concurrent IPs; 0 = unlimited
  subId?: string;       // subscription ID (used to build the sub link)
};

export type XuiVpnClient = {
  id: number;
  email: string;
  uuid: string;
  enable: boolean;
  totalGB: number;
  expiryTime: number; // unix milliseconds
  up: bigint;         // bytes uploaded
  down: bigint;       // bytes downloaded
};

export type XuiInbound = {
  id: number;
  protocol: string; // 'vless' | 'vmess' | 'trojan' etc.
  port: number;
  remark: string;
};
