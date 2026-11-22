import { Router } from 'express';
import { z } from 'zod';
import { Order } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requirePerm } from '../middleware/auth.js';
import { audit, emit, getSettings } from '../services/core.js';
import { localDateString, resolveRange } from '../lib/time.js';
import { parseBillInput, phoneLast4, verdictFor } from '../lib/verify.js';
import rateLimit from 'express-rate-limit';
import { withLock } from '../lib/lock.js';

export const billsRouter = Router();

// Bill numbers are short, so guessing is slowed down per signed-in person (a real counter never checks 100 bills a minute).
const checkLimiter = rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `bill|${req.user?.id ?? 'x'}`, validate: { keyGeneratorIpFallback: false }, message: { error: 'Too many checks. Please wait a minute.' } });

/** What the verifier needs: the items, the money and the sent/verified state. No customer details beyond the last 4 digits of the phone. */
const present = (o: any) => ({
  id: String(o._id), billNo: o.billNo, kotNo: o.kotNo, type: o.type,
  items: o.items.map((i: any) => ({ name: i.name, nameTa: i.nameTa, qty: i.qty, note: i.note })),
  totalPaise: o.totalPaise, paidPaise: o.paidPaise, paymentStatus: o.paymentStatus, status: o.status,
  confirmedAt: o.confirmedAt,
  channel: o.digital?.channel ?? null, sentAt: o.digital?.sentAt ?? null, sentByName: o.digital?.sentByName ?? null, phoneLast4: o.digital?.phoneLast4 ?? null,
  verifiedAt: o.verifiedAt ?? null, verifiedByName: o.verifiedByName ?? null,
});

const idOf = (v: unknown) => {
  const id = String(v);
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(400, 'Invalid request.', 'VALIDATION');
  return id;
};

// The cashier sends the bill link on WhatsApp / SMS and the system remembers that it did. Only these bills can be verified later.
const sentBody = z.object({ channel: z.enum(['WHATSAPP', 'SMS']).default('WHATSAPP'), phone: z.string().max(20) });
billsRouter.post('/:id/digital-sent', requirePerm('orders.create'), asyncHandler(async (req, res) => {
  const id = idOf(req.params.id);
  const body = parse(sentBody, req.body);
  const last4 = phoneLast4(body.phone);
  if (!last4) throw new HttpError(400, 'Enter a valid 10-digit mobile number.', 'VALIDATION');
  const order = await Order.findOneAndUpdate(
    { _id: id, status: { $in: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] }, verifiedAt: null },
    { $set: { digital: { channel: body.channel, sentAt: new Date(), sentBy: req.user!.id, sentByName: req.user!.name, phoneLast4: last4 } } },
    { new: true },
  );
  if (!order) throw new HttpError(409, 'This bill cannot be sent now (not confirmed, or already verified).', 'NOT_SENDABLE');
  await audit(req, 'bill.digital_sent', 'Order', order._id, { note: `${order.billNo} ${body.channel} ***${last4}` });
  res.json({ bill: present(order) });
}));

// The list the cashier taps from: today's digital bills, newest first. Pending (not yet verified) bills are easy to spot.
billsRouter.get('/digital', requirePerm('bills.verify'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const r = resolveRange({ range: 'today' }, s.timezone);
  const orders = await Order.find({ 'digital.sentAt': { $gte: r.from, $lt: r.to } }).sort({ 'digital.sentAt': -1 }).limit(100);
  res.json({ bills: orders.map(present) });
}));

const q = z.object({ bill: z.unknown() });

// Staff type or tap a bill number. The customer's phone is never the proof; the system record is.
billsRouter.get('/verify', requirePerm('bills.verify'), checkLimiter, asyncHandler(async (req, res) => {
  const { bill } = parse(q, req.query);
  const s = await getSettings();
  const billNo = parseBillInput(bill, localDateString(new Date(), s.timezone).replaceAll('-', ''));
  if (!billNo) throw new HttpError(400, 'Enter the bill number, for example 12 or AM-20261120-0012.', 'VALIDATION');
  const order = await Order.findOne({ billNo });
  const verdict = verdictFor(order);
  if (verdict !== 'GENUINE') await audit(req, 'bill.verify_failed', 'Order', order?._id ?? undefined, { note: `${String(bill).slice(0, 30)} -> ${verdict}` });
  res.json({ verdict, bill: order && order.status !== 'DRAFT' ? present(order) : null });
}));

// Mark the digital bill as verified. Exactly once: a forwarded or reused bill gets "Already verified" the second time.
billsRouter.post('/:id/verified', requirePerm('bills.verify'), checkLimiter, asyncHandler(async (req, res) => {
  const id = idOf(req.params.id);
  const result = await withLock(`verified:${id}`, async () => {
    const won = await Order.findOneAndUpdate(
      { _id: id, status: { $in: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] }, paymentStatus: 'PAID', 'digital.sentAt': { $ne: null }, verifiedAt: null },
      { $set: { verifiedAt: new Date(), verifiedBy: req.user!.id, verifiedByName: req.user!.name } },
      { new: true },
    );
    if (won) return { ok: true as const, order: won };
    return { ok: false as const, order: await Order.findById(id) };
  });
  if (result.ok) {
    await audit(req, 'bill.verified', 'Order', result.order._id, { note: result.order.billNo ?? undefined });
    emit('orders:changed', { id });
    return res.json({ verdict: 'GENUINE', bill: present(result.order) });
  }
  const verdict = verdictFor(result.order);
  await audit(req, 'bill.verify_failed', 'Order', result.order?._id, { note: `verify ${id} -> ${verdict}` });
  const msg: Record<string, string> = {
    ALREADY_VERIFIED: `Already verified${result.order?.verifiedByName ? ` by ${result.order.verifiedByName}` : ''}. Do not accept it again.`,
    NOT_FOUND: 'Bill not found.', NOT_SENT: 'This bill was not sent digitally by AMMAS. It is fake.', NOT_PAID: 'This bill is not paid.',
    CANCELLED: 'This order was cancelled.', REFUNDED: 'This bill was refunded.',
  };
  throw new HttpError(409, msg[verdict] ?? 'Cannot verify this bill.', verdict);
}));
