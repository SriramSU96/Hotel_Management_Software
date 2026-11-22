import { Router } from 'express';
import { z } from 'zod';
import { CashSession, Expense, Payment, Refund } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requirePerm } from '../middleware/auth.js';
import { audit, getSettings } from '../services/core.js';
import { resolveRange } from '../lib/time.js';

export const financeRouter = Router();

// ---- Expenses ----
financeRouter.get('/expenses', requirePerm('expenses.manage'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const r = resolveRange(req.query as any, s.timezone);
  const rows = await Expense.find({ date: { $gte: r.from, $lt: r.to }, voided: { $ne: true } }).sort({ date: -1, createdAt: -1 });
  res.json({ expenses: rows, totalPaise: rows.reduce((a, e) => a + e.amountPaise, 0) });
}));

const expenseBody = z.object({
  category: z.string().min(1).max(40), amountPaise: z.number().int().min(1).max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.enum(['CASH', 'UPI', 'BANK', 'OTHER']).default('CASH'),
  vendor: z.string().max(80).optional(), note: z.string().max(200).optional(),
});

financeRouter.post('/expenses', requirePerm('expenses.manage'), asyncHandler(async (req, res) => {
  const b = parse(expenseBody, req.body);
  const s = await getSettings();
  const { startOfLocalDay } = await import('../lib/time.js');
  const e = await Expense.create({ ...b, date: startOfLocalDay(b.date, s.timezone), createdBy: req.user!.id, createdByName: req.user!.name });
  await audit(req, 'expense.create', 'Expense', e._id, { after: b });
  res.status(201).json({ expense: e });
}));

financeRouter.put('/expenses/:id', requirePerm('expenses.manage'), asyncHandler(async (req, res) => {
  const b = parse(expenseBody.partial(), req.body);
  const before = await Expense.findById(req.params.id);
  if (!before) throw new HttpError(404, 'Expense not found.');
  const patch: any = { ...b };
  if (b.date) { const s = await getSettings(); const { startOfLocalDay } = await import('../lib/time.js'); patch.date = startOfLocalDay(b.date, s.timezone); }
  const e = await Expense.findByIdAndUpdate(req.params.id, patch, { new: true });
  await audit(req, 'expense.update', 'Expense', before._id, { before: before.toObject(), after: patch });
  res.json({ expense: e });
}));

financeRouter.delete('/expenses/:id', requirePerm('expenses.manage'), asyncHandler(async (req, res) => {
  const e = await Expense.findByIdAndUpdate(req.params.id, { voided: true }, { new: true });
  if (!e) throw new HttpError(404, 'Expense not found.');
  await audit(req, 'expense.void', 'Expense', e._id);
  res.json({ ok: true });
}));

// ---- Cash sessions ----
async function expectedCash(sessionId: any, opening: number) {
  const [pay, ref] = await Promise.all([
    Payment.aggregate([{ $match: { cashSessionId: sessionId, method: 'CASH' } }, { $group: { _id: null, t: { $sum: '$amountPaise' } } }]),
    Refund.aggregate([{ $match: { cashSessionId: sessionId, method: 'CASH' } }, { $group: { _id: null, t: { $sum: '$amountPaise' } } }]),
  ]);
  const sales = pay[0]?.t ?? 0;
  const refunds = ref[0]?.t ?? 0;
  return { cashSalesPaise: sales, cashRefundsPaise: refunds, expectedPaise: opening + sales - refunds };
}

financeRouter.get('/cash-sessions/current', requirePerm('cash.manage', 'payments.record'), asyncHandler(async (_req, res) => {
  const cs = await CashSession.findOne({ status: 'OPEN' }).sort({ openedAt: -1 });
  if (!cs) return res.json({ session: null });
  res.json({ session: cs, ...(await expectedCash(cs._id, cs.openingPaise)) });
}));

financeRouter.get('/cash-sessions', requirePerm('cash.manage'), asyncHandler(async (_req, res) => {
  res.json({ sessions: await CashSession.find().sort({ openedAt: -1 }).limit(60) });
}));

financeRouter.post('/cash-sessions', requirePerm('cash.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ openingPaise: z.number().int().min(0).max(100_000_000) }), req.body);
  if (await CashSession.exists({ status: 'OPEN' })) throw new HttpError(409, 'A cash session is already open.');
  const cs = await CashSession.create({ openingPaise: b.openingPaise, openedBy: req.user!.id, openedByName: req.user!.name });
  await audit(req, 'cash.open', 'CashSession', cs._id, { after: b });
  res.status(201).json({ session: cs });
}));

financeRouter.post('/cash-sessions/:id/close', requirePerm('cash.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ countedPaise: z.number().int().min(0), note: z.string().max(300).optional() }), req.body);
  const cs = await CashSession.findById(req.params.id);
  if (!cs) throw new HttpError(404, 'Cash session not found.');
  if (cs.status === 'CLOSED') throw new HttpError(409, 'Already closed.');
  const x = await expectedCash(cs._id, cs.openingPaise);
  if (b.countedPaise !== x.expectedPaise && !b.note) throw new HttpError(400, 'Cash does not match. Please write a short reason.', 'NEEDS_NOTE');
  cs.status = 'CLOSED'; cs.closedAt = new Date(); cs.closedBy = req.user!.id as any; cs.closedByName = req.user!.name;
  cs.expectedPaise = x.expectedPaise; cs.countedPaise = b.countedPaise; cs.differencePaise = b.countedPaise - x.expectedPaise; cs.note = b.note;
  await cs.save();
  await audit(req, 'cash.close', 'CashSession', cs._id, { after: { ...x, counted: b.countedPaise } });
  res.json({ session: cs });
}));
