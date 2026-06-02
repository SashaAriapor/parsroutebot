import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { exec, spawn } from 'child_process';

const CONTAINER = 'parsroute_bot';

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

  return new Promise<Response>((resolve) => {
    exec(
      `docker logs ${CONTAINER} --tail ${limit} 2>&1`,
      { timeout: 30_000 },
      (_err, stdout) => {
        const lines = (stdout ?? '').trim().split('\n').filter(Boolean);
        const logs = lines.map(parseLine).filter((e) => matchesLevel(e, levelFilter));
        resolve(c.json({ logs }));
      },
    );
  });
});

logsRouter.get('/stream', (c) => {
  const levelFilter = c.req.query('level') ?? 'all';

  return streamSSE(c, async (stream) => {
    const child = spawn('docker', ['logs', CONTAINER, '-f', '--tail', '50', '--since', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const handleData = async (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = parseLine(line);
        if (matchesLevel(entry, levelFilter)) {
          await stream.writeSSE({ data: JSON.stringify(entry) });
        }
      }
    };

    child.stdout?.on('data', handleData);
    child.stderr?.on('data', handleData);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        child.kill('SIGTERM');
        resolve();
      });
      child.on('close', resolve);
      child.on('error', resolve);
    });
  });
});
