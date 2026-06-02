import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Category {
  id: number;
  nameFa: string;
  pricePerGb: string;
  serverId: string;
  serverName: string;
  uuidPrefix: string;
  hwidLimit: number;
  userChoosesGb: boolean;
  volumes: string;
  unlimitedPrice: string;
  isActive: boolean;
  createdAt: string;
}

interface Server {
  id: string;
  name: string;
  location: string;
}

interface PackageRow {
  gb: string;
  price: string;
}

const EMPTY_FORM = {
  nameFa: '',
  pricePerGb: '',
  serverId: '',
  serverName: '',
  uuidPrefix: '1',
  hwidLimit: '0',
  userChoosesGb: true,
  packages: [] as PackageRow[],
  isActive: true,
};
type FormData = typeof EMPTY_FORM;

function parseVolumesToPackages(volumes: string): PackageRow[] {
  if (!volumes) return [];
  try {
    const parsed = JSON.parse(volumes) as Array<{ gb: number; price: number }>;
    if (Array.isArray(parsed)) {
      return parsed.map((p) => ({ gb: String(p.gb), price: String(p.price) }));
    }
  } catch {
    // legacy CSV — prices can't be recovered
  }
  return [];
}

function CategoryCard({
  cat,
  onEdit,
  onDelete,
}: {
  cat: Category;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  const isTunnel = cat.userChoosesGb;

  let packageCount = 0;
  if (!isTunnel && cat.volumes) {
    try {
      const parsed = JSON.parse(cat.volumes);
      if (Array.isArray(parsed)) packageCount = parsed.length;
    } catch {
      packageCount = cat.volumes.split(',').filter(Boolean).length;
    }
  }

  return (
    <div
      className="card"
      style={{ padding: '1rem 1.125rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}
    >
      <div
        style={{
          width: 40, height: 40,
          borderRadius: 'var(--border-radius-md)',
          background: isTunnel ? 'var(--color-background-info)' : 'var(--color-background-success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <i
          className={`ti ${isTunnel ? 'ti-wifi' : 'ti-antenna'}`}
          style={{
            fontSize: '1rem',
            color: isTunnel ? 'var(--color-text-info)' : 'var(--color-text-success)',
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
            {cat.nameFa}
          </span>
          <span className={`badge badge-sq ${cat.isActive ? 'badge-success' : 'badge-neutral'}`}>
            {cat.isActive ? 'Active' : 'Inactive'}
          </span>
          <span className={`badge badge-sq ${isTunnel ? 'badge-info' : 'badge-success'}`}>
            {isTunnel ? 'Tunnel' : 'Direct'}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {isTunnel && (
            <Tag icon="ti-currency-dollar" label={`${Number(cat.pricePerGb).toLocaleString()} /GB`} />
          )}
          {!isTunnel && packageCount > 0 && (
            <Tag icon="ti-package" label={`${packageCount} packages`} />
          )}
          <Tag icon="ti-device-laptop" label={`HWID: ${cat.hwidLimit === 0 ? '∞' : cat.hwidLimit}`} />
          <Tag icon="ti-id" label={`Group: ${cat.serverId}`} />
          <Tag icon="ti-hash" label={`UUID: ${cat.uuidPrefix}`} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
        <button className="btn-icon" onClick={() => onEdit(cat)} title="Edit">
          <i className="ti ti-edit" style={{ fontSize: '0.875rem' }} />
        </button>
        <button
          className="btn-icon"
          onClick={() => onDelete(cat)}
          title="Delete"
          style={{ color: 'var(--color-text-danger)' }}
        >
          <i className="ti ti-trash" style={{ fontSize: '0.875rem' }} />
        </button>
      </div>
    </div>
  );
}

function Tag({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      className="badge badge-sq badge-neutral"
      style={{ fontWeight: 400, fontFamily: 'inherit', fontSize: '0.7rem' }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: '0.65rem' }} />
      {label}
    </span>
  );
}

export function Categories() {
  const qc                              = useQueryClient();
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState<number | null>(null);
  const [form, setForm]                 = useState<FormData>(EMPTY_FORM);
  const [error, setError]               = useState('');

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ['category-servers'],
    queryFn: () => api.get('/categories/servers').then((r) => r.data),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/categories', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); resetForm(); },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to save'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/categories/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); resetForm(); },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to delete'),
  });

  function resetForm() {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditId(null);
    setError('');
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setForm({
      nameFa: cat.nameFa,
      pricePerGb: cat.pricePerGb,
      serverId: cat.serverId,
      serverName: cat.serverName,
      uuidPrefix: cat.uuidPrefix,
      hwidLimit: String(cat.hwidLimit),
      userChoosesGb: cat.userChoosesGb,
      packages: cat.userChoosesGb ? [] : parseVolumesToPackages(cat.volumes),
      isActive: cat.isActive,
    });
    setEditId(cat.id);
    setError('');
    setShowForm(true);
  }

  function handleServerChange(serverId: string) {
    const srv = servers.find((s) => s.id === serverId);
    setForm((f) => ({ ...f, serverId, serverName: srv ? srv.name : f.serverName }));
  }

  function addPackage() {
    setForm((f) => ({ ...f, packages: [...f.packages, { gb: '', price: '' }] }));
  }

  function updatePackage(idx: number, field: 'gb' | 'price', value: string) {
    setForm((f) => {
      const packages = f.packages.map((p, i) => i === idx ? { ...p, [field]: value } : p);
      return { ...f, packages };
    });
  }

  function removePackage(idx: number) {
    setForm((f) => ({ ...f, packages: f.packages.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.nameFa.trim()) { setError('Name is required'); return; }
    if (!form.serverId)      { setError('Server selection is required'); return; }

    if (form.userChoosesGb) {
      if (!form.pricePerGb || parseInt(form.pricePerGb, 10) <= 0) {
        setError('Enter a valid price per GB'); return;
      }
    } else {
      if (form.packages.length === 0) { setError('Add at least one package'); return; }
      for (const pkg of form.packages) {
        const gb = parseInt(pkg.gb, 10);
        const price = parseInt(pkg.price, 10);
        if (isNaN(gb) || gb < 0)     { setError('Each package must have a valid GB value (0 = unlimited)'); return; }
        if (isNaN(price) || price <= 0) { setError('Each package must have a valid price'); return; }
      }
    }

    const volumes = form.userChoosesGb
      ? ''
      : JSON.stringify(form.packages.map((p) => ({ gb: parseInt(p.gb, 10), price: parseInt(p.price, 10) })));

    const payload: Record<string, unknown> = {
      nameFa:        form.nameFa.trim(),
      pricePerGb:    form.userChoosesGb ? form.pricePerGb : '0',
      serverId:      form.serverId,
      serverName:    form.serverName || form.serverId,
      uuidPrefix:    form.uuidPrefix.trim() || '1',
      hwidLimit:     parseInt(form.hwidLimit, 10) || 0,
      userChoosesGb: form.userChoosesGb,
      volumes,
      unlimitedPrice: '0',
      isActive:      form.isActive,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {isLoading ? '…' : `${categories.length} categories`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="ti ti-plus" />
          New Category
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
              {editId !== null ? 'Edit Category' : 'New Category'}
            </span>
            <button className="btn-icon" onClick={resetForm}>
              <i className="ti ti-x" style={{ fontSize: '0.875rem' }} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Service type toggle — first so it drives what fields appear */}
            <div style={{ marginBottom: '0.875rem' }}>
              <label className="form-label">Service Type</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { value: true,  label: 'Tunnel (user picks GB)' },
                  { value: false, label: 'Direct (preset packages)' },
                ].map(({ value, label }) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, userChoosesGb: value }))}
                    className={`btn btn-sm ${form.userChoosesGb === value ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Common fields grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
              <div>
                <label className="form-label">Persian Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.nameFa}
                  onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))}
                  placeholder="e.g. تانل آلمان"
                  required
                  dir="rtl"
                />
              </div>

              {/* Price per GB — Tunnel only */}
              {form.userChoosesGb && (
                <div>
                  <label className="form-label">Price per GB (Toman)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={form.pricePerGb}
                    onChange={(e) => setForm((f) => ({ ...f, pricePerGb: e.target.value }))}
                    required
                  />
                </div>
              )}

              <div>
                <label className="form-label">Server (PasarGuard)</label>
                {servers.length > 0 ? (
                  <select
                    className="form-select"
                    value={form.serverId}
                    onChange={(e) => handleServerChange(e.target.value)}
                  >
                    <option value="">Select server…</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (ID: {s.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-input"
                    value={form.serverId}
                    onChange={(e) => setForm((f) => ({ ...f, serverId: e.target.value }))}
                    placeholder="Group ID"
                  />
                )}
              </div>

              <div>
                <label className="form-label">UUID Prefix</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.uuidPrefix}
                  onChange={(e) => setForm((f) => ({ ...f, uuidPrefix: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">
                  HWID Limit{' '}
                  <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>(0 = unlimited)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  value={form.hwidLimit}
                  onChange={(e) => setForm((f) => ({ ...f, hwidLimit: e.target.value }))}
                />
              </div>
            </div>

            {/* Package prices — Direct only */}
            {!form.userChoosesGb && (
              <div
                style={{
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--border-radius-md)',
                  padding: '0.875rem',
                  marginBottom: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Package Prices</label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addPackage}>
                    <i className="ti ti-plus" style={{ fontSize: '0.75rem' }} />
                    Add Package
                  </button>
                </div>

                {form.packages.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', paddingLeft: '0.25rem' }}>GB</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', paddingLeft: '0.25rem' }}>Price (Toman)</span>
                    <span />
                  </div>
                )}

                {form.packages.length === 0 ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '0.5rem 0' }}>
                    No packages yet. Click "Add Package" to add one.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {form.packages.map((pkg, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.375rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="number"
                            min="0"
                            className="form-input"
                            value={pkg.gb}
                            onChange={(e) => updatePackage(idx, 'gb', e.target.value)}
                            placeholder="GB (0=∞)"
                            style={{ paddingRight: pkg.gb === '0' ? '3.5rem' : undefined }}
                          />
                          {pkg.gb === '0' && (
                            <span
                              style={{
                                position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                                fontSize: '0.75rem', color: 'var(--color-text-info)', pointerEvents: 'none',
                              }}
                            >
                              ∞ Unlimited
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          value={pkg.price}
                          onChange={(e) => updatePackage(idx, 'price', e.target.value)}
                          placeholder="Price"
                        />
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => removePackage(idx)}
                          style={{ color: 'var(--color-text-danger)' }}
                        >
                          <i className="ti ti-x" style={{ fontSize: '0.875rem' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '0.5rem' }}>
                  Set GB to 0 for an unlimited package
                </div>
              </div>
            )}

            {/* Status toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Active</label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span className="toggle-track" />
              </label>
            </div>

            {error && (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--border-radius-md)',
                  background: 'var(--color-background-danger)',
                  color: 'var(--color-text-danger)',
                  fontSize: '0.8125rem',
                  marginBottom: '0.875rem',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={isPending} className="btn btn-primary btn-sm">
                {isPending ? 'Saving…' : editId !== null ? 'Save Changes' : 'Create'}
              </button>
              <button type="button" onClick={resetForm} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category cards */}
      {isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-stack-2" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }} />
          No categories yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              onEdit={openEdit}
              onDelete={(c) => {
                if (confirm(`Delete "${c.nameFa}"?`)) deleteMutation.mutate(c.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
