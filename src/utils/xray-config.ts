interface StreamSettings {
  network: string;
  security: string;
  tlsSettings?: { serverName: string; allowInsecure: boolean };
  realitySettings?: { serverName: string; fingerprint: string; publicKey: string; shortId: string };
  wsSettings?: { path: string; headers: Record<string, string> };
  grpcSettings?: { serviceName: string };
}

function buildStreamSettings(params: URLSearchParams, fallbackHost: string): StreamSettings {
  const network = params.get('type') ?? 'tcp';
  const security = params.get('security') ?? 'none';
  const sni = params.get('sni') ?? params.get('host') ?? fallbackHost;

  const stream: StreamSettings = { network, security };

  if (security === 'tls') {
    stream.tlsSettings = { serverName: sni, allowInsecure: false };
  } else if (security === 'reality') {
    stream.realitySettings = {
      serverName: sni,
      fingerprint: params.get('fp') ?? 'chrome',
      publicKey: params.get('pbk') ?? '',
      shortId: params.get('sid') ?? '',
    };
  }

  if (network === 'ws') {
    const wsHost = params.get('host') ?? sni;
    stream.wsSettings = {
      path: decodeURIComponent(params.get('path') ?? '/'),
      headers: { Host: wsHost },
    };
  } else if (network === 'grpc') {
    stream.grpcSettings = { serviceName: params.get('serviceName') ?? '' };
  }

  return stream;
}

function buildVlessOutbound(url: URL): object {
  const host = url.hostname;
  const port = parseInt(url.port, 10);
  const params = url.searchParams;

  return {
    protocol: 'vless',
    tag: 'proxy',
    settings: {
      vnext: [{
        address: host,
        port,
        users: [{
          id: url.username,
          encryption: 'none',
          flow: params.get('flow') ?? '',
        }],
      }],
    },
    streamSettings: buildStreamSettings(params, host),
  };
}

function buildVmessOutbound(link: string): object {
  const b64 = link.slice('vmess://'.length);
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as Record<string, string>;

  const host = json['add'] ?? '';
  const port = parseInt(json['port'] ?? '443', 10);
  const network = json['net'] ?? 'tcp';
  const tlsVal = json['tls'] ?? '';
  const security = tlsVal === 'tls' ? 'tls' : 'none';
  const sni = json['sni'] ?? json['host'] ?? host;

  const stream: StreamSettings = { network, security };
  if (security === 'tls') {
    stream.tlsSettings = { serverName: sni, allowInsecure: false };
  }
  if (network === 'ws') {
    stream.wsSettings = {
      path: json['path'] ?? '/',
      headers: { Host: json['host'] ?? sni },
    };
  } else if (network === 'grpc') {
    stream.grpcSettings = { serviceName: json['path'] ?? '' };
  }

  return {
    protocol: 'vmess',
    tag: 'proxy',
    settings: {
      vnext: [{
        address: host,
        port,
        users: [{
          id: json['id'] ?? '',
          alterId: parseInt(json['aid'] ?? '0', 10) || 0,
          security: 'auto',
        }],
      }],
    },
    streamSettings: stream,
  };
}

function buildTrojanOutbound(url: URL): object {
  const host = url.hostname;
  const port = parseInt(url.port, 10);
  const params = url.searchParams;

  return {
    protocol: 'trojan',
    tag: 'proxy',
    settings: {
      servers: [{
        address: host,
        port,
        password: decodeURIComponent(url.username),
      }],
    },
    streamSettings: buildStreamSettings(params, host),
  };
}

export function generateXrayConfig(link: string): object {
  let outbound: object;

  if (link.startsWith('vmess://')) {
    outbound = buildVmessOutbound(link);
  } else if (link.startsWith('vless://')) {
    outbound = buildVlessOutbound(new URL(link));
  } else if (link.startsWith('trojan://')) {
    outbound = buildTrojanOutbound(new URL(link));
  } else {
    throw new Error(`Unsupported V2Ray link format: ${link.split('://')[0]}://`);
  }

  return {
    log: { loglevel: 'error' },
    inbounds: [{
      port: 10808,
      listen: '127.0.0.1',
      protocol: 'socks',
      settings: { auth: 'noauth', udp: true },
    }],
    outbounds: [
      outbound,
      { protocol: 'freedom', tag: 'direct' },
    ],
  };
}
