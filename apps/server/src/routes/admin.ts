import { Router } from 'express';
import { z } from 'zod';
import { hash } from '@node-rs/argon2';
import { AuditLog, Feedback, ReportDelivery, Role, Session, Settings, User } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requireLogin, requirePerm } from '../middleware/auth.js';
import { audit, getSettings } from '../services/core.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { checkVerification, emailConfigured, queueReport, retryDelivery, sendEmail, startVerification, whatsappConfigured } from '../services/delivery.js';
import rateLimit from 'express-rate-limit';
import { encryptSecret } from '../lib/secrets.js';
import { resolveRange } from '../lib/time.js';
import { csvCell } from '../lib/csv.js';
import { effectivePermissions } from '../lib/permissions.js';
import { deleteDemo, demoStatus, loadDemo } from '../services/demo.js';

export const adminRouter = Router();

// ---------- Settings ----------
adminRouter.get('/settings', requireLogin, asyncHandler(async (req, res) => {
  const s = (await getSettings()) as any;
  const full = req.user!.permissions.includes('settings.manage');
  // everyone signed in needs the receipt/tax/feature flags; only managers see owner contact + schedule
  const base = {
    restaurantName: s.restaurantName, address: s.address, phone: s.phone, gstin: s.gstin, billFooter: s.billFooter,
    receiptWidth: s.receiptWidth, timezone: s.timezone, taxMode: s.taxMode, taxBp: s.taxBp,
    discountsEnabled: s.discountsEnabled, parcelEnabled: s.parcelEnabled, kotPrinterEnabled: s.kotPrinterEnabled, printerConnection: s.printerConnection,
    useTables: s.useTables, browserPrint: s.browserPrint?.toObject?.() ?? s.browserPrint, billMessage: s.whatsappCfg?.billMessage,
  };
  // secrets (SMTP password, WhatsApp token) are never sent to the browser, only whether they are set
  const ec = s.emailCfg ?? {}; const wc = s.whatsappCfg ?? {};
  const secretless = {
    emailCfg: { host: ec.host ?? '', port: ec.port ?? 587, user: ec.user ?? '', from: ec.from ?? '', passSet: !!ec.passEnc },
    whatsappCfg: { phoneNumberId: wc.phoneNumberId ?? '', templateName: wc.templateName ?? '', templateLang: wc.templateLang ?? 'en', billMessage: wc.billMessage, tokenSet: !!wc.tokenEnc },
    reportContent: s.reportContent?.toObject?.() ?? s.reportContent,
  };
  res.json({ settings: full ? { ...base, ...secretless, feedbackRetentionDays: s.feedbackRetentionDays, owner: s.owner, schedule: s.schedule } : base, providers: full ? { email: await emailConfigured(), whatsapp: await whatsappConfigured() } : undefined });
}));

