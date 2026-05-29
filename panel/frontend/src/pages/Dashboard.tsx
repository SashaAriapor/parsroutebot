import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
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

function fmt(toman: string) {
  const n = Number(BigInt(toman));
  return n.toLocaleString('en-US') + ' T';
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
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

  const topUsers = useQuery<{ id: string; username: string | null; firstName: string | null; totalSpent: string; totalPurchases: number }[]>({
    queryKey: ['stats-top-users'],
    queryFn: () => api.get('/stats/top-users').then((r) => r.data),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      {overview.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : overview.data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={overview.data.totalUsers} />
          <StatCard label="Active Services" value={overview.data.activeServices} />
          <StatCard label="Revenue Today" value={fmt(overview.data.revenueToday)} />
          <StatCard label="Revenue This Month" value={fmt(overview.data.revenueMonth)} />
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Revenue — last 30 days</h2>
        {chart.data ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chart.data.map((r) => ({ ...r, rev: Number(BigInt(r.revenue)) }))}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v / 1000).toFixed(0) + 'K'} />
              <Tooltip formatter={(v: number) => v.toLocaleString('en-US') + ' T'} />
              <Area type="monotone" dataKey="rev" stroke="#6366f1" fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm">Loading chart…</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Top Customers</h2>
        {topUsers.data ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">ID</th>
                <th className="pb-2">Name</th>
                <th className="pb-2 text-right">Total Spent</th>
                <th className="pb-2 text-right">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.data.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 text-gray-400">{u.id}</td>
                  <td className="py-2">{u.firstName ?? u.username ?? '—'}</td>
                  <td className="py-2 text-right">{fmt(u.totalSpent)}</td>
                  <td className="py-2 text-right">{u.totalPurchases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">Loading…</p>
        )}
      </div>
    </div>
  );
}
