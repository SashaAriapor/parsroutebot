import axios, { type AxiosInstance } from 'axios';
import { getProxyAgent } from '@/lib/proxy';

function createAxiosInstance(options: { timeout?: number } = {}): AxiosInstance {
  const instance = axios.create({
    timeout: options.timeout ?? 15_000,
  });

  const agent = getProxyAgent();
  if (agent) {
    instance.defaults.httpsAgent = agent;
    instance.defaults.httpAgent = agent;
    instance.defaults.proxy = false;
  }

  return instance;
}

export const httpClient = createAxiosInstance();

export function createHttpClient(timeout: number): AxiosInstance {
  return createAxiosInstance({ timeout });
}
