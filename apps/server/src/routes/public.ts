import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Feedback, Order, Table } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { getSettings } from '../services/core.js';
import { paiseToString } from '../lib/money.js';

export const publicRouter = Router();
const limiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try later.' } });

publicRouter.get('/table/:token', asyncHandler(async (req, res) => {
  const t = await Table.findOne({ publicToken: req.params.token, active: true });
  if (!t) throw new HttpError(404, 'This QR code is not active.');
  const s = await getSettings();
  res.json({ restaurantName: s.restaurantName, tableLabel: t.label });
}));

/** The QR collects feedback only. It never creates an order. Every personal field is optional. */
publicRouter.post('/feedback/:token', limiter, asyncHandler(async (req, res) => {
  const t = await Table.findOne({ publicToken: req.params.token, active: true });
  if (!t) throw new HttpError(404, 'This QR code is not active.');
  const b = parse(z.object({
    rating: z.number().int().min(1).max(5).optional(), notes: z.string().max(1000).optional(),
    name: z.string().max(80).optional(), phone: z.string().max(20).optional(), email: z.string().email().max(120).optional().or(z.literal('')),
    profession: z.string().max(80).optional(),
    consentStoreContact: z.boolean().default(false), consentMarketing: z.boolean().default(false),
    website: z.string().max(0).optional(), // honeypot: bots fill this
  }), req.body);
  if (b.website) return res.json({ ok: true });
  const hasContact = !!(b.name || b.phone || b.email || b.profession);
  const keep = b.consentStoreContact && hasContact;
  if (!b.rating && !b.notes && !keep) throw new HttpError(400, 'Please add a rating or a note.');
  await Feedback.create({
    tableId: t._id, tableLabel: t.label, rating: b.rating, notes: b.notes,
    // contact details are stored only with explicit consent
    name: keep ? b.name : undefined, phone: keep ? b.phone : undefined, email: keep ? b.email || undefined : undefined, profession: keep ? b.profession : undefined,
    consentStoreContact: keep, consentMarketing: keep && b.consentMarketing,
  });
  res.status(201).json({ ok: true });
}));

/** Digital receipt (unguessable link, no customer or payment-method details). */
publicRouter.get('/receipt/:token', asyncHandler(async (req, res) => {
  const o = await Order.findOne({ receiptToken: req.params.token, status: { $ne: 'DRAFT' } });
  if (!o) throw new HttpError(404, 'Receipt not found.');
  const s = await getSettings();
  res.json({
    restaurant: { name: s.restaurantName, address: s.address, phone: s.phone, gstin: s.gstin, footer: s.billFooter },
    billNo: o.billNo, at: o.confirmedAt, type: o.type, tableLabel: o.tableLabel,
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, unit: paiseToString(i.unitPricePaise), total: paiseToString(i.unitPricePaise * i.qty) })),
    subtotal: paiseToString(o.subtotalPaise), discount: paiseToString(o.discountPaise), tax: paiseToString(o.taxPaise), total: paiseToString(o.totalPaise),
    taxBp: o.taxBp, paymentStatus: o.paymentStatus,
  });
}));
