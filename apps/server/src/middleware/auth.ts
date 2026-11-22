import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Role, Session, User } from '../models/index.js';
import { effectivePermissions, type Permission } from '../lib/permissions.js';
import { HttpError } from './error.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'ammas_session';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  roleKey: string;
  permissions: string[];
  language: 'en' | 'ta';
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function loadUserFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user || !user.active) return null;
  const role = await Role.findOne({ key: user.roleKey });
  const permissions = effectivePermissions(role?.permissions ?? [], user.grants, user.denies);
  // keep "last seen" fresh without writing on every request
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    session.lastSeenAt = new Date();
    session.expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000);
    await session.save();
  }
  return {
    id: String(user._id),
    username: user.username,
    name: user.name,
    roleKey: user.roleKey,
    permissions,
    language: user.language,
    sessionId: String(session._id),
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    req.user = (await loadUserFromToken(token)) ?? undefined;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.', 'UNAUTHENTICATED'));
  next();
}

/** Enforced on the server for every protected route (hiding buttons is not enough). */
export function requirePerm(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.', 'UNAUTHENTICATED'));
    if (!perms.some((p) => req.user!.permissions.includes(p))) {
      return next(new HttpError(403, 'You do not have permission to do this.', 'FORBIDDEN'));
    }
    next();
  };
}

export const can = (req: Request, p: Permission) => !!req.user?.permissions.includes(p);

/** CSRF guard: cookies are SameSite=Lax and every state-changing call must carry a custom header. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'ammas') {
    return next(new HttpError(403, 'Blocked request.', 'CSRF'));
  }
  next();
}
