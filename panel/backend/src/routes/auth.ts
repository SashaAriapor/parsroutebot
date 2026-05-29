import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from '../middlewares/rate-limit';

const REFRESH_COOKIE = 'panelRefresh';

export function buildAuthRouter(opts: {
  adminUsername: string;
  adminPasswordHash: string;
  jwtSecret: string;
}) {
  const { adminUsername, adminPasswordHash, jwtSecret } = opts;

  function makeAccessToken() {
    return jwt.sign({ sub: adminUsername, type: 'access' }, jwtSecret, { expiresIn: '15m' });
  }

  function makeRefreshToken() {
    return jwt.sign({ sub: adminUsername, type: 'refresh' }, jwtSecret, { expiresIn: '7d' });
  }

  const router = new Hono();

  router.post('/login', rateLimit(5, 15 * 60 * 1000), async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();
    const { username, password } = body ?? {};

    if (!username || !password) {
      return c.json({ error: 'Username and password required' }, 400);
    }

    const usernameMatch = username === adminUsername;
    let passwordMatch = false;

    if (adminPasswordHash.startsWith('$2')) {
      passwordMatch = await bcrypt.compare(password, adminPasswordHash);
    } else {
      passwordMatch = password === adminPasswordHash;
    }

    if (!usernameMatch || !passwordMatch) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const accessToken = makeAccessToken();
    const refreshToken = makeRefreshToken();

    setCookie(c, REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/auth',
    });

    return c.json({ accessToken });
  });

  router.post('/refresh', async (c) => {
    const token = getCookie(c, REFRESH_COOKIE);
    if (!token) return c.json({ error: 'No refresh token' }, 401);

    try {
      const payload = jwt.verify(token, jwtSecret) as { type?: string };
      if (payload.type !== 'refresh') throw new Error();
      return c.json({ accessToken: makeAccessToken() });
    } catch {
      deleteCookie(c, REFRESH_COOKIE, { path: '/api/auth' });
      return c.json({ error: 'Invalid refresh token' }, 401);
    }
  });

  router.post('/logout', (c) => {
    deleteCookie(c, REFRESH_COOKIE, { path: '/api/auth' });
    return c.json({ ok: true });
  });

  return router;
}