adminRouter.put('/settings', requirePerm('settings.manage'), asyncHandler(async (req, res) => {
  const hm = z.string().regex(/^\d{2}:\d{2}$/);
  const b = parse(z.object({
    restaurantName: z.string().min(1).max(80), address: z.string().max(200), phone: z.string().max(30), gstin: z.string().max(20),
    billFooter: z.string().max(160), receiptWidth: z.number().int().min(24).max(64), timezone: z.string().max(60),
    taxMode: z.enum(['NONE', 'EXCLUSIVE', 'INCLUSIVE']), taxBp: z.number().int().min(0).max(5000),
    discountsEnabled: z.boolean(), parcelEnabled: z.boolean(), kotPrinterEnabled: z.boolean(),
    printerConnection: z.enum(['ETHERNET', 'USB', 'BLUETOOTH', 'BROWSER']), useTables: z.boolean(),
    browserPrint: z.object({ paperMm: z.number().int().min(40).max(210), copies: z.number().int().min(1).max(3), fontPx: z.number().int().min(9).max(20), autoPrintBill: z.boolean(), autoPrintKot: z.boolean(), showTamil: z.boolean() }),
    emailCfg: z.object({ host: z.string().max(120).regex(/^[a-zA-Z0-9.-]*$/, 'Use a server name like smtp.gmail.com'), port: z.number().int().min(1).max(65535), user: z.string().max(120), pass: z.string().max(200).optional(), from: z.string().max(160) }),
    whatsappCfg: z.object({ token: z.string().max(600).optional(), phoneNumberId: z.string().max(40).regex(/^\d*$/, 'Phone number ID is digits only'), templateName: z.string().max(80).regex(/^[a-z0-9_]*$/, 'Template name: small letters, digits and _'), templateLang: z.string().max(10), billMessage: z.string().max(500) }),
    reportContent: z.object({ payments: z.boolean(), peakHour: z.boolean(), topItems: z.boolean(), expenses: z.boolean(), lowStock: z.boolean(), waste: z.boolean(), cancelled: z.boolean(), verified: z.boolean() }),
    feedbackRetentionDays: z.number().int().min(30).max(3650),
    schedule: z.object({
      dailyEnabled: z.boolean(), dailyTime: hm, weeklyEnabled: z.boolean(), weeklyWeekday: z.number().int().min(0).max(6), weeklyTime: hm,
      monthlyEnabled: z.boolean(), monthlyDay: z.number().int().min(1).max(28), monthlyTime: hm,
    }),
  }).partial(), req.body);
  try { if (b.timezone) new Intl.DateTimeFormat('en', { timeZone: b.timezone }); } catch { throw new HttpError(400, 'Unknown timezone.'); }
  const before = await getSettings();
  const set: any = { ...b };
  const flat = (key: 'schedule' | 'browserPrint' | 'reportContent') => { const v = (b as any)[key]; if (v) { delete set[key]; for (const [k, x] of Object.entries(v)) set[`${key}.${k}`] = x; } };
  flat('schedule'); flat('browserPrint'); flat('reportContent');
  if (b.emailCfg) {
    const { pass, ...rest } = b.emailCfg; delete set.emailCfg;
    for (const [k, v] of Object.entries(rest)) set[`emailCfg.${k}`] = v;
    if (pass) set['emailCfg.passEnc'] = encryptSecret(pass); // an empty box keeps the saved password
  }
  if (b.whatsappCfg) {
    const { token, ...rest } = b.whatsappCfg; delete set.whatsappCfg;
    for (const [k, v] of Object.entries(rest)) set[`whatsappCfg.${k}`] = v;
    if (token) set['whatsappCfg.tokenEnc'] = encryptSecret(token);
  }
  await Settings.updateOne({ key: 'main' }, { $set: set });
  const { emailCfg: _e, whatsappCfg: _w, ...loggable } = b as any; // never log secrets
  await audit(req, 'settings.update', 'Settings', 'main', { before: { taxMode: before.taxMode, taxBp: before.taxBp }, after: { ...loggable, ...(_e ? { emailCfg: 'changed' } : {}), ...(_w ? { whatsappCfg: 'changed' } : {}) } });
  res.json({ ok: true });
}));

// ---------- Demo data (Settings > Demo data) ----------
adminRouter.get('/demo', requirePerm('settings.manage'), asyncHandler(async (_req, res) => {
  res.json(await demoStatus());
}));

adminRouter.post('/demo/load', requirePerm('settings.manage'), asyncHandler(async (req, res) => {
  const out = await loadDemo();
  if (!out) throw new HttpError(409, 'Demo data is already loaded. Delete it first to load it again.', 'DEMO_LOADED');
  await audit(req, 'demo.load', 'Demo', 'all', { note: JSON.stringify(out.counts) });
  res.json(out);
}));

adminRouter.post('/demo/delete', requirePerm('settings.manage'), asyncHandler(async (req, res) => {
  const removed = await deleteDemo();
  await audit(req, 'demo.delete', 'Demo', 'all', { note: JSON.stringify(removed) });
  res.json({ loaded: false, removed });
}));

