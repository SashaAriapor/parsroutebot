import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Overview {
  totalUsers: number;
  activeServices: number;
  revenueToday: string;
  revenueMonth: string;
}

interface ChartRow {
  date: string;
  revenue: string;
}

interface TopUser {
  id: string;
  username: string | null;
  firstName: string | null;
  totalSpent: string;
  totalPurchases: number;
}

function fmt(toman: string) {
  const n = Number(BigInt(toman));
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M T';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K T';
  return n.toLocaleString('en-US') + ' T';
}

function initials(u: TopUser) {
  const name = u.firstName ?? u.username ?? '?';
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  ['var(--color-background-info)',    'var(--color-text-info)'],
  ['var(--color-background-success)', 'var(--color-text-success)'],
  ['var(--color-background-warning)', 'var(--color-text-warning)'],
  ['var(--color-background-danger)',  'var(--color-text-danger)'],
  ['var(--color-background-tertiary)','var(--color-text-secondary)'],
];

function MetricCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  change,
  up,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  change?: string;
  up?: boolean;
}) {
  return (
    <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          style={{
            width: 36, height: 36,
            borderRadius: 'var(--border-radius-md)',
            background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <i className={`ti ${icon}`} style={{ color: iconColor, fontSize: '1rem' }} />
        </div>
        {change && (
          <span className={`badge badge-sq ${up ? 'badge-success' : 'badge-danger'}`}>
            <i className={`ti ${up ? 'ti-trending-up' : 'ti-trending-down'}`} style={{ fontSize: '0.65rem' }} />
            {change}
          </span>
        )}
      </div>
      <div>
        <div
          style={{
            fontSize: '1.375rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function SalesBarChart({ data }: { data: ChartRow[] }) {
  const values = data.map((r) => Number(BigInt(r.revenue)));
  const max = Math.max(...values, 1);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '3px',
          height: '140px',
        }}
      >
        {data.map((r, i) => {
          const pct = Math.max((values[i] / max) * 100, 2);
          const isLast = i === data.length - 1;
          return (
            <div
              key={r.date}
              title={`${r.date}: ${values[i].toLocaleString()} T`}
              style={{
                flex: 1,
                height: `${pct}%`,
                background: isLast
                  ? 'var(--color-text-primary)'
                  : 'var(--color-background-tertiary)',
                borderRadius: '3px 3px 0 0',
                cursor: 'default',
                minHeight: 2,
                transition: 'background 0.15s',
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          fontSize: '0.65rem',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const overview = useQuery<Overview>({
    queryKey: ['stats-overview'],
    queryFn: () => api.get('/stats/overview').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const chart = useQuery<ChartRow[]>({
    queryKey: ['stats-chart'],
    queryFn: () => api.get('/stats/chart').then((r) => r.data),
  });

  const topUsers = useQuery<TopUser[]>({
    queryKey: ['stats-top-users'],
    queryFn: () => api.get('/stats/top-users').then((r) => r.data),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        <MetricCard
          icon="ti-users"
          iconBg="var(--color-background-info)"
          iconColor="var(--color-text-info)"
          label="Total Users"
          value={overview.data?.totalUsers ?? '—'}
        />
        <MetricCard
          icon="ti-wifi"
          iconBg="var(--color-background-success)"
          iconColor="var(--color-text-success)"
          label="Active Services"
          value={overview.data?.activeServices ?? '—'}
        />
        <MetricCard
          icon="ti-currency-dollar"
          iconBg="var(--color-background-warning)"
          iconColor="var(--color-text-warning)"
          label="Revenue Today"
          value={overview.data ? fmt(overview.data.revenueToday) : '—'}
        />
        <MetricCard
          icon="ti-chart-bar"
          iconBg="var(--color-background-danger)"
          iconColor="var(--color-text-danger)"
          label="This Month"
          value={overview.data ? fmt(overview.data.revenueMonth) : '—'}
        />
      </div>

      {/* Bar chart */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            Sales — last 30 days
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
            Revenue (Toman)
          </span>
        </div>
        {chart.data && chart.data.length > 0 ? (
          <SalesBarChart data={chart.data} />
        ) : (
          <div className="empty-state" style={{ padding: '2rem' }}>
            {chart.isLoading ? 'Loading chart…' : 'No data'}
          </div>
        )}
      </div>

      {/* Bottom two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Top Customers */}
        <div className="card">
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <i
              className="ti ti-trophy"
              style={{ color: 'var(--color-text-warning)', fontSize: '0.9rem' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Top Customers</span>
          </div>
          {topUsers.isLoading ? (
            <div className="empty-state">Loading…</div>
          ) : (topUsers.data ?? []).length === 0 ? (
            <div className="empty-state">No data</div>
          ) : (
            <div style={{ padding: '0.5rem 0' }}>
              {(topUsers.data ?? []).map((u, i) => {
                const [bg, fg] = AVATAR_COLORS[i % AVATAR_COLORS.length];
                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.5rem 1.25rem',
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        fontSize: '0.75rem',
                        color: 'var(--color-text-tertiary)',
                        fontWeight: 600,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="avatar-initials"
                      style={{ background: bg, color: fg }}
                    >
                      {initials(u)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {u.firstName ?? u.username ?? u.id}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                        {u.totalPurchases} services
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      {fmt(u.totalSpent)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Referrers — placeholder */}
        <div className="card">
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <i
              className="ti ti-share"
              style={{ color: 'var(--color-text-info)', fontSize: '0.9rem' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Top Referrers</span>
          </div>
          <div className="empty-state">
            <i
              className="ti ti-link"
              style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}
            />
            Referral data coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
