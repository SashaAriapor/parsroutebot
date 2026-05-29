import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Service {
  id: number;
  email: string;
  status: string;
  totalGB: number;
  expiryAt: string | null;
  createdAt: string;
  user: { id: string; username: string | null; firstName: string | null };
  server: { id: number; name: string; flag: string | null };
}

interface ListResp {
  data: Service[];
  total: number;
  page: number;
  limit: number;
}

const filters = ['all', 'active', 'expired', 'disabled'] as const;
type Filter = (typeof filters)[number];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-gray-100 text-gray-600',
  DISABLED: 'bg-yellow-100 text-yellow-700',
  DELETED: 'bg-red-100 text-red-700',
};

export function Services() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [extendDays, setExtendDays] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery<ListResp>({
    queryKey: ['services', page, filter],
    queryFn: () =>
      api.get('/services', { params: { page, limit: 20, filter } }).then((r) => r.data),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      api.patch(`/services/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Services</h1>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`capitalize text-xs px-3 py-1.5 rounded-lg border ${
                filter === f
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Server</th>
                <th className="px-4 py-3 text-right">GB</th>
                <th className="px-4 py-3 text-left">Expiry</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.data.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.email}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.user.firstName ?? s.user.username ?? s.user.id}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.server.flag} {s.server.name}
                  </td>
                  <td className="px-4 py-3 text-right">{s.totalGB}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.expiryAt ? new Date(s.expiryAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? ''}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="number"
                        min="1"
                        value={extendDays[s.id] ?? ''}
                        onChange={(e) => setExtendDays((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="days"
                        className="w-14 border rounded text-xs px-1 py-0.5 text-center"
                      />
                      <button
                        onClick={() =>
                          patchMutation.mutate({
                            id: s.id,
                            body: { extendDays: parseInt(extendDays[s.id] ?? '0', 10) },
                          })
                        }
                        disabled={!extendDays[s.id]}
                        className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                      >
                        Extend
                      </button>
                      <button
                        onClick={() =>
                          patchMutation.mutate({
                            id: s.id,
                            body: { status: s.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' },
                          })
                        }
                        className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                      >
                        {s.status === 'DISABLED' ? 'Enable' : 'Disable'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete service ${s.email}?`)) deleteMutation.mutate(s.id);
                        }}
                        className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-xs text-gray-500">
                {data.total} services · page {page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
