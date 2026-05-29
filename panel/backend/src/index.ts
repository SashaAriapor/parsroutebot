import path from 'path';
import fs from 'fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { jwtMiddleware } from './middlewares/jwt';
import { buildAuthRouter } from './routes/auth';
import { statsRouter } from './routes/stats';
import { usersRouter } from './routes/users';
import { servicesRouter } from './routes/services';
import { settingsRouter } from './routes/settings';

export function startPanel(opts: {
  port: number;
  jwtSecret: string;
  adminUsername: string;
  adminPassword: string;
}) {
  const app = new Hono();

  app.use('*', cors({ origin: '*', credentials: true }));

  const auth = buildAuthRouter({
    adminUsername: opts.adminUsername,
    adminPasswordHash: opts.adminPassword,
    jwtSecret: opts.jwtSecret,
  });

  const protect = jwtMiddleware(opts.jwtSecret);

  app.route('/api/auth', auth);
  app.use('/api/*', protect);
  app.route('/api/stats', statsRouter);
  app.route('/api/users', usersRouter);
  app.route('/api/services', servicesRouter);
  app.route('/api/settings', settingsRouter);

  // Serve compiled frontend in production — path is relative to cwd (project root)
  const staticDir = path.resolve(process.cwd(), 'panel/frontend/dist');
  if (fs.existsSync(staticDir)) {
    app.use('/assets/*', serveStatic({ root: 'panel/frontend/dist' }));
    app.get('*', (c) => {
      const html = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf-8');
      return c.html(html);
    });
  }

  serve({ fetch: app.fetch, port: opts.port });
}
