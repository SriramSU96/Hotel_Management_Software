import crypto from 'node:crypto';
import { config } from '../config.js';

/** Passwords and tokens typed in Settings are stored encrypted (AES-256-GCM) and are never sent back to the browser. */
const key = () => crypto.createHash('sha256').update(config.SETTINGS_KEY ?? config.PRINT_BRIDGE_TOKEN ?? config.MONGODB_URI).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  try {
    const [iv, tag, enc] = stored.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; } // wrong key or damaged value: treat as not set
}
