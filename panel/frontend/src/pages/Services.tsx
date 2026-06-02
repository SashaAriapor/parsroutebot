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

const FILTERS = ['all', 'active', 'expired', 'disabled'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   'badge-success',
  EXPIRED:  'badge-neutral',
  DISABLED: 'badge-warning',
  DELETED:  'badge-danger',
};

export function Services() {
  const qc                                      = useQueryClient();
  const [page, setPage]                         = useState(1);
  const [filter, setFilter]                     = useState<Filter>('all');
  const [extendDays, setExtendDays]             = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery<ListResp>({
    queryKey: ['services', page, filter],
    queryFn: () =>
      api.get('/services', { params: { page, limit: 20, filter } }).then((r) => r.data),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => api.patch(`/services/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
        {data && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
            {data.total.toLocaleString()} services
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div className="empty-state">Loading…</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="empty-state">No services found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>User</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Volume</th>
                  <th>Expires</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span
                        className="mono"
                        style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                      >
                        {s.email}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {s.user.firstName ?? s.user.username ?? s.user.id}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {s.server.flag ? `${s.server.flag} ` : ''}{s.server.name}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {s.totalGB} GB
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                      {s.expiryAt ? new Date(s.expiryAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${STATUS_BADGE[s.status] ?? 'badge-neutral'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={extendDays[s.id] ?? ''}
                          onChange={(e) =>
                            setExtendDays((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          placeholder="days"
                          className="form-input"
                          style={{ width: 60, padding: '0.25rem 0.375rem', fontSize: '0.75rem', textAlign: 'center' }}
                        />
                        <button
                          onClick={() =>
                            patchMutation.mutate({
                              id: s.id,
                              body: { extendDays: parseInt(extendDays[s.id] ?? '0', 10) },
                            })
                          }
                          disabled={!extendDays[s.id]}
                          className="btn btn-sm"
                          style={{
                            background: 'var(--color-background-info)',
                            color: 'var(--color-text-info)',
                            border: '0.5px solid rgba(37,99,235,0.15)',
                          }}
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
                          className="btn btn-sm"
                          style={{
                            background: 'var(--color-background-warning)',
                            color: 'var(--color-text-warning)',
                            border: '0.5px solid rgba(217,119,6,0.15)',
                          }}
                        >
                          {s.status === 'DISABLED' ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete service ${s.email}?`)) deleteMutation.mutate(s.id);
                          }}
                          className="btn btn-danger btn-sm"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              borderTop: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-secondary)',
            }}
          >
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>
              Page {page} of {totalPages} · {data.total} total
            </span>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-ghost btn-sm"
              >
                <i className="ti ti-chevron-left" />
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-ghost btn-sm"
              >
                Next
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
