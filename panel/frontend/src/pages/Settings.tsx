import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, FormEvent } from 'react';
import { api } from '../lib/api';

type Settings = Record<string, string>;
type TabKey = 'payment' | 'channel' | 'panel' | 'bot' | 'env';

// ── Field groups ─────────────────────────────────────────────────────────────

interface Field { key: string; label: string; placeholder?: string; type?: string; hint?: string }

const PAYMENT_FIELDS: Field[] = [
  { key: 'WINAPAY_MERCHANT_ID',  label: 'WinaPay Merchant ID', hint: 'Required for online payment gateway (WinaPay)' },
  { key: 'WINAPAY_CALLBACK_URL', label: 'WinaPay Callback URL', placeholder: 'http://YOUR_SERVER_IP:3005/api/webhook/winapay', hint: 'Auto-filled from .env — change only if your server address differs' },
  { key: 'card_number',       label: 'Card Number',      placeholder: '6037-xxxx-xxxx-xxxx' },
  { key: 'card_owner',        label: 'Card Owner Name' },
  { key: 'card_fee_percent',  label: 'Card Fee %',       placeholder: '15', type: 'number' },
  { key: 'price_per_gb',      label: 'Price per GB (Toman)', type: 'number' },
  { key: 'card_channel_id',   label: 'Card Channel ID (for receipts)' },
  { key: 'card_approver_ids', label: 'Approver IDs (comma-separated)', hint: 'Telegram user IDs who approve card payments' },
  { key: 'ton_wallet_address',label: 'TON Wallet Address' },
  { key: 'min_ton_amount',    label: 'Min TON Amount',   type: 'number', hint: 'Minimum TON accepted per transaction' },
];

const CHANNEL_FIELDS: Field[] = [
  { key: 'required_channel_id',       label: 'Channel ID',       placeholder: '-100xxxxxxxxxx' },
  { key: 'required_channel_username', label: 'Channel Username',  placeholder: '@channel' },
];

const PANEL_FIELDS: Field[] = [
  { key: 'pasarguard_url',      label: 'Pasargad URL',     placeholder: 'https://…' },
  { key: 'pasarguard_username', label: 'Username' },
  { key: 'pasarguard_password', label: 'Password',         type: 'password' },
];

const BOT_FIELDS: Field[] = [
  { key: 'admin_ids',  label: 'Admin IDs (comma-separated)', hint: 'Telegram user IDs with admin access' },
  { key: 'panel_port', label: 'Panel Port', type: 'number', placeholder: '3001' },
  {
    key: 'VRAY_CONFIG_LINK',
    label: 'V2Ray Config Link',
    placeholder: 'vless:// or vmess:// or trojan://',
    hint: 'Bot will restart Xray core on save. Leave empty to use env proxy.',
  },
];

// ── Section form ─────────────────────────────────────────────────────────────

function FieldForm({
  fields,
  form,
  setForm,
  onSave,
  saving,
  saved,
  error,
  extra,
}: {
  fields: Field[];
  form: Settings;
  setForm: React.Dispatch<React.SetStateAction<Settings>>;
  onSave: (e: FormEvent) => void;
  saving: boolean;
  saved: boolean;
  error: string;
  extra?: React.ReactNode;
}) {
  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {fields.map(({ key, label, placeholder, type, hint }) => (
        <div key={key}>
          <label className="form-label">{label}</label>
          <input
            type={type ?? 'text'}
            className="form-input"
            value={form[key] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
          />
          {hint && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: 3 }}>
              {hint}
            </div>
          )}
        </div>
      ))}

      {extra}

      {error && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--border-radius-md)',
            background: 'var(--color-background-danger)',
            color: 'var(--color-text-danger)',
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-check" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

// ── Env tab ───────────────────────────────────────────────────────────────────

interface EnvEntry { key: string; value: string; masked: boolean }

