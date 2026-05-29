import type { MiddlewareHandler } from 'hono';
import jwt from 'jsonwebtoken';

declare module 'hono' {
  interface ContextVariableMap {
    jwtUser: { sub: string };
  }
}

export function jwtMiddleware(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const payload = jwt.verify(token, secret) as { sub: string };
      c.set('jwtUser', payload);
      await next();
    } catch {
      return c.json({ error: 'Invalid token' }, 401);
    }
  };
}
