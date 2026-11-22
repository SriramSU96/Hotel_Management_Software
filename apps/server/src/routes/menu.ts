import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { Category, PriceHistory, Product, Table } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requireLogin, requirePerm } from '../middleware/auth.js';
import { audit, emit } from '../services/core.js';
import { config } from '../config.js';

export const menuRouter = Router();
export const uploadDir = path.resolve(config.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

const paise = z.number().int().min(0).max(10_000_000);
const optPaise = paise.nullable().optional();

menuRouter.get('/categories', requireLogin, asyncHandler(async (_req, res) => {
  res.json({ categories: await Category.find().sort({ sortOrder: 1, name: 1 }) });
}));

menuRouter.post('/categories', requirePerm('menu.edit'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(60), nameTa: z.string().max(80).optional(), sortOrder: z.number().int().optional() }), req.body);
  const c = await Category.create(b);
  await audit(req, 'category.create', 'Category', c._id, { after: b });
  res.status(201).json({ category: c });
}));

menuRouter.put('/categories/:id', requirePerm('menu.edit'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(60).optional(), nameTa: z.string().max(80).optional(), sortOrder: z.number().int().optional(), active: z.boolean().optional() }), req.body);
  const c = await Category.findByIdAndUpdate(req.params.id, b, { new: true });
  if (!c) throw new HttpError(404, 'Category not found.');
  await audit(req, 'category.update', 'Category', c._id, { after: b });
  res.json({ category: c });
}));

menuRouter.get('/products', requireLogin, asyncHandler(async (req, res) => {
  const all = req.query.all === '1' && req.user!.permissions.includes('menu.edit');
  const products = await Product.find(all ? {} : { active: true }).sort({ sortOrder: 1, name: 1 });
  res.json({ products });
}));

const productBody = z.object({
  categoryId: z.string().min(1), name: z.string().min(1).max(80), nameTa: z.string().max(100).optional(),
  description: z.string().max(300).optional(), prepNote: z.string().max(200).optional(),
  pricePaise: paise, takeawayPricePaise: optPaise, parcelPricePaise: optPaise, starred: z.boolean().optional(),
  status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'SOLD_OUT']).optional(), sortOrder: z.number().int().optional(),
});

menuRouter.post('/products', requirePerm('menu.edit', 'price.edit'), asyncHandler(async (req, res) => {
  if (!req.user!.permissions.includes('price.edit')) throw new HttpError(403, 'Only an owner or manager can set prices.');
  const b = parse(productBody, req.body);
  const p = await Product.create(b);
  await PriceHistory.create({ productId: p._id, oldPaise: null, newPaise: p.pricePaise, reason: 'Created', by: req.user!.id, byName: req.user!.name });
  await audit(req, 'product.create', 'Product', p._id, { after: b });
  emit('menu:changed');
  res.status(201).json({ product: p });
}));

menuRouter.put('/products/:id', requirePerm('menu.edit'), asyncHandler(async (req, res) => {
  const b = parse(productBody.omit({ pricePaise: true, takeawayPricePaise: true, parcelPricePaise: true }).partial().extend({ active: z.boolean().optional() }), req.body);
  const p = await Product.findByIdAndUpdate(req.params.id, b, { new: true });
  if (!p) throw new HttpError(404, 'Product not found.');
  await audit(req, 'product.update', 'Product', p._id, { after: b });
  emit('menu:changed');
  res.json({ product: p });
}));

menuRouter.put('/products/:id/price', requirePerm('price.edit'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ pricePaise: paise.optional(), takeawayPricePaise: optPaise, parcelPricePaise: optPaise, reason: z.string().max(200).optional() }), req.body);
  const p = await Product.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Product not found.');
  const before = { dineIn: p.pricePaise, takeaway: p.takeawayPricePaise ?? null, parcel: p.parcelPricePaise ?? null };
  if (b.pricePaise != null && b.pricePaise !== p.pricePaise) {
    const old = p.pricePaise;
    p.pricePaise = b.pricePaise;
    await PriceHistory.create({ productId: p._id, oldPaise: old, newPaise: b.pricePaise, reason: b.reason, by: req.user!.id, byName: req.user!.name });
  }
  if (b.takeawayPricePaise !== undefined) p.takeawayPricePaise = b.takeawayPricePaise;
  if (b.parcelPricePaise !== undefined) p.parcelPricePaise = b.parcelPricePaise;
  if (p.isModified()) {
    await p.save();
    await audit(req, 'product.price', 'Product', p._id, { before, after: { dineIn: p.pricePaise, takeaway: p.takeawayPricePaise ?? null, parcel: p.parcelPricePaise ?? null }, note: b.reason });
    emit('menu:changed');
  }
  res.json({ product: p });
}));

// Star = show in the POS Quick Order row. Menu editors only.
menuRouter.put('/products/:id/star', requirePerm('menu.edit'), asyncHandler(async (req, res) => {
  const { starred } = parse(z.object({ starred: z.boolean() }), req.body);
  const p = await Product.findByIdAndUpdate(req.params.id, { starred }, { new: true });
  if (!p) throw new HttpError(404, 'Product not found.');
  await audit(req, 'product.star', 'Product', p._id, { after: starred });
  emit('menu:changed');
  res.json({ product: p });
}));

menuRouter.get('/products/:id/price-history', requirePerm('price.edit'), asyncHandler(async (req, res) => {
  res.json({ history: await PriceHistory.find({ productId: req.params.id }).sort({ createdAt: -1 }).limit(50) });
}));

// Quick availability toggle is allowed for kitchen as well as menu editors.
menuRouter.put('/products/:id/availability', requirePerm('menu.edit', 'kitchen.update'), asyncHandler(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'SOLD_OUT']) }), req.body);
  const p = await Product.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!p) throw new HttpError(404, 'Product not found.');
  await audit(req, 'product.availability', 'Product', p._id, { after: status });
  emit('menu:changed');
  res.json({ product: p });
}));

menuRouter.post('/products/:id/image', requirePerm('menu.edit'), upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Please choose a JPG, PNG or WebP photo (max 6 MB).');
  const p = await Product.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Product not found.');
  const name = `${crypto.randomBytes(8).toString('hex')}.webp`;
  // square crop + resize keeps tiles uniform and files small
  try {
    // re-encoding to WebP also strips anything hidden inside the file; the pixel cap stops decompression bombs
    await sharp(req.file.buffer, { limitInputPixels: 120_000_000 }).rotate().resize(640, 640, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(uploadDir, name));
  } catch {
    throw new HttpError(400, 'That file is not a valid photo. Please choose a JPG, PNG or WebP.', 'BAD_IMAGE');
  }
  p.imageUrl = `/uploads/${name}`;
  await p.save();
  await audit(req, 'product.image', 'Product', p._id);
  emit('menu:changed');
  res.json({ product: p });
}));
