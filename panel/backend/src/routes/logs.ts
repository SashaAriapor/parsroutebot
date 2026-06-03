import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFileSync, statSync, openSync, readSync, closeSync } from 'fs';

const LOG_FILE = '/tmp/bot.log';

// Pino numeric levels: 10=trace,20=debug,30=info,40=warn,50=error,60=fatal
const LEVEL_THRESHOLD: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function parseLine(line: string): Record<string, unknown> {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { time: new Date().toISOString(), level: 30, msg: line.trim() };
  }
}

function matchesLevel(entry: Record<string, unknown>, levelFilter: string): boolean {
  if (levelFilter === 'all') return true;
  const threshold = LEVEL_THRESHOLD[levelFilter] ?? 0;
  const entryLevel =
    typeof entry.level === 'number'
      ? entry.level
      : LEVEL_THRESHOLD[String(entry.level).toLowerCase()] ?? 30;
  return entryLevel >= threshold;
}

export const logsRouter = new Hono();

logsRouter.get('/', (c) => {
  const levelFilter = c.req.query('level') ?? 'all';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200', 10), 1000);

  try {
    const content = readFileSync(LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean).slice(-limit);
    const logs = lines.map(parseLine).filter((e) => matchesLevel(e, levelFilter));
    return c.json({ logs });
  } catch {
    return c.json({ logs: [] });
  }
});

logsRouter.get('/stream', (c) => {
  const levelFilter = c.req.query('level') ?? 'all';

  return streamSSE(c, async (stream) => {
    let closed = false;
    let offset = 0;

    try {
      offset = statSync(LOG_FILE).size;
    } catch { /* file may not exist yet */ }

    stream.onAbort(() => { closed = true; });

    while (!closed) {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      if (closed) break;

      try {
        const newSize = statSync(LOG_FILE).size;
        if (newSize <= offset) continue;

        const fd = openSync(LOG_FILE, 'r');
        const buf = Buffer.alloc(newSize - offset);
        readSync(fd, buf, 0, buf.length, offset);
        closeSync(fd);
        offset = newSize;

        for (const line of buf.toString('utf-8').split('\n').filter(Boolean)) {
          const entry = parseLine(line);
          if (matchesLevel(entry, levelFilter)) {
            await stream.writeSSE({ data: JSON.stringify(entry) });
          }
        }
      } catch { /* file disappeared or unreadable — skip */ }
    }
  });
});
