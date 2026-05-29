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
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [walletInput, setWalletInput] = useState<Record<string, string>>({});
  const [walletOp, setWalletOp] = useState<Record<string, 'add' | 'deduct'>>({});

  const { data, isLoading } = useQuery<ListResp>({
    queryKey: ['users', page, search],
    queryFn: () =>
      api.get('/users', { params: { page, limit: 20, search } }).then((r) => r.data),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Users</h1>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="ID, @username or name"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
          />
          <button
            onClick={handleSearch}
            className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            Search
          </button>
          {search && (
            <button
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
              className="text-sm text-gray-500 hover:text-gray-800 px-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-right">Wallet</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center" style={{ minWidth: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.data.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{u.id}</td>
                  <td className="px-4 py-3 font-medium">{u.firstName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{u.username ? `@${u.username}` : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {Number(BigInt(u.walletBalance)).toLocaleString()} T
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(BigInt(u.totalSpent)).toLocaleString()} T
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.isBanned ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {u.isBanned ? 'Banned' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5 justify-center">
                      {/* Wallet adjustment */}
                      <select
                        value={walletOp[u.id] ?? 'add'}
                        onChange={(e) =>
                          setWalletOp((prev) => ({
                            ...prev,
                            [u.id]: e.target.value as 'add' | 'deduct',
                          }))
                        }
                        className="text-xs border rounded px-1 py-0.5"
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
                        className="w-20 border rounded text-xs px-1 py-0.5 text-center"
                      />
                      <button
                        onClick={() => handleWallet(u)}
                        disabled={!walletInput[u.id]}
                        className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
                      >
                        Wallet
                      </button>

                      {/* Ban / Unban */}
                      <button
                        onClick={() =>
                          patchMutation.mutate({ id: u.id, payload: { isBanned: !u.isBanned } })
                        }
                        className={`text-xs px-2 py-0.5 rounded ${
                          u.isBanned
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                        }`}
                      >
                        {u.isBanned ? 'Unban' : 'Ban'}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => {
                          if (confirm(`Delete user ${u.id}?`)) deleteMutation.mutate(u.id);
                        }}
                        className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        Delete
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
                {data.total} users · page {page} of {totalPages}
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