function EnvTab() {
  const { data, isLoading, refetch } = useQuery<{ entries: EnvEntry[] }>({
    queryKey: ['env'],
    queryFn: () => api.get('/settings/env').then((r) => r.data),
  });

  const [edits, setEdits]       = useState<Record<string, string>>({});
  const [visible, setVisible]   = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null);

  const entries = data?.entries ?? [];

  const handleSave = async () => {
    const all: Record<string, string> = {};
    for (const e of entries) {
      all[e.key] = edits[e.key] ?? e.value;
    }
    setSaving(true);
    setResult(null);
    try {
      const r = await api.patch<{ ok: boolean; updated: number; restarting: boolean }>(
        '/settings/env',
        { updates: all },
      );
      if (r.data.ok) {
        setResult({
          ok: true,
          msg: r.data.restarting
            ? `${r.data.updated} variable(s) saved — restarting service…`
            : 'No changes applied',
        });
        refetch();
        setEdits({});
      }
    } catch {
      setResult({ ok: false, msg: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="empty-state">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
        After saving, the service restarts automatically.
      </p>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '38%' }}>Variable</th>
              <th>Value</th>
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const current  = edits[entry.key] ?? entry.value;
              const isEdited = edits[entry.key] !== undefined && edits[entry.key] !== entry.value;
              const isVisible = visible.has(entry.key);

              return (
                <tr
                  key={entry.key}
                  style={isEdited ? { background: 'var(--color-background-info)' } : undefined}
                >
                  <td>
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>
                      {entry.key}
                    </span>
                    {entry.masked && (
                      <span
                        className="badge badge-sq badge-warning"
                        style={{ marginLeft: '0.375rem', fontSize: '0.6rem' }}
                      >
                        sensitive
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem 1rem' }}>
                    <input
                      type={entry.masked && !isVisible ? 'password' : 'text'}
                      className="form-input mono"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      value={current}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [entry.key]: e.target.value }))}
                      placeholder={entry.masked ? 'Enter new value' : ''}
                    />
                  </td>
                  <td style={{ padding: '0.5rem 0.5rem', textAlign: 'center' }}>
                    {entry.masked && (
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ padding: '0.25rem' }}
                        onClick={() =>
                          setVisible((s) => {
                            const n = new Set(s);
                            n.has(entry.key) ? n.delete(entry.key) : n.add(entry.key);
                            return n;
                          })
                        }
                        title={isVisible ? 'Hide' : 'Show'}
                      >
                        <i
                          className={`ti ${isVisible ? 'ti-eye-off' : 'ti-eye'}`}
                          style={{ fontSize: '0.8125rem' }}
                        />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--border-radius-md)',
            background: result.ok ? 'var(--color-background-success)' : 'var(--color-background-danger)',
            color: result.ok ? 'var(--color-text-success)' : 'var(--color-text-danger)',
            fontSize: '0.8125rem',
          }}
        >
          <i className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`} style={{ marginRight: '0.375rem' }} />
          {result.msg}
        </div>
      )}

      <div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save & Restart'}
        </button>
      </div>
    </div>
  );
}

// ── Main Settings ─────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'payment', label: 'Payment',     icon: 'ti-credit-card' },
  { key: 'channel', label: 'Channel Gate',icon: 'ti-broadcast' },
  { key: 'panel',   label: 'Panel',       icon: 'ti-server' },
  { key: 'bot',     label: 'Bot',         icon: 'ti-brand-telegram' },
  { key: 'env',     label: 'Environment', icon: 'ti-terminal-2' },
];


export function Settings() {
  const qc              = useQueryClient();
  const [tab, setTab]   = useState<TabKey>('payment');
  const [form, setForm] = useState<Settings>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [channelEnabled, setChannelEnabled] = useState(false);

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
  });

  useEffect(() => {
    if (data) {
      setForm(data);
      setChannelEnabled(data['channel_gate_enabled'] === 'true');
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values: Settings) => api.patch('/settings', values),
    onSuccess: async (_, variables) => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if ('VRAY_CONFIG_LINK' in variables && variables['VRAY_CONFIG_LINK']) {
        await api.post('/health/proxy/reconnect').catch(() => {});
      }
    },
    onError: () => setError('Failed to save settings'),
  });

  function handleSave(fields: Field[]) {
    return (e: FormEvent) => {
      e.preventDefault();
      setError('');
      const patch: Settings = {};
      for (const { key } of fields) {
        patch[key] = form[key] ?? '';
      }
      mutation.mutate(patch);
    };
  }

  function handleChannelSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate({
      required_channel_id:       form['required_channel_id'] ?? '',
      required_channel_username: form['required_channel_username'] ?? '',
      channel_gate_enabled:      String(channelEnabled),
    });
  }

  async function handleTestConnection() {
    try {
      const r = await api.get('/health');
      const status = r.data?.pasarguard?.status ?? 'error';
      setError(status === 'ok' ? '' : 'Connection test failed');
      if (status === 'ok') { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch {
      setError('Connection test failed');
    }
  }

  if (isLoading) return <div className="empty-state">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}>
      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            className={`tab-btn${tab === key ? ' active' : ''}`}
            onClick={() => { setTab(key); setError(''); setSaved(false); }}
          >
            <i className={`ti ${icon}`} style={{ marginRight: '0.3rem', fontSize: '0.875rem' }} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {tab === 'payment' && (
          <FieldForm
            fields={PAYMENT_FIELDS}
            form={form}
            setForm={setForm}
            onSave={handleSave(PAYMENT_FIELDS)}
            saving={mutation.isPending}
            saved={saved}
            error={error}
          />
        )}

        {tab === 'channel' && (
          <form onSubmit={handleChannelSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', marginBottom: '0.25rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                  Channel Gate
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Require users to join a channel before using the bot
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={channelEnabled}
                  onChange={(e) => setChannelEnabled(e.target.checked)}
                />
                <span className="toggle-track" />
              </label>
            </div>

            {CHANNEL_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="form-label">{label}</label>
                <input
                  type="text"
                  className="form-input"
                  value={form[key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  disabled={!channelEnabled}
                />
              </div>
            ))}

            {error && (
              <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', fontSize: '0.8125rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-sm">
                {mutation.isPending ? 'Saving…' : 'Save'}
              </button>
              {saved && (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-check" /> Saved
                </span>
              )}
            </div>
          </form>
        )}

        {tab === 'panel' && (
          <FieldForm
            fields={PANEL_FIELDS}
            form={form}
            setForm={setForm}
            onSave={handleSave(PANEL_FIELDS)}
            saving={mutation.isPending}
            saved={saved}
            error={error}
            extra={
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleTestConnection}
                >
                  <i className="ti ti-plug" />
                  Test Connection
                </button>
              </div>
            }
          />
        )}

        {tab === 'bot' && (
          <>
            {/* Welcome message field */}
            <div style={{ marginBottom: '0.875rem' }}>
              <label className="form-label">Welcome Message</label>
              <textarea
                className="form-textarea"
                value={form['welcome_text'] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, welcome_text: e.target.value }))}
                rows={4}
                dir="rtl"
              />
            </div>

            <FieldForm
              fields={BOT_FIELDS}
              form={form}
              setForm={setForm}
              onSave={(e) => {
                e.preventDefault();
                setError('');
                const patch: Settings = { welcome_text: form['welcome_text'] ?? '' };
                for (const { key } of BOT_FIELDS) {
                  patch[key] = form[key] ?? '';
                }
                mutation.mutate(patch);
              }}
              saving={mutation.isPending}
              saved={saved}
              error={error}
            />
          </>
        )}

        {tab === 'env' && <EnvTab />}
      </div>
    </div>
  );
}
