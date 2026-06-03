import { SocksProxyAgent } from 'socks-proxy-agent';
import { config } from '@/lib/config';

let _agent: SocksProxyAgent | null = null;

export function resetProxyAgent(): void {
  _agent = null;
}

export function getProxyAgent(): SocksProxyAgent | null {
  if (!config.SOCKS5_HOST) return null;

  if (!_agent) {
    const auth = config.SOCKS5_USER && config.SOCKS5_PASS
      ? `${config.SOCKS5_USER}:${config.SOCKS5_PASS}@`
      : '';
    const url = `socks5h://${auth}${config.SOCKS5_HOST}:${config.SOCKS5_PORT ?? 1080}`;
    _agent = new SocksProxyAgent(url);
  }

  return _agent;
}

export function isProxyEnabled(): boolean {
  return !!config.SOCKS5_HOST;
}
