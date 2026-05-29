import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, FormEvent } from 'react';
import { api } from '../lib/api';

type Settings = Record<string, string>;

const FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: 'card_number', label: 'Card Number', placeholder: '6037-xxxx-xxxx-xxxx' },
  { key: 'card_owner', label: 'Card Owner Name' },
  { key: 'card_fee_percent', label: 'Card Fee %', placeholder: '15' },
  { key: 'price_per_gb', label: 'Price Per GB (Toman)' },
  { key: 'card_channel_id', label: 'Card Channel ID (for receipts)' },
  { key: 'card_approver_ids', label: 'Card Approver IDs (comma-separated)' },
  { key: 'required_channel_id', label: 'Required Channel ID (gate)' },
  { key: 'required_channel_username', label: 'Required Channel Username (e.g. @channel)' },
  { key: 'welcome_text', label: 'Welcome Message' },
];

const BUY_FIELDS: { key: string; label: string; type: string; placeholder: string; hint?: string }[] = [
  { key: 'PRICE_PER_GB_TOMAN', label: 'قیمت هر گیگابایت (تومان)', type: 'number', placeholder: '12000' },
  { key: 'SERVICE_DURATION_DAYS', label: 'مدت سرویس (روز)', type: 'number', placeholder: '30' },
  {
    key: 'QUICK_PICK_GB',
    label: 'گزینه‌های سریع گیگ (با کاما جدا کن)',
    type: 'text',
    placeholder: '1,5,10,20',
    hint: 'مثال: 1,5,10,20 — حداکثر ۴ عدد',
  },
];

function validateBuyFields(form: Settings): string[] {
  const errors: string[] = [];

  const price = form['PRICE_PER_GB_TOMAN'];
  if (price !== undefined && price !== '') {
    const n = parseInt(price, 10);
    if (!/^\d+$/.test(price.trim()) || isNaN(n) || n <= 0)
      errors.push('قیمت هر گیگابایت باید عدد صحیح مثبت باشد');
  }

  const duration = form['SERVICE_DURATION_DAYS'];
  if (duration !== undefined && duration !== '') {
    const n = parseInt(duration, 10);
    if (!/^\d+$/.test(duration.trim()) || isNaN(n) || n <= 0)
      errors.push('مدت سرویس باید عدد صحیح مثبت باشد');
  }

  const quickPick = form['QUICK_PICK_GB'];
  if (quickPick !== undefined && quickPick !== '') {
    const raw = quickPick.split(',').map((s) => s.trim()).filter((s) => s !== '');
    const valid = raw.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n > 0);
    if (valid.length !== raw.length || valid.length < 1 || valid.length > 4)
      errors.push('گزینه‌های سریع باید ۱ تا ۴ عدد صحیح مثبت با کاما جدا باشند');
  }

  return errors;
}

export function Settings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>({});
  const [saved, setSaved] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values: Settings) => api.patch('/settings', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validateBuyFields(form);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    mutation.mutate(form);
  }

  if (isLoading) return <p className="text-gray-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800">Settings</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-5">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            {key === 'welcome_text' ? (
              <textarea
                value={form[key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <input
                type="text"
                value={form[key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>
        ))}

        <div className="border-t border-gray-200 pt-5" dir="rtl">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">تنظیمات خرید</h2>
          {BUY_FIELDS.map(({ key, label, type, placeholder, hint }) => (
            <div key={key} className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                value={form[key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                min={type === 'number' ? 1 : undefined}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                dir="ltr"
              />
              {hint && <small className="text-gray-500 text-xs mt-1 block">{hint}</small>}
            </div>
          ))}
        </div>

        {validationErrors.length > 0 && (
          <ul className="text-sm text-red-600 space-y-1 list-disc list-inside" dir="rtl">
            {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
          {mutation.isError && <span className="text-sm text-red-600">Save failed.</span>}
        </div>
      </form>
    </div>
  );
}
