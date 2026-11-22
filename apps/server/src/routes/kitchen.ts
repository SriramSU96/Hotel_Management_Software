import { Router } from 'express';
import { z } from 'zod';
import { Order, PrintJob } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requirePerm } from '../middleware/auth.js';
import { emit } from '../services/core.js';
import { event } from '../services/orders.js';
import { enqueuePrint } from '../services/printing.js';

export const kitchenRouter = Router();

/** KOT view: deliberately omits customer details, payment data and prices. */
function ticket(o: any) {
  return {
    id: o._id, kotNo: o.kotNo, billNo: o.billNo, type: o.type, tableLabel: o.tableLabel, status: o.status,
    confirmedAt: o.confirmedAt, preparingAt: o.preparingAt, readyAt: o.readyAt,
    items: o.items.map((i: any) => ({ name: i.name, nameTa: i.nameTa, qty: i.qty, note: i.note })),
  };
}

kitchenRouter.get('/tickets', requirePerm('kitchen.view'), asyncHandler(async (_req, res) => {
  const orders = await Order.find({ status: { $in: ['CONFIRMED', 'PREPARING', 'READY'] } }).sort({ confirmedAt: 1 });
  res.json({ tickets: orders.map(ticket), serverTime: new Date() });
}));

const NEXT: Record<string, string[]> = {
  CONFIRMED: ['PREPARING', 'READY'],
  PREPARING: ['READY'],
  READY: ['PREPARING'],
};

kitchenRouter.put('/tickets/:id/status', requirePerm('kitchen.update'), asyncHandler(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['PREPARING', 'READY']) }), req.body);
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.status === status) return res.json({ ticket: ticket(o) });
  if (!NEXT[o.status]?.includes(status)) throw new HttpError(409, 'This ticket cannot move to that step.');
  o.status = status;
  if (status === 'PREPARING') o.preparingAt = o.preparingAt ?? new Date();
  if (status === 'READY') { o.preparingAt = o.preparingAt ?? new Date(); o.readyAt = new Date(); }
  event(o, status, req.user!.name);
  await o.save();
  emit('orders:changed', { id: String(o._id) });
  emit('kitchen:changed', { id: String(o._id) });
  res.json({ ticket: ticket(o) });
}));

kitchenRouter.post('/tickets/:id/print', requirePerm('kot.reprint'), asyncHandler(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  const job = await enqueuePrint(o, 'KOT', { isCopy: true, byName: req.user!.name });
  res.json({ job: { id: job._id, status: job.status } });
}));