// Emails and WhatsApp messages cost money and can be abused as a spam relay, so each person may start only a few per hour.
const sendLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `send|${req.user?.id ?? 'x'}`, validate: { keyGeneratorIpFallback: false }, message: { error: 'Too many messages. Please try again later.' } });

// Sends one test email so the owner knows the email details typed in Settings really work.
adminRouter.post('/settings/test-email', requirePerm('settings.manage'), sendLimiter, asyncHandler(async (req, res) => {
  const { to } = parse(z.object({ to: z.string().email().max(120) }), req.body);
  // only to the owner's own saved address, so this cannot be used to mail strangers
  if ((await getSettings()).owner.email !== to.trim().toLowerCase()) throw new HttpError(400, 'Save the owner email in Settings > Reports first.');
  try { await sendEmail(to, 'AMMAS test email', 'This is a test email from AMMAS. Email is working.'); }
  catch (e: any) { throw new HttpError(502, `Email failed: ${String(e?.message ?? e).slice(0, 160)}`); }
  res.json({ ok: true });
}));

// ---------- Owner recipients and report delivery ----------
adminRouter.post('/reports/recipient', requirePerm('reports.send', 'settings.manage'), sendLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ channel: z.enum(['EMAIL', 'WHATSAPP']), target: z.string().min(5).max(120) }), req.body);
  if (b.channel === 'EMAIL' && !z.string().email().safeParse(b.target).success) throw new HttpError(400, 'Enter a valid email.');
  if (b.channel === 'WHATSAPP' && !/^\+?\d{10,15}$/.test(b.target.replace(/[\s-]/g, ''))) throw new HttpError(400, 'Enter the number with country code, e.g. +91...');
  const target = b.channel === 'EMAIL' ? b.target.trim().toLowerCase() : b.target.replace(/[\s-]/g, '');
  if (b.channel === 'EMAIL' ? !(await emailConfigured()) : !(await whatsappConfigured())) {
    throw new HttpError(503, `${b.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} sending is not set up on the server yet (see README).`, 'PROVIDER_OFF');
  }
  const field = b.channel === 'EMAIL' ? 'owner.email' : 'owner.whatsapp';
  const flag = b.channel === 'EMAIL' ? 'owner.emailVerified' : 'owner.whatsappVerified';
  await Settings.updateOne({ key: 'main' }, { $set: { [field]: target, [flag]: false } });
  try { await startVerification(b.channel, target); } catch (e: any) { throw new HttpError(502, `Could not send the code: ${e.message}`); }
  res.json({ ok: true });
}));

adminRouter.post('/reports/verify', requirePerm('reports.send', 'settings.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ channel: z.enum(['EMAIL', 'WHATSAPP']), code: z.string().min(4).max(8) }), req.body);
  const s = await getSettings();
  const target = b.channel === 'EMAIL' ? s.owner.email : s.owner.whatsapp;
  if (!target) throw new HttpError(400, 'Add the recipient first.');
  await checkVerification(b.channel, target, b.code);
  await Settings.updateOne({ key: 'main' }, { $set: { [b.channel === 'EMAIL' ? 'owner.emailVerified' : 'owner.whatsappVerified']: true } });
  await audit(req, 'reports.recipient_verified', 'Settings', 'main', { note: b.channel });
  res.json({ ok: true });
}));

adminRouter.post('/reports/send-now', requirePerm('reports.send'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('DAILY') }), req.body);
  const s = await getSettings();
  const range = b.type === 'DAILY' ? resolveRange({ range: 'today' }, s.timezone) : resolveRange({ range: b.type === 'WEEKLY' ? '7d' : '30d' }, s.timezone);
  const out = await queueReport(b.type, range, { force: true });
  if (!out.length) throw new HttpError(400, 'No verified recipient with a working provider. Verify email or WhatsApp first.', 'NO_RECIPIENT');
  res.json({ deliveries: out });
}));

adminRouter.get('/reports/deliveries', requirePerm('reports.send', 'reports.view'), asyncHandler(async (_req, res) => {
  res.json({ deliveries: await ReportDelivery.find().select('-text -whatsappText').sort({ createdAt: -1 }).limit(60) });
}));

