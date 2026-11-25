import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/ammas'),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  WEB_DIST: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  // Web origins allowed to call the API from another address with a Bearer token (the Expo web app), comma separated. Empty = same-origin only.
  APP_ORIGINS: z.string().default(''),
  // Number of reverse proxies in front of the server (0 = none). Trusting X-Forwarded-For when nobody is in front lets anyone fake their IP and dodge rate limits.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Send the session cookie only over HTTPS. Defaults to on in production; set false only for a plain-HTTP restaurant LAN.
  COOKIE_SECURE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  SEED_OWNER_PASSWORD: z.string().optional(),
  PRINT_BRIDGE_TOKEN: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
  SETTINGS_KEY: z.string().min(16).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
export const cookieSecure = config.COOKIE_SECURE ? config.COOKIE_SECURE === 'true' : isProd;
