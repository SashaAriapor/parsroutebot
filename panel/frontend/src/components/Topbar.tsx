import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const PAGE_TITLES: Record<string, string> = {
  '/':           'Dashboard',
  '/users':      'Users',
  '/services':   'Services',
  '/categories': 'Categories',
  '/logs':       'Logs',
  '/health':     'Health',
  '/settings':   'Settings',
};

interface HealthData {
  bot:      { status: 'ok' | 'error' };
  proxy:    { status: 'ok' | 'error'; latency?: number };
}

export function Topbar() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? 'Admin';

  const { data: health } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => api.get('/health').then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const botOk   = health?.bot?.status === 'ok';
  const proxyOk = health?.proxy?.status === 'ok';

  return (
    <div className="topbar">
      <h1
        style={{
          margin: 0,
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          flex: 1,
        }}
      >
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {health && (
          <>
            <StatusPill ok={botOk} label="Bot" />
            <StatusPill ok={proxyOk} label="Proxy" />
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}
      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
    >
      <span className={`dot ${ok ? 'dot-ok' : 'dot-error'}`} />
      {label} {ok ? 'Online' : 'Offline'}
    </span>
  );
}
