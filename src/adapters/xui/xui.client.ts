import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { logger } from '@/lib/logger';
import { XuiPanelError } from '@/lib/errors';
import { gbToBytes, generateSubId } from './xui.utils';
import type {
  IXuiClient,
  CreateClientParams,
  XuiVpnClient,
  XuiInbound,
} from './xui.interface';

// ─── Internal API types ───────────────────────────────────────────────────────

type XuiApiResponse<T> = {
  success: boolean;
  msg: string;
  obj: T;
};

// Raw client object as stored in the inbound's `settings.clients` array.
type RawClient = {
  id: string;       // VLESS UUID
  flow: string;
  email: string;
  limitIp: number;
  totalGB: number;  // BYTES (not GB — despite the field name)
  expiryTime: number;
  enable: boolean;
  tgId: string;
  subId: string;
  reset: number;
};

// Raw inbound as returned by /panel/api/inbounds/list.
// `settings` is a JSON STRING containing { clients: RawClient[] }.
type RawInbound = {
  id: number;
  protocol: string;
  port: number;
  remark: string;
  settings: string;
};

type RawTraffic = {
  up: number;
  down: number;
  total: number;
};

// ─── XuiClient ────────────────────────────────────────────────────────────────

export class XuiClient implements IXuiClient {
  private readonly jar = new CookieJar();
  private readonly http: AxiosInstance;
  private loggedIn = false;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly inboundId: number,
  ) {
    this.http = wrapper(
      axios.create({
        baseURL: this.baseUrl,
        jar: this.jar,
        timeout: 15_000,
      }),
    );
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async login(): Promise<void> {
    const body = new URLSearchParams();
    body.append('username', this.username);
    body.append('password', this.password); // never logged below

    try {
      const res = await this.http.post<XuiApiResponse<null>>('/login', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!res.data.success) {
        throw new XuiPanelError(`Login failed: ${res.data.msg}`);
      }

      this.loggedIn = true;
      logger.info({ baseUrl: this.baseUrl }, 'XUI panel login successful');
    } catch (err) {
      if (err instanceof XuiPanelError) throw err;
      logger.error({ err, baseUrl: this.baseUrl }, 'XUI panel login request failed');
      throw new XuiPanelError(`Login request failed: ${(err as Error).message}`);
    }
  }

  // ─── Core request wrapper ──────────────────────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    if (!this.loggedIn) {
      await this.login();
    }

    try {
      const res = await this.http.request<XuiApiResponse<T>>({
        method,
        url: path,
        ...(body !== undefined ? { data: body, headers: { 'Content-Type': 'application/json' } } : {}),
      });

      logger.debug({ method, path, success: res.data.success }, 'XUI API response');

      if (!res.data.success) {
        if (!retried && this.isSessionExpired(res.data.msg)) {
          logger.info({ path }, 'XUI session expired — re-logging in');
          this.loggedIn = false;
          await this.login();
          return this.request<T>(method, path, body, true);
        }
        throw new XuiPanelError(res.data.msg || 'Unknown panel error');
      }

      return res.data.obj;
    } catch (err) {
      if (err instanceof XuiPanelError) throw err;

      if (isAxiosError(err)) {
        const status = err.response?.status;
        logger.error(
          { method, path, status, responseData: err.response?.data },
          'XUI API HTTP error',
        );

        if (status === 401 && !retried) {
          logger.info({ path }, 'XUI 401 — re-logging in');
          this.loggedIn = false;
          await this.login();
          return this.request<T>(method, path, body, true);
        }

        throw new XuiPanelError(
          `XUI request failed (HTTP ${status ?? 'unknown'}): ${err.message}`,
        );
      }

      logger.error({ err, method, path }, 'XUI unexpected error');
      throw new XuiPanelError(`Unexpected error: ${(err as Error).message}`);
    }
  }

  private isSessionExpired(msg: string): boolean {
    const m = msg.toLowerCase();
    return m.includes('login') || m.includes('unauthorized') || m.includes('session');
  }

  // ─── Inbounds ──────────────────────────────────────────────────────────────

  async listInbounds(): Promise<XuiInbound[]> {
    const raw = await this.request<RawInbound[]>('GET', '/panel/api/inbounds/list');
    return raw.map((i) => ({
      id: i.id,
      protocol: i.protocol,
      port: i.port,
      remark: i.remark,
    }));
  }

  // Fetch and parse clients from this.inboundId's settings JSON string.
  private async getRawClients(): Promise<RawClient[]> {
    const raw = await this.request<RawInbound[]>('GET', '/panel/api/inbounds/list');
    const inbound = raw.find((i) => i.id === this.inboundId);
    if (!inbound) {
      throw new XuiPanelError(
        `Inbound ID ${this.inboundId} not found on panel. Check XUI_INBOUND_ID in config.`,
      );
    }
    try {
      const parsed = JSON.parse(inbound.settings) as { clients?: RawClient[] };
      return parsed.clients ?? [];
    } catch {
      throw new XuiPanelError('Failed to parse inbound settings JSON from panel response');
    }
  }

  // ─── Client CRUD ───────────────────────────────────────────────────────────

  async createClient(params: CreateClientParams): Promise<XuiVpnClient> {
    const clientObj: RawClient = {
      id: params.uuid,
      flow: '',
      email: params.email,
      limitIp: params.limitIp ?? 0,
      totalGB: gbToBytes(params.totalGB), // API expects BYTES
      expiryTime: params.expiryTimeMs,
      enable: true,
      tgId: '',
      subId: params.subId ?? generateSubId(),
      reset: 0,
    };

    // `settings` MUST be a JSON string — not a nested object.
    await this.request<null>('POST', '/panel/api/inbounds/addClient', {
      id: this.inboundId,
      settings: JSON.stringify({ clients: [clientObj] }),
    });

    logger.info({ email: params.email, uuid: params.uuid }, 'XUI client created');

    return {
      id: 0, // panel doesn't return an internal ID from addClient
      email: params.email,
      uuid: params.uuid,
      enable: true,
      totalGB: params.totalGB,
      expiryTime: params.expiryTimeMs,
      up: 0n,
      down: 0n,
    };
  }

  async getClient(uuid: string): Promise<XuiVpnClient | null> {
    const clients = await this.getRawClients();
    const raw = clients.find((c) => c.id === uuid);
    if (!raw) return null;

    let up = 0n;
    let down = 0n;
    try {
      const traffic = await this.getClientTraffic(raw.email);
      up = traffic.up;
      down = traffic.down;
    } catch {
      // New clients may have no traffic record yet — treat as zero
    }

    return {
      id: 0,
      email: raw.email,
      uuid: raw.id,
      enable: raw.enable,
      totalGB: raw.totalGB === 0 ? 0 : raw.totalGB / 1024 ** 3,
      expiryTime: raw.expiryTime,
      up,
      down,
    };
  }

  async updateClient(uuid: string, params: Partial<CreateClientParams>): Promise<void> {
    const clients = await this.getRawClients();
    const current = clients.find((c) => c.id === uuid);
    if (!current) {
      throw new XuiPanelError(`Cannot update: client UUID ${uuid} not found in inbound ${this.inboundId}`);
    }

    const updated: RawClient = {
      ...current,
      ...(params.email !== undefined && { email: params.email }),
      ...(params.limitIp !== undefined && { limitIp: params.limitIp }),
      ...(params.totalGB !== undefined && { totalGB: gbToBytes(params.totalGB) }),
      ...(params.expiryTimeMs !== undefined && { expiryTime: params.expiryTimeMs }),
      ...(params.subId !== undefined && { subId: params.subId }),
    };

    await this.request<null>(`POST`, `/panel/api/inbounds/updateClient/${uuid}`, {
      id: this.inboundId,
      settings: JSON.stringify({ clients: [updated] }),
    });

    logger.info({ uuid }, 'XUI client updated');
  }

  async deleteClient(uuid: string): Promise<void> {
    await this.request<null>(
      'POST',
      `/panel/api/inbounds/${this.inboundId}/delClient/${uuid}`,
    );
    logger.info({ uuid }, 'XUI client deleted');
  }

  // ─── Traffic ───────────────────────────────────────────────────────────────

  async getClientTraffic(
    email: string,
  ): Promise<{ up: bigint; down: bigint; total: bigint }> {
    try {
      const obj = await this.request<RawTraffic | null>(
        'GET',
        `/panel/api/inbounds/getClientTraffics/${email}`,
      );

      if (!obj) return { up: 0n, down: 0n, total: 0n };

      return {
        up: BigInt(obj.up ?? 0),
        down: BigInt(obj.down ?? 0),
        total: BigInt(obj.total ?? 0),
      };
    } catch (err) {
      // Traffic record may not exist for newly created clients — treat as zero.
      logger.debug({ email, err }, 'getClientTraffic returned no data, treating as zero');
      return { up: 0n, down: 0n, total: 0n };
    }
  }

  async resetClientTraffic(email: string): Promise<void> {
    await this.request<null>(
      'POST',
      `/panel/api/inbounds/${this.inboundId}/resetClientTraffic/${email}`,
    );
    logger.info({ email }, 'XUI client traffic reset');
  }
}
