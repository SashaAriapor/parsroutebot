import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  ADMIN_IDS: z
    .string()
    .min(1, 'ADMIN_IDS is required')
    .transform((val) =>
      val
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n)),
    ),

  LOG_CHANNEL_ID: z
    .string()
    .min(1, 'LOG_CHANNEL_ID is required')
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n < 0, 'LOG_CHANNEL_ID must be a negative number'),

  XUI_PANEL_URL: z
    .string()
    .url('XUI_PANEL_URL must be a valid URL (e.g. http://1.2.3.4:54321/secretpath)')
    .transform((val) => {
      if (val.endsWith('/')) {
        console.warn('[config] XUI_PANEL_URL has a trailing slash — stripping it.');
        return val.slice(0, -1);
      }
      return val;
    }),

  XUI_USERNAME: z.string().min(1, 'XUI_USERNAME is required'),
  XUI_PASSWORD: z.string().min(1, 'XUI_PASSWORD is required'),

  XUI_INBOUND_ID: z
    .string()
    .min(1, 'XUI_INBOUND_ID is required')
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, 'XUI_INBOUND_ID must be a positive integer'),

  XUI_SUB_DOMAIN: z.string().min(1, 'XUI_SUB_DOMAIN is required'),

  XUI_SUB_PORT: z
    .string()
    .default('2096')
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0 && n <= 65535, 'XUI_SUB_PORT must be a valid port (1–65535)'),

  XUI_SUB_PATH: z
    .string()
    .default('/sub/')
    .refine((val) => val.startsWith('/') && val.endsWith('/'), 'XUI_SUB_PATH must start and end with /'),

  PRICE_PER_GB_TOMAN: z
    .string()
    .min(1, 'PRICE_PER_GB_TOMAN is required')
    .refine((val) => /^\d+$/.test(val.trim()) && parseInt(val.trim(), 10) > 0, 'PRICE_PER_GB_TOMAN must be a positive integer')
    .transform((val) => BigInt(val.trim())),

  MIN_GB: z
    .string()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, 'MIN_GB must be a positive integer'),

  MAX_GB: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, 'MAX_GB must be a positive integer'),

  DEFAULT_DURATION_DAYS: z
    .string()
    .default('30')
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, 'DEFAULT_DURATION_DAYS must be a positive integer'),

  TON_WALLET_ADDRESS: z
    .string()
    .refine(
      (addr) => addr.startsWith('UQ') && addr.length === 48,
      [
        'TON_WALLET_ADDRESS must be in non-bounceable format:',
        '  - Starts with "UQ" (not "EQ")',
        '  - Exactly 48 characters long',
        'Bounceable addresses (EQ...) are for smart contracts and may cause payments to bounce.',
        'Use your wallet app to copy the non-bounceable (UQ...) address.',
      ].join('\n'),
    ),

  TONAPI_KEY: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n[config] Invalid or missing environment variables:\n');
  const errors = parsed.error.flatten().fieldErrors;
  for (const [field, messages] of Object.entries(errors)) {
    console.error(`  ${field}:`);
    for (const msg of messages ?? []) {
      console.error(`    ${msg}`);
    }
  }
  console.error('\nCheck your .env file against .env.example and try again.\n');
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
