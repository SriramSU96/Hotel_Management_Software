import { Router } from 'express';
import { Expense, Order, Payment, StockMovement } from '../models/index.js';
import { asyncHandler } from '../middleware/error.js';
import { requirePerm } from '../middleware/auth.js';
import { getSettings } from './../services/core.js';
import { resolveRange } from '../lib/time.js';
import { buildSummary } from '../services/reports.js';
import { paiseToString } from '../lib/money.js';
import { csvCell } from '../lib/csv.js';

export const reportsRouter = Router();

reportsRouter.get('/summary', requirePerm('reports.view'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const r = resolveRange(req.query as any, s.timezone);
  res.json(await buildSummary(r, req.query.compare !== '0'));
}));


/** Bills the staff confirmed as real digital bills in the range: what, how much, who and when. Plus bills sent but never verified. */
async function verifiedReport(r: ReturnType<typeof resolveRange>) {
  const orders = await Order.find({ verifiedAt: { $gte: r.from, $lt: r.to } }).sort({ verifiedAt: -1 }).limit(2000);
  const pays = await Payment.find({ orderId: { $in: orders.map((o) => o._id) } });
  const methods = new Map<string, Set<string>>();
  for (const p of pays) { const k = String(p.orderId); (methods.get(k) ?? methods.set(k, new Set()).get(k)!).add(p.method); }
  const rows = orders.map((o: any) => ({
    id: String(o._id), billNo: o.billNo, type: o.type,
    items: o.items.map((i: any) => ({ name: i.name, qty: i.qty, note: i.note })),
    totalPaise: o.totalPaise, paidPaise: o.paidPaise, payment: [...(methods.get(String(o._id)) ?? [])].join(' + ') || null,
    channel: o.digital?.channel ?? null, phoneLast4: o.digital?.phoneLast4 ?? null,
    sentAt: o.digital?.sentAt ?? null, sentByName: o.digital?.sentByName ?? null,
    verifiedAt: o.verifiedAt, verifiedByName: o.verifiedByName ?? null,
    secondsToVerify: o.digital?.sentAt && o.verifiedAt ? Math.max(0, Math.round((+o.verifiedAt - +o.digital.sentAt) / 1000)) : null,
  }));
  const sentNotVerified = await Order.countDocuments({ 'digital.sentAt': { $gte: r.from, $lt: r.to }, verifiedAt: null });
  const byVerifier: Record<string, { count: number; totalPaise: number }> = {};
  const byChannel: Record<string, number> = {};
  let totalPaise = 0, secs = 0, secsN = 0;
  for (const x of rows) {
    totalPaise += x.totalPaise;
    const v = (byVerifier[x.verifiedByName ?? 'Unknown'] ??= { count: 0, totalPaise: 0 }); v.count++; v.totalPaise += x.totalPaise;
    byChannel[x.channel ?? 'UNKNOWN'] = (byChannel[x.channel ?? 'UNKNOWN'] ?? 0) + 1;
    if (x.secondsToVerify != null) { secs += x.secondsToVerify; secsN++; }
  }
  return { rows, summary: { count: rows.length, totalPaise, sentNotVerified, avgSecondsToVerify: secsN ? Math.round(secs / secsN) : null, byVerifier, byChannel }, range: { label: r.label, fromDate: r.fromDate, toDate: r.toDate } };
}

reportsRouter.get('/verified', requirePerm('reports.view'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  res.json(await verifiedReport(resolveRange(req.query as any, s.timezone)));
}));

const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

/** CSV exports carry the date range and a generated-at stamp. */
reportsRouter.get('/export/:kind.csv', requirePerm('reports.view'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const r = resolveRange(req.query as any, s.timezone);
  const head = [[`AMMAS report: ${req.params.kind}`], [`Range: ${r.label}`], [`Generated: ${new Date().toISOString()}`], []];
  let body: unknown[][] = [];
  switch (req.params.kind) {
    case 'sales': {
      const orders = await Order.find({ confirmedAt: { $gte: r.from, $lt: r.to }, status: { $ne: 'CANCELLED' } }).sort({ confirmedAt: 1 });
      body = [['Bill', 'Time', 'Type', 'Table', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Payment status'],
        ...orders.map((o) => [o.billNo, o.confirmedAt?.toISOString(), o.type, o.tableLabel, paiseToString(o.subtotalPaise), paiseToString(o.discountPaise), paiseToString(o.taxPaise), paiseToString(o.totalPaise), paiseToString(o.paidPaise), o.paymentStatus])];
      break;
    }
    case 'verified': {
      const v = await verifiedReport(r);
      body = [['Bill', 'Verified at', 'Verified by', 'Type', 'Items', 'Total', 'Payment', 'Sent via', 'Phone (last 4)', 'Sent at', 'Sent by', 'Seconds sent to verified'],
        ...v.rows.map((x) => [x.billNo, x.verifiedAt?.toISOString(), x.verifiedByName, x.type, x.items.map((i: any) => `${i.qty} x ${i.name}`).join('; '), paiseToString(x.totalPaise), x.payment, x.channel, x.phoneLast4, x.sentAt?.toISOString?.(), x.sentByName, x.secondsToVerify])];
      break;
    }
    case 'products': {
      const sm = await buildSummary(r, false);
      body = [['Product', 'Category', 'Qty', 'Sales'], ...sm.topByQty.map((p) => [p.name, p.category, p.qty, paiseToString(p.salesPaise)])];
      break;
    }
    case 'payments': {
      const pays = await Payment.find({ createdAt: { $gte: r.from, $lt: r.to } }).sort({ createdAt: 1 });
      body = [['Time', 'Method', 'Amount', 'UPI ref', 'By'], ...pays.map((p) => [p.createdAt?.toISOString(), p.method, paiseToString(p.amountPaise), p.upiRef, p.byName])];
      break;
    }
    case 'expenses': {
      const ex = await Expense.find({ date: { $gte: r.from, $lt: r.to }, voided: { $ne: true } }).sort({ date: 1 });
      body = [['Date', 'Category', 'Amount', 'Method', 'Vendor', 'Note'], ...ex.map((e) => [e.date.toISOString().slice(0, 10), e.category, paiseToString(e.amountPaise), e.method, e.vendor, e.note])];
      break;
    }
    case 'stock': {
      const mv = await StockMovement.find({ createdAt: { $gte: r.from, $lt: r.to } }).sort({ createdAt: 1 }).populate('ingredientId', 'name');
      body = [['Time', 'Item', 'Type', 'Qty', 'Unit', 'Balance after (base unit)', 'Reason', 'By'],
        ...mv.map((m: any) => [m.createdAt?.toISOString(), m.ingredientId?.name, m.type, m.qty, m.unit, m.balanceAfter, m.reason ?? m.wasteReason, m.byName])];
      break;
    }
    default:
      return res.status(404).json({ error: 'Unknown report.' });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ammas-${req.params.kind}-${r.fromDate}_${r.toDate}.csv"`);
  res.send('﻿' + csv([...head, ...body]));
}));
