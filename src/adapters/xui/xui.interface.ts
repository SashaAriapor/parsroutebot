// Implementation notes:
//
// 3X-UI uses session cookies for auth. The implementation needs:
//   - A cookie jar (tough-cookie + axios-cookiejar-support)
//   - Auto re-login on 401 or { success: false, msg: "Please login" } responses
//   - The base URL from config.XUI_PANEL_URL (already has webBasePath included)
//
// API endpoints (v2.x):
//   POST {XUI_PANEL_URL}/login                                       form-urlencoded
//   GET  {XUI_PANEL_URL}/panel/api/inbounds/list
//   POST {XUI_PANEL_URL}/panel/api/inbounds/addClient               JSON
//   POST {XUI_PANEL_URL}/panel/api/inbounds/updateClient/{uuid}     JSON
//   POST {XUI_PANEL_URL}/panel/api/inbounds/{id}/delClient/{uuid}
//   GET  {XUI_PANEL_URL}/panel/api/inbounds/getClientTraffics/{email}
//   POST {XUI_PANEL_URL}/panel/api/inbounds/{id}/resetClientTraffic/{email}

export interface IXuiClient {
  // Establishes a session. Called automatically before first request; also available for manual re-auth.
  login(): Promise<void>;

  // Returns all configured inbounds on the panel (used for debugging / inbound discovery).
  listInbounds(): Promise<XuiInbound[]>;

  // inboundId is stored in the constructor — callers do not pass it.
  createClient(params: CreateClientParams): Promise<XuiVpnClient>;
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
  id: number;           // internal panel client ID (0 if unavailable)
  email: string;
  uuid: string;
  enable: boolean;
  totalGB: number;      // GB (not bytes)
  expiryTime: number;   // unix milliseconds
  up: bigint;           // bytes uploaded
  down: bigint;         // bytes downloaded
};

export type XuiInbound = {
  id: number;
  protocol: string; // 'vless' | 'vmess' | 'trojan' etc.
  port: number;
  remark: string;
};
