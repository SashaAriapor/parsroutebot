import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

interface LogEntry {
  time?: string;
  level?: number | string;
  msg?: string;
  [key: string]: unknown;
}

const LEVEL_NUM: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

function getLevelNum(level: number | string | undefined): number {
  if (typeof level === 'number') return level;
  return LEVEL_NUM[String(level).toLowerCase()] ?? 30;
}

function getLevelLabel(level: number | string | undefined): string {
  const n = getLevelNum(level);
  if (n <= 10) return 'TRACE';
  if (n <= 20) return 'DEBUG';
  if (n <= 30) return 'INFO';
  if (n <= 40) return 'WARN';
  if (n <= 50) return 'ERROR';
  return 'FATAL';
}

function getLevelBadgeClass(level: number | string | undefined): string {
  const n = getLevelNum(level);
  if (n >= 50) return 'badge-danger';
  if (n >= 40) return 'badge-warning';
  return 'badge-info';
}

function getLineClass(level: number | string | undefined): string {
  const n = getLevelNum(level);
  if (n >= 50) return 'log-line log-line-error';
  if (n >= 40) return 'log-line log-line-warn';
  return 'log-line';
}

function getMsgClass(level: number | string | undefined): string {
  const n = getLevelNum(level);
  if (n >= 50) return 'log-msg log-msg-error';
  if (n >= 40) return 'log-msg log-msg-warn';
  return 'log-msg';
}

function formatTime(time: string | undefined): string {
  if (!time) return '';
  try {
    return new Date(time).toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return time;
  }
}

function getExtras(entry: LogEntry): Record<string, unknown> {
  const { time: _t, level: _l, msg: _m, pid: _p, hostname: _h, v: _v, ...rest } = entry;
  return rest;
}

const LEVELS: { key: LevelFilter; label: string }[] = [
  { key: 'all',   label: 'All' },
  { key: 'info',  label: 'Info' },
  { key: 'warn',  label: 'Warn' },
  { key: 'error', label: 'Error' },
];

export function Logs() {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [autoScroll, setAutoScroll]   = useState(true);
  const [expanded, setExpanded]       = useState<Set<number>>(new Set());
  const bottomRef                     = useRef<HTMLDivElement>(null);
  const esRef                         = useRef<EventSource | null>(null);

  const fetchLogs = useCallback((filter: LevelFilter) => {
    setLoading(true);
    api
      .get<{ logs: LogEntry[] }>(`/logs?level=${filter}&limit=200`)
      .then((r) => setLogs(r.data.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLogs(levelFilter); }, [levelFilter, fetchLogs]);

  useEffect(() => {
    esRef.current?.close();
    const token = auth.getToken() ?? '';
    const es = new EventSource(`/api/logs/stream?level=${levelFilter}&token=${encodeURIComponent(token)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry;
        setLogs((prev) => [...prev.slice(-999), entry]);
      } catch {}
    };
    return () => { es.close(); esRef.current = null; };
  }, [levelFilter]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const toggleExpand = (idx: number) => {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px - 2.5rem)', gap: '0.75rem' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <div className="tab-bar" style={{ border: 'none', flex: 1 }}>
          {LEVELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setLevelFilter(key)}
              className={`tab-btn${levelFilter === key ? ' active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
            >
              {label}
            </button>
          ))}
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '0.75rem',
              marginLeft: 'auto',
            }}
          >
            {logs.length} lines
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <label className="toggle" style={{ width: 32, height: 18 }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
            Auto-scroll
          </label>
          <button className="btn btn-ghost btn-sm" onClick={() => setLogs([])}>
            <i className="ti ti-trash" />
            Clear
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => fetchLogs(levelFilter)}
            disabled={loading}
          >
            <i className="ti ti-refresh" />
            Reload
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className="log-terminal" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem' }}>
              Loading…
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem' }}>
              No log entries
            </div>
          )}
          {logs.map((entry, idx) => {
            const extras    = getExtras(entry);
            const hasExtras = Object.keys(extras).length > 0;
            const isExpanded = expanded.has(idx);

            return (
              <div key={idx} className={getLineClass(entry.level)}>
                <div
                  style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', cursor: hasExtras ? 'pointer' : 'default', flex: 1 }}
                  onClick={() => hasExtras && toggleExpand(idx)}
                >
                  <span className="log-time">{formatTime(entry.time as string)}</span>
                  <span className={`badge badge-sq ${getLevelBadgeClass(entry.level)}`} style={{ flexShrink: 0 }}>
                    {getLevelLabel(entry.level)}
                  </span>
                  <span className={getMsgClass(entry.level)}>
                    {String(entry.msg ?? '')}
                  </span>
                  {hasExtras && (
                    <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, fontSize: '0.6875rem' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  )}
                </div>
                {isExpanded && hasExtras && (
                  <pre
                    style={{
                      margin: '0.25rem 0 0.25rem 6.5rem',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.6875rem',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(extras, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