adminRouter.post('/reports/deliveries/:id/retry', requirePerm('reports.send'), asyncHandler(async (req, res) => {
  res.json({ delivery: await retryDelivery(String(req.params.id)) });
}));

// ---------- Users and roles ----------
adminRouter.get('/roles', requirePerm('users.manage'), asyncHandler(async (_req, res) => {
  res.json({ roles: await Role.find().sort({ system: -1, key: 1 }), permissions: PERMISSIONS });
}));

/** Permissions a user effectively holds (role + grants - denies). */
async function effectiveOfUser(u: { roleKey: string; grants?: string[]; denies?: string[] }) {
  const role = await Role.findOne({ key: u.roleKey });
  return effectivePermissions(role?.permissions ?? [], u.grants ?? [], u.denies ?? []);
}
const isSubset = (a: string[], of: string[]) => a.every((x) => of.includes(x));
const NO_ESCALATION = 'You cannot give or change access that is higher than your own.';

adminRouter.put('/roles/:key', requirePerm('users.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ permissions: z.array(z.enum(PERMISSIONS)).max(100) }), req.body);
  const role = await Role.findOne({ key: req.params.key });
  if (!role) throw new HttpError(404, 'Role not found.');
  if (role.system) throw new HttpError(409, 'The Owner role cannot be edited.');
  // an administrator may only edit roles (and grant permissions) that are within their own access
  if (!isSubset(role.permissions, req.user!.permissions) || !isSubset(b.permissions, req.user!.permissions)) throw new HttpError(403, NO_ESCALATION, 'NO_ESCALATION');
  const before = role.permissions;
  role.permissions = b.permissions;
  await role.save();
  await audit(req, 'role.update', 'Role', role.key, { before, after: b.permissions });
  res.json({ role });
}));

adminRouter.get('/users', requirePerm('users.manage'), asyncHandler(async (_req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: 1 });
  res.json({ users });
}));

/** Count active users that could still manage users, excluding one candidate. */
async function otherAdmins(excludeId: string) {
  const roles = await Role.find({ permissions: 'users.manage' }).select('key');
  return User.countDocuments({ _id: { $ne: excludeId }, active: true, roleKey: { $in: roles.map((r) => r.key) }, denies: { $ne: 'users.manage' } });
}

adminRouter.post('/users', requirePerm('users.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    username: z.string().min(3).max(30).regex(/^[a-z0-9._-]+$/i, 'Letters and numbers only'), name: z.string().min(1).max(60),
    password: z.string().min(8, 'Use at least 8 characters').max(100), roleKey: z.string(), language: z.enum(['en', 'ta']).default('en'),
  }), req.body);
  const newRole = await Role.findOne({ key: b.roleKey });
  if (!newRole) throw new HttpError(400, 'Unknown role.');
  if (!isSubset(newRole.permissions, req.user!.permissions)) throw new HttpError(403, NO_ESCALATION, 'NO_ESCALATION');
  const u = await User.create({ ...b, username: b.username.toLowerCase(), passwordHash: await hash(b.password) });
  await audit(req, 'user.create', 'User', u._id, { after: { username: u.username, roleKey: u.roleKey } });
  res.status(201).json({ user: { ...u.toObject(), passwordHash: undefined } });
}));

