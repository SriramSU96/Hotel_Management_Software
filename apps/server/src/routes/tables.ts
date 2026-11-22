import { Router } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { Table } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requireLogin, requirePerm } from '../middleware/auth.js';
import { audit } from '../services/core.js';
import { config } from '../config.js';

export const tablesRouter = Router();
const token = () => crypto.randomBytes(12).toString('base64url');

tablesRouter.get('/', requireLogin, asyncHandler(async (_req, res) => {
  const tables = await Table.find({ active: true }).sort({ sortOrder: 1, label: 1 });
  res.json({ tables });
}));

tablesRouter.post('/', requirePerm('tables.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ label: z.string().min(1).max(10), capacity: z.number().int().min(1).max(40).optional() }), req.body);
  const count = await Table.countDocuments();
  const t = await Table.create({ ...b, publicToken: token(), sortOrder: count + 1 });
  await audit(req, 'table.create', 'Table', t._id, { after: b });
  res.status(201).json({ table: t });
}));

tablesRouter.put('/:id', requirePerm('tables.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ label: z.string().min(1).max(10).optional(), capacity: z.number().int().min(1).max(40).optional(), active: z.boolean().optional() }), req.body);
  const existing = await Table.findById(req.params.id);
  if (!existing) throw new HttpError(404, 'Table not found.');
  if (b.active === false && existing.activeOrderId) throw new HttpError(409, 'This table has an open order.');
  Object.assign(existing, b);
  await existing.save();
  await audit(req, 'table.update', 'Table', existing._id, { after: b });
  res.json({ table: existing });
}));

tablesRouter.post('/:id/rotate-qr', requirePerm('tables.manage'), asyncHandler(async (req, res) => {
  const t = await Table.findByIdAndUpdate(req.params.id, { publicToken: token() }, { new: true });
  if (!t) throw new HttpError(404, 'Table not found.');
  await audit(req, 'table.qr_rotate', 'Table', t._id);
  res.json({ table: t });
}));

tablesRouter.get('/:id/qr.svg', requirePerm('tables.manage'), asyncHandler(async (req, res) => {
  const t = await Table.findById(req.params.id);
  if (!t) throw new HttpError(404, 'Table not found.');
  const url = `${config.PUBLIC_URL.replace(/\/$/, '')}/f/${t.publicToken}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
}));
