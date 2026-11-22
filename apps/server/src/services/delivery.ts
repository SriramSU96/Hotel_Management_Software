import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { ReportDelivery, Verification } from '../models/index.js';
import { buildSummary, summaryText } from './reports.js';
import { getSettings } from './core.js';
import { addDays, localDateString, localTimeHM, localWeekday, resolveRange, startOfLocalDay, type DateRange } from '../lib/time.js';
import { config } from '../config.js';
import { decryptSecret } from '../lib/secrets.js';
import { Order } from '../models/index.js';
import { logger } from '../logger.js';
import { HttpError } from '../middleware/error.js';

/** Settings typed in the Settings page win; the server .env values are the fallback. */
export async function emailCfg() {
  const s = await getSettings(); const c = s.emailCfg ?? {};
  const host = c.host || config.SMTP_HOST; const from = c.from || config.SMTP_FROM;
  if (!host || !from) return null;
  return { host, port: c.host ? c.port : config.SMTP_PORT, user: c.host ? c.user : config.SMTP_USER, pass: c.host ? decryptSecret(c.passEnc) : config.SMTP_PASS, from };
}
export async function whatsappCfg() {
  const s = await getSettings(); const c = s.whatsappCfg ?? {};
  const token = decryptSecret(c.tokenEnc) || config.WHATSAPP_TOKEN;
  const id = c.phoneNumberId || config.WHATSAPP_PHONE_NUMBER_ID; const name = c.templateName || config.WHATSAPP_TEMPLATE_NAME;
  if (!token || !id || !name) return null;
  return { token, id, name, lang: c.templateName ? c.templateLang || 'en' : config.WHATSAPP_TEMPLATE_LANG };
}
export const emailConfigured = async () => !!(await emailCfg());
export const whatsappConfigured = async () => !!(await whatsappCfg());

export async function sendEmail(to: string, subject: string, text: string) {
  const c = await emailCfg();
  if (!c) throw new Error('Email is not set up. Fill it in Settings > Email.');
  const tx = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.port === 465,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  const info = await tx.sendMail({ from: c.from, to, subject, text });
  return info.messageId as string;
}

/** Official WhatsApp Business Platform (Cloud API) with an approved template that has ONE body variable. */
async function sendWhatsApp(to: string, text: string) {
  const c = await whatsappCfg();
  if (!c) throw new Error('WhatsApp Business is not set up. Fill it in Settings > WhatsApp.');
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(c.id)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'template',
      template: {
        name: c.name, language: { code: c.lang },
        // template variables cannot contain newlines
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\s*\n\s*/g, ' | ').slice(0, 1000) }] }],
      },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `WhatsApp error ${res.status}`);
  return String(json?.messages?.[0]?.id ?? '');
}

export async function dispatch(id: string) {
  const d = await ReportDelivery.findById(id);
  if (!d || d.status === 'SENT' || d.status === 'DELIVERED') return d;
  d.attempts += 1;
  try {
    d.providerMessageId = d.channel === 'EMAIL'
      ? await sendEmail(d.to!, d.subject!, d.text!)
      : await sendWhatsApp(d.to!, d.whatsappText ?? d.text!);
    d.status = 'SENT'; d.sentAt = new Date(); d.error = undefined;
  } catch (e: any) {
    d.status = 'FAILED'; d.error = String(e?.message ?? e).slice(0, 300);
    logger.warn({ err: d.error, id }, 'Report delivery failed');
  }
  await d.save();
  return d;
}

export async function retryDelivery(id: string) {
  const d = await ReportDelivery.findById(id);
  if (!d) throw new HttpError(404, 'Delivery not found.');
  if (d.status !== 'FAILED') throw new HttpError(409, 'Only failed deliveries can be retried.');
  return dispatch(id);
}

const TITLES = { DAILY: 'AMMAS daily summary', WEEKLY: 'AMMAS weekly summary', MONTHLY: 'AMMAS monthly summary', LOW_STOCK: 'AMMAS low stock' } as const;