adminRouter.put('/users/:id', requirePerm('users.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    name: z.string().min(1).max(60).optional(), roleKey: z.string().optional(), active: z.boolean().optional(),
    password: z.string().min(8).max(100).optional(), grants: z.array(z.enum(PERMISSIONS)).optional(), denies: z.array(z.enum(PERMISSIONS)).optional(),
  }), req.body);
  const u = await User.findById(req.params.id);
  if (!u) throw new HttpError(404, 'User not found.');
  // nobody can edit (reset the password of, deactivate, re-role) a user who has more access than they do
  if (!isSubset(await effectiveOfUser(u), req.user!.permissions)) throw new HttpError(403, NO_ESCALATION, 'NO_ESCALATION');
  if (b.roleKey) { const nr = await Role.findOne({ key: b.roleKey }); if (nr && !isSubset(nr.permissions, req.user!.permissions)) throw new HttpError(403, NO_ESCALATION, 'NO_ESCALATION'); }
  if (b.grants && !isSubset(b.grants, req.user!.permissions)) throw new HttpError(403, NO_ESCALATION, 'NO_ESCALATION');
  const roleAfter = b.roleKey ?? u.roleKey;
  if (b.roleKey && !(await Role.exists({ key: b.roleKey }))) throw new HttpError(400, 'Unknown role.');
  const role = await Role.findOne({ key: roleAfter });
  const staysAdmin = (b.active ?? u.active) && !!role?.permissions.includes('users.manage') && !(b.denies ?? u.denies).includes('users.manage');
  const wasAdmin = u.active && !!(await Role.findOne({ key: u.roleKey }))?.permissions.includes('users.manage');
  if (wasAdmin && !staysAdmin && (await otherAdmins(String(u._id))) === 0) {
    throw new HttpError(409, 'This is the last full-access administrator. Make someone else an administrator first.', 'LAST_ADMIN');
  }
  if (b.name) u.name = b.name;
  if (b.roleKey) u.roleKey = b.roleKey;
  if (b.active !== undefined) u.active = b.active;
  if (b.grants) u.grants = b.grants;
  if (b.denies) u.denies = b.denies;
  if (b.password) u.passwordHash = await hash(b.password);
  await u.save();
  if (b.password || b.active === false || b.roleKey || b.grants || b.denies) await Session.deleteMany({ userId: u._id });
  await audit(req, 'user.update', 'User', u._id, { after: { ...b, password: b.password ? '(changed)' : undefined } });
  res.json({ user: { ...u.toObject(), passwordHash: undefined } });
}));

// ---------- Audit and customers ----------
adminRouter.get('/audit', requirePerm('audit.view'), asyncHandler(async (req, res) => {
  const q = z.object({ action: z.string().optional(), limit: z.coerce.number().max(300).default(100) }).parse(req.query);
  const filter: any = q.action ? { action: new RegExp('^' + q.action.replace(/[^\w.]/g, '')) } : {};
  res.json({ logs: await AuditLog.find(filter).sort({ at: -1 }).limit(q.limit) });
}));

adminRouter.get('/customers/feedback', requirePerm('customers.view'), asyncHandler(async (_req, res) => {
  const rows = await Feedback.find().sort({ createdAt: -1 }).limit(200);
  const rated = rows.filter((r) => r.rating);
  res.json({ feedback: rows, averageRating: rated.length ? Math.round((rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null });
}));

adminRouter.get('/customers/export.csv', requirePerm('customers.view'), asyncHandler(async (_req, res) => {
  const rows = await Feedback.find().sort({ createdAt: -1 });
  const c = csvCell;
  const lines = [['Date', 'Table', 'Rating', 'Notes', 'Name', 'Phone', 'Email', 'Profession', 'Marketing consent'].join(','),
    ...rows.map((r) => [r.createdAt?.toISOString(), r.tableLabel, r.rating, r.notes, r.name, r.phone, r.email, r.profession, r.consentMarketing ? 'yes' : 'no'].map(c).join(','))];
  await audit(_req as any, 'customers.export', 'Feedback', 'all');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ammas-customers.csv"');
  res.send('﻿' + lines.join('\n'));
}));

adminRouter.delete('/customers/feedback/:id', requirePerm('customers.view', 'settings.manage'), asyncHandler(async (req, res) => {
  if (!req.user!.permissions.includes('settings.manage')) throw new HttpError(403, 'Only the owner can delete customer data.');
  await Feedback.deleteOne({ _id: req.params.id });
  await audit(req, 'customers.delete', 'Feedback', req.params.id);
  res.json({ ok: true });
}));
