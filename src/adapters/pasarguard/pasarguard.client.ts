import { config } from '@/lib/config';
import { createHttpClient } from '@/lib/axios';
import { logger } from '@/lib/logger';
import type {
  IPasarGuardClient,
  CreateUserParams,
  ModifyUserParams,
  PasarGuardUser,
} from './pasarguard.interface';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PasarGuardClient implements IPasarGuardClient {
  private readonly http = createHttpClient(15_000, { direct: true });
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {
    this.http.defaults.baseURL = this.baseUrl;
  }

  async login(): Promise<void> {
    try {
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);
      params.append('grant_type', 'password');

      const res = await this.http.post('/api/admin/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      this.token = res.data.access_token;
      this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;

      logger.info({ baseUrl: this.baseUrl }, 'PasarGuard login successful');
    } catch (err: any) {
      logger.error({ err: err.message, baseUrl: this.baseUrl }, 'PasarGuard login failed');
      throw new Error(`PasarGuard login failed: ${err.message}`);
    }
  }

  private async getAuthHeader(): Promise<{ Authorization: string }> {
    if (!this.token || Date.now() >= this.tokenExpiresAt) {
      await this.login();
    }
    return { Authorization: `Bearer ${this.token}` };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: unknown,
    authRetried = false,
  ): Promise<T> {
    const headers = await this.getAuthHeader();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.http.request({
          method,
          url: path,
          data,
          headers,
          validateStatus: () => true,
        });

        if (res.status === 401 && !authRetried) {
          logger.warn('PasarGuard token expired, re-logging in');
          this.token = null;
          return this.request<T>(method, path, data, true);
        }

        if (res.status >= 400) {
          const msg = res.data?.detail ?? res.data?.msg ?? `HTTP ${res.status}`;
          if (res.status >= 500 && attempt < MAX_RETRIES) {
            logger.warn({ attempt, path, status: res.status }, `PasarGuard ${res.status}, retrying (${attempt}/${MAX_RETRIES})`);
            await delay(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw new Error(`PasarGuard API error: ${msg}`);
        }

        return res.data;
      } catch (err: any) {
        if (err.message?.startsWith('PasarGuard API error')) throw err;

        const isRetryable =
          err.code === 'ECONNABORTED' ||
          (err.message as string | undefined)?.toLowerCase().includes('timeout');

        if (isRetryable && attempt < MAX_RETRIES) {
          logger.warn({ attempt, path, err: err.message }, `PasarGuard timeout, retrying (${attempt}/${MAX_RETRIES})`);
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }

        throw new Error(`PasarGuard request failed: ${err.message}`);
      }
    }

    throw new Error('PasarGuard request failed: max retries exceeded');
  }

  async createUser(params: CreateUserParams): Promise<PasarGuardUser> {
    const body = {
      username: params.username,
      data_limit: params.dataLimitBytes === 0n ? 0 : Number(params.dataLimitBytes),
      expire: params.expireAt ? params.expireAt.toISOString() : null,
      status: 'active',
      group_ids: [params.groupId ?? config.PASARGUARD_GROUP_ID],
    };

    const raw = await this.request<any>('POST', '/api/user', body);
    return this.mapUser(raw);
  }

  async getUser(username: string): Promise<PasarGuardUser | null> {
    try {
      const raw = await this.request<any>('GET', `/api/user/${encodeURIComponent(username)}`);
      return this.mapUser(raw);
    } catch (err: any) {
      if (err.message.includes('404') || err.message.toLowerCase().includes('not found')) return null;
      throw err;
    }
  }

  async modifyUser(username: string, params: ModifyUserParams): Promise<PasarGuardUser> {
    const body: Record<string, any> = {};

    if (params.dataLimitBytes !== undefined) {
      body.data_limit = params.dataLimitBytes === 0n ? 0 : Number(params.dataLimitBytes);
    }
    if (params.expireAt !== undefined) {
      body.expire = params.expireAt ? params.expireAt.toISOString() : null;
    }
    if (params.status !== undefined) {
      body.status = params.status;
    }

    const raw = await this.request<any>('PUT', `/api/user/${encodeURIComponent(username)}`, body);
    return this.mapUser(raw);
  }

  async deleteUser(username: string): Promise<void> {
    await this.request('DELETE', `/api/user/${encodeURIComponent(username)}`);
  }

  async resetUserTraffic(username: string): Promise<PasarGuardUser> {
    const raw = await this.request<any>('POST', `/api/user/${encodeURIComponent(username)}/reset`);
    return this.mapUser(raw);
  }

  async getUserUsed(username: string): Promise<{ usedBytes: bigint }> {
    const user = await this.getUser(username);
    if (!user) throw new Error(`PasarGuard user ${username} not found`);
    return { usedBytes: user.usedTrafficBytes };
  }

  async listGroups(): Promise<Array<{ id: number; name: string }>> {
    const res = await this.request<any>('GET', '/api/groups/simple');
    return (res.groups ?? []).map((g: any) => ({ id: g.id, name: g.name }));
  }

  async listServers(): Promise<Array<{ id: string; name: string; location: string }>> {
    const groups = await this.listGroups();
    return groups.map((g) => ({ id: String(g.id), name: g.name, location: '' }));
  }

  private mapUser(raw: any): PasarGuardUser {
    let subscriptionUrl = raw.subscription_url ?? '';
    if (subscriptionUrl && !subscriptionUrl.startsWith('http')) {
      subscriptionUrl = `${this.baseUrl}${subscriptionUrl.startsWith('/') ? '' : '/'}${subscriptionUrl}`;
    }

    return {
      id: raw.id,
      username: raw.username,
      status: raw.status,
      usedTrafficBytes: BigInt(raw.used_traffic ?? 0),
      dataLimitBytes: BigInt(raw.data_limit ?? 0),
      expireAt: raw.expire
        ? (typeof raw.expire === 'number' ? new Date(raw.expire * 1000) : new Date(raw.expire))
        : null,
      subscriptionUrl,
      createdAt: new Date(raw.created_at),
    };
  }
}
