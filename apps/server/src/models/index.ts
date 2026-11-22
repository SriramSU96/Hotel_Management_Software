import mongoose, { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const { ObjectId } = Schema.Types;
const opts = { timestamps: true } as const;
/** Rows created by Settings > Demo data carry demo:true so they can be removed without touching real data. */
const DEMO = { type: Boolean, default: false, index: true };

// ---------- Access ----------
const roleSchema = new Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  nameTa: String,
  permissions: [String],
  system: { type: Boolean, default: false },
  migrations: [String],
}, opts);
export const Role = model('Role', roleSchema);

const userSchema = new Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  roleKey: { type: String, required: true },
  grants: [String],
  denies: [String],
  active: { type: Boolean, default: true },
  language: { type: String, enum: ['en', 'ta'], default: 'en' },
  lastLoginAt: Date,
}, opts);
export const User = model('User', userSchema);

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  device: String,
  ip: String,
  lastSeenAt: Date,
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, opts);
export const Session = model('Session', sessionSchema);

// ---------- Menu ----------
const categorySchema = new Schema({
  name: { type: String, required: true },
  nameTa: String,
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, opts);
categorySchema.add({ demo: DEMO });
export const Category = model('Category', categorySchema);

const productSchema = new Schema({
  categoryId: { type: ObjectId, ref: 'Category', required: true, index: true },
  name: { type: String, required: true },
  nameTa: String,
  description: String,
  prepNote: String,
  pricePaise: { type: Number, required: true, min: 0 },
  // optional per-order-type prices; empty means "same as dine-in"
  takeawayPricePaise: { type: Number, min: 0, default: null },
  parcelPricePaise: { type: Number, min: 0, default: null },
  // starred items appear in the POS Quick Order row
  starred: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ['AVAILABLE', 'UNAVAILABLE', 'SOLD_OUT'], default: 'AVAILABLE' },
  imageUrl: String,
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, opts);
productSchema.index({ name: 'text', nameTa: 'text' });
productSchema.add({ demo: DEMO });
export const Product = model('Product', productSchema);

const priceHistorySchema = new Schema({
  productId: { type: ObjectId, ref: 'Product', index: true },
  oldPaise: Number,
  newPaise: Number,
  reason: String,
  by: { type: ObjectId, ref: 'User' },
  byName: String,
}, opts);
export const PriceHistory = model('PriceHistory', priceHistorySchema);

// ---------- Tables ----------
const tableSchema = new Schema({
  label: { type: String, required: true, unique: true },
  capacity: Number,
  publicToken: { type: String, required: true, unique: true },
  activeOrderId: { type: ObjectId, ref: 'Order', default: null },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, opts);
tableSchema.add({ demo: DEMO });
export const Table = model('Table', tableSchema);

// ---------- Orders ----------
const orderItemSchema = new Schema({
  productId: { type: ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  nameTa: String,
  category: String,
  unitPricePaise: { type: Number, required: true },
  qty: { type: Number, required: true, min: 1 },
  note: String,
}, { _id: true });

const orderSchema = new Schema({
  idempotencyKey: { type: String, unique: true, sparse: true },
  billNo: { type: String, unique: true, sparse: true },
  kotNo: Number,
  type: { type: String, enum: ['DINE_IN', 'TAKEAWAY', 'PARCEL'], required: true },
  tableId: { type: ObjectId, ref: 'Table', default: null },
  tableLabel: String,
  status: { type: String, enum: ['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'], default: 'DRAFT', index: true },
  paymentStatus: { type: String, enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED'], default: 'UNPAID', index: true },
  items: [orderItemSchema],
  taxMode: { type: String, default: 'NONE' },
  taxBp: { type: Number, default: 0 },
  subtotalPaise: { type: Number, default: 0 },
  discountPaise: { type: Number, default: 0 },
  taxPaise: { type: Number, default: 0 },
  totalPaise: { type: Number, default: 0 },
  paidPaise: { type: Number, default: 0 },
  refundedPaise: { type: Number, default: 0 },
  customerName: String,
  customerPhone: String,
  paperCopy: { type: String, enum: ['PENDING', 'PRINTED', 'NOT_PRINTED'], default: 'PENDING' },
  receiptToken: { type: String, index: true },
  confirmLock: { type: Boolean, default: false },
  // set when the bill is sent to the customer on WhatsApp/SMS (only these bills are checked later)
  digital: { type: new Schema({ channel: { type: String, enum: ['WHATSAPP', 'SMS'] }, sentAt: Date, sentBy: { type: ObjectId, ref: 'User' }, sentByName: String, phoneLast4: String }, { _id: false }), default: undefined },
  // set once when staff confirm the customer's digital bill is real; a bill can be verified only once
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: ObjectId, ref: 'User' },
  verifiedByName: String,
  createdBy: { type: ObjectId, ref: 'User' },
  createdByName: String,
  confirmedAt: { type: Date, index: true },
  preparingAt: Date,
  readyAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelReason: String,
  // NOTE: a plain object with a key named `type` is read by Mongoose as a type declaration, so the event shape must be an explicit sub-schema.
  events: [new Schema({ at: Date, type: String, by: String, note: String }, { _id: false })],
}, opts);
orderSchema.index({ createdAt: -1 });
orderSchema.add({ demo: DEMO });
export const Order = model('Order', orderSchema);

const paymentSchema = new Schema({
  orderId: { type: ObjectId, ref: 'Order', required: true, index: true },
  idempotencyKey: { type: String, required: true, unique: true },
  method: { type: String, enum: ['CASH', 'UPI'], required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  tenderedPaise: Number,
  upiVerified: { type: Boolean, default: false },
  upiRef: String,
  cashSessionId: { type: ObjectId, ref: 'CashSession' },
  by: { type: ObjectId, ref: 'User' },
  byName: String,
}, opts);
paymentSchema.index({ createdAt: -1 });
paymentSchema.add({ demo: DEMO });
export const Payment = model('Payment', paymentSchema);

const refundSchema = new Schema({
  orderId: { type: ObjectId, ref: 'Order', required: true, index: true },
  idempotencyKey: { type: String, required: true, unique: true },
  method: { type: String, enum: ['CASH', 'UPI'], required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true },
  cashSessionId: { type: ObjectId, ref: 'CashSession' },
  by: { type: ObjectId, ref: 'User' },
  byName: String,
}, opts);
refundSchema.index({ createdAt: -1 });
export const Refund = model('Refund', refundSchema);

// ---------- Printing ----------
const printJobSchema = new Schema({
  idempotencyKey: { type: String, required: true, unique: true },
  orderId: { type: ObjectId, ref: 'Order', index: true },
  kind: { type: String, enum: ['BILL', 'KOT'], required: true },
  isCopy: { type: Boolean, default: false },
  copyOfJobId: { type: ObjectId, ref: 'PrintJob' },
  billNo: String,
  // QUEUED -> PRINTING -> PRINTED | SENT (sent, not confirmed by printer) | FAILED | CANCELLED
  status: { type: String, enum: ['QUEUED', 'PRINTING', 'PRINTED', 'SENT', 'FAILED', 'CANCELLED'], default: 'QUEUED', index: true },
  attempts: { type: Number, default: 0 },
  lastError: String,
  claimedAt: Date,
  finishedAt: Date,
  lines: [String],
  events: [{ at: Date, status: String, note: String, _id: false }],
  createdByName: String,
}, opts);
export const PrintJob = model('PrintJob', printJobSchema);

// ---------- Stock ----------
const ingredientSchema = new Schema({
  name: { type: String, required: true, unique: true },
  nameTa: String,
  baseUnit: { type: String, enum: ['pcs', 'kg', 'g', 'L', 'ml', 'packet', 'box'], required: true },
  lastUnit: String,
  qty: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 0 },
  costPerBasePaise: { type: Number, default: null },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, opts);
ingredientSchema.add({ demo: DEMO });
export const Ingredient = model('Ingredient', ingredientSchema);

const stockMovementSchema = new Schema({
  ingredientId: { type: ObjectId, ref: 'Ingredient', required: true, index: true },
  type: { type: String, enum: ['OPENING', 'PURCHASE', 'ADJUST', 'COUNT', 'WASTE'], required: true },
  qty: Number,
  unit: String,
  deltaBase: { type: Number, required: true },
  balanceAfter: Number,
  reason: String,
  wasteReason: String,
  costPaise: { type: Number, default: null },
  supplierId: { type: ObjectId, ref: 'Supplier' },
  purchaseId: { type: ObjectId, ref: 'Purchase' },
  by: { type: ObjectId, ref: 'User' },
  byName: String,
}, opts);
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.add({ demo: DEMO });
export const StockMovement = model('StockMovement', stockMovementSchema);

export const Supplier = model('Supplier', new Schema({
  demo: DEMO,
  name: { type: String, required: true },
  phone: String,
  note: String,
  active: { type: Boolean, default: true },
}, opts));

export const Purchase = model('Purchase', new Schema({
  demo: DEMO,
  supplierId: { type: ObjectId, ref: 'Supplier' },
  invoiceRef: String,
  items: [{ ingredientId: ObjectId, name: String, qty: Number, unit: String, costPaise: Number, _id: false }],
  totalPaise: { type: Number, default: 0 },
  by: { type: ObjectId, ref: 'User' },
  byName: String,
}, opts));

// ---------- Finance ----------
export const Expense = model('Expense', new Schema({
  demo: DEMO,
  category: { type: String, required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  date: { type: Date, required: true, index: true },
  method: { type: String, enum: ['CASH', 'UPI', 'BANK', 'OTHER'], default: 'CASH' },
  vendor: String,
  note: String,
  attachmentUrl: String,
  createdBy: { type: ObjectId, ref: 'User' },
  createdByName: String,
  approvedByName: String,
  voided: { type: Boolean, default: false },
}, opts));

export const CashSession = model('CashSession', new Schema({
  demo: DEMO,
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
  openedBy: { type: ObjectId, ref: 'User' },
  openedByName: String,
  openedAt: { type: Date, default: Date.now },
  openingPaise: { type: Number, default: 0 },
  closedBy: { type: ObjectId, ref: 'User' },
  closedByName: String,
  closedAt: Date,
  expectedPaise: Number,
  countedPaise: Number,
  differencePaise: Number,
  note: String,
}, opts));

// ---------- Customers ----------
export const Feedback = model('Feedback', new Schema({
  demo: DEMO,
  tableId: { type: ObjectId, ref: 'Table' },
  tableLabel: String,
  rating: { type: Number, min: 1, max: 5 },
  notes: String,
  name: String,
  phone: String,
  email: String,
  profession: String,
  consentStoreContact: { type: Boolean, default: false },
  consentMarketing: { type: Boolean, default: false },
}, opts));

// ---------- Settings, reports, audit ----------
const settingsSchema = new Schema({
  key: { type: String, default: 'main', unique: true },
  restaurantName: { type: String, default: 'AMMAS' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  gstin: { type: String, default: '' },
  billFooter: { type: String, default: 'Thank you. Please visit again.' },
  receiptWidth: { type: Number, default: 42, min: 24, max: 64 },
  timezone: { type: String, default: 'Asia/Kolkata' },
  taxMode: { type: String, enum: ['NONE', 'EXCLUSIVE', 'INCLUSIVE'], default: 'NONE' },
  taxBp: { type: Number, default: 0 },
  discountsEnabled: { type: Boolean, default: false },
  parcelEnabled: { type: Boolean, default: true },
  kotPrinterEnabled: { type: Boolean, default: false },
  printerConnection: { type: String, enum: ['ETHERNET', 'USB', 'BLUETOOTH', 'BROWSER'], default: 'ETHERNET' },
  feedbackRetentionDays: { type: Number, default: 365 },
  // customers sit anywhere: tables are optional. When off, "Eat here" needs no table.
  useTables: { type: Boolean, default: false },
  // printing from any browser/printer through the computer's own print dialog
  browserPrint: {
    paperMm: { type: Number, default: 80 },
    copies: { type: Number, default: 1, min: 1, max: 3 },
    fontPx: { type: Number, default: 13, min: 9, max: 20 },
    autoPrintBill: { type: Boolean, default: false },
    autoPrintKot: { type: Boolean, default: false },
    showTamil: { type: Boolean, default: false },
  },
  // email (SMTP) and WhatsApp Business details typed in Settings. Secrets are stored encrypted.
  emailCfg: {
    host: { type: String, default: '' }, port: { type: Number, default: 587 }, user: { type: String, default: '' },
    passEnc: { type: String, default: '' }, from: { type: String, default: '' },
  },
  whatsappCfg: {
    tokenEnc: { type: String, default: '' }, phoneNumberId: { type: String, default: '' },
    templateName: { type: String, default: '' }, templateLang: { type: String, default: 'en' },
    billMessage: { type: String, default: 'AMMAS Coimbatore\nBill {bill}\nView your bill: {link}\nThis bill is checked by number at our counter. Screenshots are not accepted.' },
  },
  // what the owner's report contains
  reportContent: {
    payments: { type: Boolean, default: true }, peakHour: { type: Boolean, default: true }, topItems: { type: Boolean, default: true },
    expenses: { type: Boolean, default: true }, lowStock: { type: Boolean, default: true }, waste: { type: Boolean, default: true },
    cancelled: { type: Boolean, default: true }, verified: { type: Boolean, default: true },
  },
  owner: {
    email: { type: String, default: '' },
    emailVerified: { type: Boolean, default: false },
    whatsapp: { type: String, default: '' },
    whatsappVerified: { type: Boolean, default: false },
  },
  schedule: {
    dailyEnabled: { type: Boolean, default: false },
    dailyTime: { type: String, default: '22:30' },
    weeklyEnabled: { type: Boolean, default: false },
    weeklyWeekday: { type: Number, default: 1 },
    weeklyTime: { type: String, default: '09:00' },
    monthlyEnabled: { type: Boolean, default: false },
    monthlyDay: { type: Number, default: 1 },
    monthlyTime: { type: String, default: '09:00' },
  },
  printerHeartbeat: {
    at: Date,
    bridge: String,
    ok: Boolean,
    detail: String,
  },
}, opts);
export const Settings = model('Settings', settingsSchema);

export const Verification = model('Verification', new Schema({
  channel: { type: String, enum: ['EMAIL', 'WHATSAPP'], required: true },
  target: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, opts));

export const ReportDelivery = model('ReportDelivery', new Schema({
  key: { type: String, required: true, unique: true },
  type: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'LOW_STOCK'], required: true },
  channel: { type: String, enum: ['EMAIL', 'WHATSAPP'], required: true },
  to: String,
  rangeLabel: String,
  status: { type: String, enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED'], default: 'QUEUED', index: true },
  attempts: { type: Number, default: 0 },
  error: String,
  providerMessageId: String,
  subject: String,
  text: String,
  whatsappText: String,
  sentAt: Date,
}, opts));

export const AuditLog = model('AuditLog', new Schema({
  at: { type: Date, default: Date.now, index: true },
  userId: { type: ObjectId, ref: 'User' },
  userName: String,
  action: { type: String, index: true },
  entity: String,
  entityId: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  note: String,
  ip: String,
}));

export const Counter = model('Counter', new Schema({
  _id: String,
  seq: { type: Number, default: 0 },
}));

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export type SettingsDoc = InferSchemaType<typeof settingsSchema> & { _id: Types.ObjectId };
export { mongoose };
