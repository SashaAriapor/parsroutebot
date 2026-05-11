export function formatToman(amount: bigint | number): string {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  return n.toLocaleString('fa-IR') + ' ت';
}

export function formatBytes(bytes: bigint | number): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatGB(gb: number): string {
  if (gb === 0) return 'نامحدود';
  return `${gb.toLocaleString('fa-IR')} گیگ`;
}

export function formatDateIR(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function daysRemaining(expiryAt: Date | null | undefined): number | null {
  if (!expiryAt) return null;
  const ms = expiryAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 3600 * 1000));
}

export function progressBar(usedRatio: number, length = 10): string {
  const filled = Math.min(length, Math.max(0, Math.round(usedRatio * length)));
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

export function toPersianDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'لحظاتی پیش';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} دقیقه پیش`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعت پیش`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} روز پیش`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ماه پیش`;

  const years = Math.floor(months / 12);
  return `${years} سال پیش`;
}
