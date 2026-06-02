import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface User {
  id: string;
  username: string | null;
  firstName: string | null;
  isBanned: boolean;
  walletBalance: string;
  totalSpent: string;
  totalPurchases: number;
  createdAt: string;
}

interface ListResp {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

export function Users() {
  const qc                                          = useQueryClient();
  const [page, setPage]                             = useState(1);
  const [search, setSearch]                         = useState('');
  const [searchInput, setSearchInput]               = useState('');
  const [walletInput, setWalletInput]               = useState<Record<string, string>>({});
  const [walletOp, setWalletOp]                     = useState<Record<string, 'add' | 'deduct'>>({});

  const { data, isLoading } = useQuery<ListResp>({
    queryKey: ['users', page, search],
    queryFn: () => api.get('/users', { params: { page, limit: 20, search } }).then((r) => r.data),
  });

  const patchMutation = useMutation({
    mutationFn: (body: { id: string; payload: Record<string, unknown> }) =>
      api.patch(`/users/${body.id}`, body.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function handleWallet(u: User) {
    const amount = walletInput[u.id];
    if (!amount) return;
    const op = walletOp[u.id] ?? 'add';
    patchMutation.mutate({ id: u.id, payload: { walletDelta: amount, walletOp: op } });
    setWalletInput((prev) => ({ ...prev, [u.id]: '' }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <i
            className="ti ti-search"
            style={{
              position: 'absolute',
              left: '0.625rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-tertiary)',
              fontSize: '0.875rem',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2rem' }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by ID, @username or name…"
          />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSearch}>
          Search
        </button>
        {search && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
          >
            <i className="ti ti-x" />
            Clear
          </button>
        )}
        {data && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
            {data.total.toLocaleString()} users
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div className="empty-state">Loading…</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="empty-state">No users found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th style={{ textAlign: 'right' }}>Wallet</th>
                  <th style={{ textAlign: 'right' }}>Spent</th>
                  <th style={{ textAlign: 'center' }}>Services</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center', minWidth: 240 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 500 }}>
                          {u.firstName ?? u.username ?? '—'}
                        </span>
                        {u.username && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                            @{u.username}
                          </span>
                        )}
                        <span
                          className="mono"
                          style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}
                        >
                          {u.id}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(BigInt(u.walletBalance)).toLocaleString()} T
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {Number(BigInt(u.totalSpent)).toLocaleString()} T
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      {u.totalPurchases}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${u.isBanned ? 'badge-danger' : 'badge-success'}`}>
                        {u.isBanned ? 'Banned' : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {/* Wallet adjustment */}
                        <select
                          value={walletOp[u.id] ?? 'add'}
                          onChange={(e) =>
                            setWalletOp((prev) => ({ ...prev, [u.id]: e.target.value as 'add' | 'deduct' }))
                          }
                          className="form-select"
                          style={{ width: 52, padding: '0.25rem 1.5rem 0.25rem 0.375rem', fontSize: '0.75rem' }}
                        >
                          <option value="add">+</option>
                          <option value="deduct">−</option>
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={walletInput[u.id] ?? ''}
                          onChange={(e) =>
                            setWalletInput((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                          placeholder="amount"
                          className="form-input"
                          style={{ width: 72, padding: '0.25rem 0.375rem', fontSize: '0.75rem', textAlign: 'center' }}
                        />
                        <button
                          onClick={() => handleWallet(u)}
                          disabled={!walletInput[u.id]}
                          className="btn btn-info btn-sm"
                          style={{
                            background: 'var(--color-background-info)',
                            color: 'var(--color-text-info)',
                            border: '0.5px solid rgba(37,99,235,0.15)',
                          }}
                        >
                          Wallet
                        </button>

                        <button
                          onClick={() =>
                            patchMutation.mutate({ id: u.id, payload: { isBanned: !u.isBanned } })
                          }
                          className={`btn btn-sm ${u.isBanned ? 'btn-success' : 'btn-warning'}`}
                          style={
                            u.isBanned
                              ? {}
                              : { background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', border: '0.5px solid rgba(217,119,6,0.15)' }
                          }
                        >
                          {u.isBanned ? 'Unban' : 'Ban'}
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`Delete user ${u.id}?`)) deleteMutation.mutate(u.id);
                          }}
                          className="btn btn-danger btn-sm"
                        >
                          Delete
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
