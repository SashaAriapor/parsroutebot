import axios, { type AxiosInstance } from 'axios';
import { getProxyAgent } from '@/lib/proxy';

function createAxiosInstance(options: { timeout?: number; direct?: boolean } = {}): AxiosInstance {
  const instance = axios.create({
    timeout: options.timeout ?? 15_000,
  });

  if (!options.direct) {
    const agent = getProxyAgent();
    if (agent) {
      instance.defaults.httpsAgent = agent;
      instance.defaults.httpAgent = agent;
      instance.defaults.proxy = false;
    }
  }

  return instance;
}

export const httpClient = createAxiosInstance();

export function createHttpClient(timeout: number, opts?: { direct?: boolean }): AxiosInstance {
  return createAxiosInstance({ timeout, direct: opts?.direct });
}
