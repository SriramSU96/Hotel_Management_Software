import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { PrintJob, Settings } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requirePerm } from '../middleware/auth.js';
import { audit, emit, getSettings } from '../services/core.js';
import { claimNext, reportResult, retryJob } from '../services/printing.js';
import { config } from '../config.js';

export const printingRouter = Router();
export const bridgeRouter = Router();

function bridgeAuth(req: Request, _res: Response, next: NextFunction) {
  const expected = config.PRINT_BRIDGE_TOKEN;
  if (!expected) return next(new HttpError(503, 'Print bridge is not configured on the server.', 'BRIDGE_OFF'));
  const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return next(new HttpError(401, 'Bad bridge token.'));
  next();
}

// ---- Called by the local print bridge (token-authenticated, nothing else is exposed) ----
bridgeRouter.use(bridgeAuth);

bridgeRouter.post('/claim', asyncHandler(async (_req, res) => {
  const job = await claimNext();
  const s = await getSettings();
  res.json({ job: job ? { id: job._id, kind: job.kind, lines: job.lines, isCopy: job.isCopy, receiptWidth: s.receiptWidth } : null });
}));

bridgeRouter.post('/:id/result', asyncHandler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['PRINTED', 'SENT', 'FAILED']), error: z.string().max(300).optional() }), req.body);
  const job = await reportResult(String(req.params.id), b);
  res.json({ ok: true, status: job.status });
}));

bridgeRouter.post('/heartbeat', asyncHandler(async (req, res) => {
  const b = parse(z.object({ ok: z.boolean(), detail: z.string().max(200).optional(), bridge: z.string().max(60).optional() }), req.body);
  await Settings.updateOne({ key: 'main' }, { $set: { printerHeartbeat: { at: new Date(), ...b } } });
  emit('print:status');
  res.json({ ok: true });
}));

// ---- Called by the app ----
printingRouter.get('/status', requirePerm('printers.view', 'orders.create'), asyncHandler(async (_req, res) => {
  const s = await getSettings();
  const hb: any = s.printerHeartbeat ?? {};
  const fresh = hb.at && Date.now() - new Date(hb.at).getTime() < 45_000;
  const [pending, failed] = await Promise.all([
    PrintJob.countDocuments({ status: { $in: ['QUEUED', 'PRINTING'] } }),
    PrintJob.countDocuments({ status: 'FAILED' }),
  ]);
  const browser = s.printerConnection === 'BROWSER'; // no bridge in this mode: the cashier prints from the screen
  res.json({
    bridgeConfigured: !!config.PRINT_BRIDGE_TOKEN,
    bridgeOnline: browser || !!fresh,
    printerOk: browser || (!!fresh && hb.ok !== false),
    detail: browser ? 'Printing from this computer' : fresh ? hb.detail : 'Print bridge is not connected',
    lastSeen: hb.at ?? null, pending, failed, connection: s.printerConnection,
  });
}));

printingRouter.get('/jobs', requirePerm('printers.view', 'orders.create'), asyncHandler(async (req, res) => {
  const pendingOnly = req.query.pending !== '0';
  const filter = pendingOnly ? { status: { $in: ['QUEUED', 'PRINTING', 'FAILED', 'SENT'] } } : {};
  const jobs = await PrintJob.find(filter).select('-lines').sort({ createdAt: -1 }).limit(100);
  res.json({ jobs });
}));

printingRouter.get('/jobs/:id', requirePerm('printers.view', 'orders.create'), asyncHandler(async (req, res) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) throw new HttpError(404, 'Print job not found.');
  res.json({ job });
}));

printingRouter.post('/jobs/:id/retry', requirePerm('printers.view', 'orders.create'), asyncHandler(async (req, res) => {
  const job = await retryJob(String(req.params.id));
  await audit(req, 'print.retry', 'PrintJob', job._id);
  res.json({ job: { id: job._id, status: job.status } });
}));

printingRouter.post('/jobs/:id/cancel', requirePerm('printers.manage'), asyncHandler(async (req, res) => {
  const job = await PrintJob.findOneAndUpdate({ _id: req.params.id, status: { $in: ['QUEUED', 'FAILED', 'SENT'] } }, { status: 'CANCELLED' }, { new: true });
  if (!job) throw new HttpError(409, 'This print job cannot be cancelled.');
  await audit(req, 'print.cancel', 'PrintJob', job._id);
  emit('print:changed', { id: String(job._id) });
  res.json({ job: { id: job._id, status: job.status } });
}));

printingRouter.post('/test', requirePerm('printers.manage'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const w = s.receiptWidth;
  const lines = [
    'AMMAS PRINTER TEST'.padStart(Math.floor((w + 18) / 2)), '-'.repeat(w),
    '1234567890'.repeat(Math.ceil(w / 10)).slice(0, w), 'Width ' + w + ' columns',
    'Tamil: அம்மா (needs printer support)', '-'.repeat(w), 'If you can read this, printing works.',
  ];
  const { Order } = await import('../models/index.js');
  const order = await Order.findOne().select('_id');
  const key = `TEST:${Date.now()}`;
  const job = await PrintJob.create({
    idempotencyKey: key, orderId: order?._id ?? undefined, kind: 'BILL', lines, createdByName: req.user!.name,
    events: [{ at: new Date(), status: 'QUEUED', note: 'Test page' }],
  } as any);
  emit('print:changed', { id: String(job._id) });
  res.json({ job: { id: job._id } });
}));