/** Create one delivery per (type, period, channel). The unique key makes repeats a no-op. */
export async function queueReport(type: keyof typeof TITLES, r: DateRange, opts: { force?: boolean } = {}) {
  const s = await getSettings();
  const targets: { channel: 'EMAIL' | 'WHATSAPP'; to: string }[] = [];
  if (s.owner.email && s.owner.emailVerified && await emailConfigured()) targets.push({ channel: 'EMAIL', to: s.owner.email });
  if (s.owner.whatsapp && s.owner.whatsappVerified && await whatsappConfigured()) targets.push({ channel: 'WHATSAPP', to: s.owner.whatsapp });
  if (!targets.length) return [];
  const sm = await buildSummary(r, false);
  if (type === 'LOW_STOCK' && !sm.lowStock.length) return [];
  let text = summaryText(sm, TITLES[type], s.reportContent);
  if (s.reportContent?.verified !== false && type !== 'LOW_STOCK') {
    const ver = await Order.find({ verifiedAt: { $gte: r.from, $lt: r.to } }).select('totalPaise');
    const notVer = await Order.countDocuments({ 'digital.sentAt': { $gte: r.from, $lt: r.to }, verifiedAt: null });
    if (ver.length || notVer) text += `\nVerified digital bills: ${ver.length} (Rs ${(ver.reduce((a: number, o: any) => a + o.totalPaise, 0) / 100).toFixed(2)}), sent but not verified: ${notVer}`;
  }
  text += `\nDetails: ${config.PUBLIC_URL.replace(/\/$/, '')}/dashboard`;
  const out = [];
  for (const t of targets) {
    const key = `${type}:${r.fromDate}_${r.toDate}:${t.channel}${opts.force ? `:${Date.now()}` : ''}`;
    try {
      const d = await ReportDelivery.create({ key, type, channel: t.channel, to: t.to, rangeLabel: r.label, subject: `${TITLES[type]} - ${r.label}`, text, whatsappText: text });
      out.push(await dispatch(String(d._id)));
    } catch (e: any) {
      if (e?.code !== 11000) throw e; // already queued for this period
    }
  }
  return out;
}

/** Runs every minute: sends whatever is due in the business timezone. */
export async function schedulerTick(now = new Date()) {
  const s = await getSettings();
  const tz = s.timezone;
  const hm = localTimeHM(now, tz);
  const today = localDateString(now, tz);
  const sc = s.schedule;
  if (sc.dailyEnabled && hm >= sc.dailyTime) {
    await queueReport('DAILY', resolveRange({ range: 'custom', from: today, to: today }, tz, now));
  }
  if (sc.weeklyEnabled && localWeekday(now, tz) === sc.weeklyWeekday && hm >= sc.weeklyTime) {
    const to = addDays(today, -1);
    await queueReport('WEEKLY', resolveRange({ range: 'custom', from: addDays(to, -6), to }, tz, now));
  }
  const dom = Number(today.slice(8, 10));
  if (sc.monthlyEnabled && dom === sc.monthlyDay && hm >= sc.monthlyTime) {
    const lastDayPrev = addDays(today.slice(0, 8) + '01', -1);
    await queueReport('MONTHLY', resolveRange({ range: 'custom', from: lastDayPrev.slice(0, 8) + '01', to: lastDayPrev }, tz, now));
  }
  // retry failures that are less than 3 attempts old (never re-send successes)
  const failed = await ReportDelivery.find({ status: 'FAILED', attempts: { $lt: 3 }, updatedAt: { $lt: new Date(now.getTime() - 10 * 60_000) } }).limit(10);
  for (const d of failed) await dispatch(String(d._id));
}

// ---- Recipient verification (6-digit code, 10 min, 5 tries) ----
const hashCode = (c: string) => crypto.createHash('sha256').update(c).digest('hex');

export async function startVerification(channel: 'EMAIL' | 'WHATSAPP', target: string) {
  const code = String(crypto.randomInt(100000, 1000000));
  await Verification.deleteMany({ channel, target });
  await Verification.create({ channel, target, codeHash: hashCode(code), expiresAt: new Date(Date.now() + 10 * 60_000) });
  const msg = `Your AMMAS verification code is ${code}. It is valid for 10 minutes.`;
  if (channel === 'EMAIL') await sendEmail(target, 'AMMAS verification code', msg);
  else await sendWhatsApp(target, msg);
}

export async function checkVerification(channel: 'EMAIL' | 'WHATSAPP', target: string, code: string) {
  const v = await Verification.findOne({ channel, target });
  if (!v || v.expiresAt < new Date()) throw new HttpError(400, 'Code expired. Ask for a new one.');
  if (v.attempts >= 5) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');
  v.attempts += 1;
  await v.save();
  if (hashCode(code.trim()) !== v.codeHash) throw new HttpError(400, 'Wrong code.');
  await v.deleteOne();
  return true;
}

export { startOfLocalDay };
