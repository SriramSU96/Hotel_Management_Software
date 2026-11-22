import { Router } from 'express';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Role, Session, User } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { loadUserFromToken, newToken, parseCookies, requireLogin, sha256, SESSION_COOKIE } from '../middleware/auth.js';
import { audit } from '../services/core.js';
import { config, cookieSecure } from '../config.js';

export const authRouter = Router();
// Only FAILED logins count. One shared restaurant IP (everyone behind the same router) must not be locked out by a few typos,
// and a guesser is slowed down per account as well as per address.
const uname = (req: any) => String(req.body?.username ?? '').toLowerCase().trim().slice(0, 40);
const tooMany = { error: 'Too many wrong attempts. Please wait a few minutes and try again.' };
const common = { windowMs: 15 * 60_000, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: tooMany } as const;
const loginLimiters = [
  rateLimit({ ...common, limit: 8, keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${uname(req)}` }), // one address guessing one account
  rateLimit({ ...common, limit: 40, keyGenerator: (req) => `u|${uname(req)}` }),                               // many addresses guessing one account
  rateLimit({ ...common, limit: 100, keyGenerator: (req) => ipKeyGenerator(req.ip ?? '') }),                  // one address spraying many accounts
];

const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE';

function cookieOpts() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: cookieSecure, maxAge: config.SESSION_TTL_HOURS * 3600_000, path: '/' };
}

authRouter.post('/login', ...loginLimiters, asyncHandler(async (req, res) => {
  const body = parse(z.object({ username: z.string().min(1), password: z.string().min(1) }), req.body);
  const user = await User.findOne({ username: body.username.toLowerCase().trim() });
  let ok = false;
  try { ok = await verify(user?.passwordHash ?? DUMMY_HASH, body.password); } catch { ok = false; }
  if (!user || !user.active || !ok) {
    await audit(req, 'auth.login_failed', 'User', user?._id, { note: body.username.slice(0, 40) });
    throw new HttpError(401, 'Wrong username or password.', 'BAD_LOGIN');
  }
  const token = newToken();
  await Session.create({
    tokenHash: sha256(token), userId: user._id, device: String(req.headers['user-agent'] ?? '').slice(0, 160), ip: req.ip,
    lastSeenAt: new Date(), expiresAt: new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000),
  });
  user.lastLoginAt = new Date();
  await user.save();
  res.cookie(SESSION_COOKIE, token, cookieOpts());
  const me = await loadUserFromToken(token);
  req.user = me ?? undefined;
  await audit(req, 'auth.login', 'User', user._id);
  res.json({ user: me });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await Session.deleteOne({ tokenHash: sha256(token) });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}));

authRouter.get('/me', asyncHandler(async (req, res) => {
  res.json({ user: req.user ?? null });
}));

authRouter.post('/language', requireLogin, asyncHandler(async (req, res) => {
  const { language } = parse(z.object({ language: z.enum(['en', 'ta']) }), req.body);
  await User.updateOne({ _id: req.user!.id }, { language });
  res.json({ ok: true });
}));

authRouter.post('/change-password', requireLogin, asyncHandler(async (req, res) => {
  const b = parse(z.object({ current: z.string(), next: z.string().min(8, 'Use at least 8 characters') }), req.body);
  const user = await User.findById(req.user!.id);
  if (!user || !(await verify(user.passwordHash, b.current))) throw new HttpError(400, 'Current password is wrong.');
  user.passwordHash = await hash(b.next);
  await user.save();
  await Session.deleteMany({ userId: user._id, _id: { $ne: req.user!.sessionId } });
  await audit(req, 'auth.password_change', 'User', user._id);
  res.json({ ok: true });
}));

authRouter.get('/devices', requireLogin, asyncHandler(async (req, res) => {
  const s = await Session.find({ userId: req.user!.id }).sort({ lastSeenAt: -1 });
  res.json({ devices: s.map((x) => ({ id: x._id, device: x.device, ip: x.ip, lastSeenAt: x.lastSeenAt, current: String(x._id) === req.user!.sessionId })) });
}));

authRouter.delete('/devices/:id', requireLogin, asyncHandler(async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) throw new HttpError(400, 'Invalid request.');
  await Session.deleteOne({ _id: req.params.id, userId: req.user!.id });
  res.json({ ok: true });
}));

export { hash };
export const roleList = async () => Role.find().sort({ system: -1, key: 1 });
