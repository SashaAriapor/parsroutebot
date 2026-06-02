import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ServiceResult {
  status: 'ok' | 'error';
  latency?: number;
  ip?: string;
  port?: number;
  url?: string;
  uptime?: number;
  note?: string;
}

interface HealthData {
  proxy:      ServiceResult;
  pasarguard: ServiceResult;
  redis:      ServiceResult;
  database:   ServiceResult;
  ton:        ServiceResult;
  bot:        ServiceResult & { uptime?: number };
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function latencyClass(ms: number): string {
  if (ms > 500) return 'badge-warning';
  return 'badge-success';
}

function ServiceCard({
  icon,
  name,
  result,
  extra,
}: {
  icon: string;
  name: string;
  result: ServiceResult | undefined;
  extra?: string;
}) {
  if (!result) return null;
  const ok = result.status === 'ok';

  return (
    <div className="card" style={{ padding: '1rem 1.125rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: 32, height: 32,
              borderRadius: 'var(--border-radius-md)',
              background: ok ? 'var(--color-background-success)' : 'var(--color-background-danger)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i
              className={`ti ${icon}`}
              style={{
                fontSize: '0.9rem',
                color: ok ? 'var(--color-text-success)' : 'var(--color-text-danger)',
              }}
            />
          </div>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
            {name}
          </span>
        </div>
        <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>
          <span className={`dot ${ok ? 'dot-ok' : 'dot-error'}`} />
          {ok ? 'OK' : 'Error'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {result.latency !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Latency</span>
            <span className={`badge badge-sq ${latencyClass(result.latency)}`}>
              {result.latency} ms
            </span>
          </div>
        )}
        {result.uptime !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Uptime</span>
            <span
              className="badge badge-sq badge-neutral"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatUptime(result.uptime)}
            </span>
          </div>
        )}
        {extra && (
          <div
            className="mono"
            style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', wordBreak: 'break-all', marginTop: 2 }}
          >
            {extra}
          </div>
        )}
        {!ok && result.note && (
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-danger)',
              wordBreak: 'break-all',
              marginTop: 2,
            }}
          >
            {result.note}
          </div>
        )}
      </div>
    </div>
  );
}

export function Health() {
  const qc                                    = useQueryClient();
  const [restarting, setRestarting]           = useState(false);
  const [reconnecting, setReconnecting]       = useState(false);
  const [confirmRestart, setConfirmRestart]   = useState(false);
  const [actionMsg, setActionMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [secondsAgo, setSecondsAgo]           = useState(0);

  const { data, isLoading, dataUpdatedAt, refetch } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => api.get('/health').then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!dataUpdatedAt) return;
    const tick = () => setSecondsAgo(Math.round((Date.now() - dataUpdatedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  const handleRestart = async () => {
    if (!confirmRestart) { setConfirmRestart(true); return; }
    setConfirmRestart(false);
    setRestarting(true);
    try {
      await api.post('/health/restart');
      setActionMsg({ ok: true, text: 'Bot is restarting…' });
    } catch {
      setActionMsg({ ok: false, text: 'Failed to restart bot' });
    } finally {
      setRestarting(false);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handleReconnectProxy = async () => {
    setReconnecting(true);
    try {
      const r = await api.post<ServiceResult & { ok: boolean }>('/health/proxy/reconnect');
      setActionMsg(
        r.data.ok
          ? { ok: true, text: `Proxy connected (${r.data.latency ?? '–'} ms)` }
          : { ok: false, text: `Failed: ${r.data.note ?? 'Connection error'}` },
      );
      qc.invalidateQueries({ queryKey: ['health'] });
    } catch {
      setActionMsg({ ok: false, text: 'Failed to reconnect proxy' });
    } finally {
      setReconnecting(false);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const SERVICES: { key: keyof HealthData; icon: string; name: string; extraFn?: (d: HealthData) => string }[] = [
    { key: 'bot',        icon: 'ti-brand-telegram',   name: 'Bot' },
    { key: 'proxy',      icon: 'ti-shield-lock',       name: 'SOCKS5 Proxy', extraFn: (d) => d.proxy.ip ? `${d.proxy.ip}:${d.proxy.port ?? 1080}` : '' },
    { key: 'pasarguard', icon: 'ti-server',            name: 'Pasargad Panel', extraFn: (d) => d.pasarguard.url ?? '' },
    { key: 'redis',      icon: 'ti-database',          name: 'Redis' },
    { key: 'database',   icon: 'ti-table',             name: 'Database' },
    { key: 'ton',        icon: 'ti-currency-dollar',   name: 'TON Poller' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>
          {dataUpdatedAt
            ? secondsAgo === 0
              ? 'Just checked'
              : `Last checked ${secondsAgo}s ago`
            : 'Checking…'}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => refetch()}
          disabled={isLoading}
          style={{ marginLeft: 'auto' }}
        >
          <i className={`ti ti-refresh${isLoading ? ' spin' : ''}`} />
          {isLoading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {/* Service cards grid */}
      {isLoading && !data ? (
        <div className="empty-state">Checking services…</div>
      ) : data ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {SERVICES.map(({ key, icon, name, extraFn }) => (
            <ServiceCard
              key={key}
              icon={icon}
              name={name}
              result={data[key]}
              extra={extraFn ? extraFn(data) : undefined}
            />
          ))}
        </div>
      ) : null}

      {/* Action panel */}
      <div className="card" style={{ padding: '1.125rem', maxWidth: 420 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.875rem', color: 'var(--color-text-primary)' }}>
          Actions
        </div>

        {actionMsg && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--border-radius-md)',
              background: actionMsg.ok ? 'var(--color-background-success)' : 'var(--color-background-danger)',
              color: actionMsg.ok ? 'var(--color-text-success)' : 'var(--color-text-danger)',
              fontSize: '0.8125rem',
              marginBottom: '0.75rem',
            }}
          >
            <i className={`ti ${actionMsg.ok ? 'ti-check' : 'ti-alert-circle'}`} style={{ marginRight: '0.375rem' }} />
            {actionMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {confirmRestart ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-warning)' }}>
                Are you sure?
              </span>
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="btn btn-danger btn-sm"
              >
                {restarting ? 'Restarting…' : 'Yes, Restart'}
              </button>
              <button
                onClick={() => setConfirmRestart(false)}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleRestart}
              disabled={restarting}
              className="btn btn-danger btn-sm"
              style={{ justifyContent: 'flex-start' }}
            >
              <i className="ti ti-refresh-alert" />
              Restart Bot
            </button>
          )}

          <button
            onClick={handleReconnectProxy}
            disabled={reconnecting}
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: 'flex-start' }}
          >
            <i className="ti ti-plug" />
            {reconnecting ? 'Reconnecting…' : 'Reconnect Proxy'}
          </button>
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
