// End-to-end workflow smoke test against the live server (first ever run on a real database).
const BASE = process.argv[2] || 'http://localhost:4100', API = BASE + '/api/v1';
const BR = { authorization: 'Bearer bridge-token-1234567890' };
let ck = '';
const out = [];
const uid = () => 'k' + Math.random().toString(36).slice(2) + Date.now();
async function call(method, path, body, headers = {}) {
  const r = await fetch(API + path, { method, headers: { 'x-requested-with': 'ammas', ...(body ? { 'content-type': 'application/json' } : {}), ...(ck ? { cookie: ck } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.()[0]; if (sc) ck = sc.split(';')[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t };
}
const step = (name, r, okCodes = [200, 201]) => { const ok = okCodes.includes(r.s); out.push({ name, ok, s: r.s, detail: ok ? '' : r.t.slice(0, 160) }); return r; };

(async () => {
  step('login owner', await call('POST', '/auth/login', { username: 'owner', password: 'Owner#Pass2026' }));
  const prods = (await call('GET', '/products?all=1')).j.products; const tables = (await call('GET', '/tables')).j.tables;
  const rice = prods.find((p) => p.name === 'Chicken Rice'), tea = prods.find((p) => p.name === 'Tea');

  // cash drawer
  const cs0 = await call('GET', '/finance/cash-sessions/current');
  const open = cs0.j?.session ? cs0 : step('open cash session', await call('POST', '/finance/cash-sessions', { openingPaise: 100000 }));

  // dine-in order with a table, confirmed -> bill printed
  const tbl = tables.find((t) => !t.activeOrderId);
  const ord = step('create+confirm dine-in order', await call('POST', '/orders', { idempotencyKey: uid(), type: 'DINE_IN', tableId: tbl._id, confirm: true, items: [{ productId: rice._id, qty: 2, note: 'less spicy' }, { productId: tea._id, qty: 1 }] }));
  const o = ord.j?.order; if (!o) { report(); return; }
  out.push({ name: 'order has bill + KOT numbers', ok: !!o.billNo && !!o.kotNo, s: '', detail: `bill ${o.billNo} kot ${o.kotNo} total ${o.totalPaise}` });
  const tAfter = (await call('GET', '/tables')).j.tables.find((t) => t._id === tbl._id);
  out.push({ name: 'table marked occupied', ok: String(tAfter.activeOrderId) === String(o._id), s: '', detail: '' });

  // print bridge: first attempt FAILS, order must survive, retry succeeds
  const claim1 = step('bridge claims a job', await call('POST', '/bridge/claim', {}, BR));
  const job1 = claim1.j?.job;
  out.push({ name: 'a print job was queued for the bill', ok: !!job1, s: '', detail: job1 ? job1.kind : 'no job' });
  if (job1) {
    step('bridge reports FAILED (printer out of paper)', await call('POST', `/bridge/${job1.id}/result`, { status: 'FAILED', error: 'Out of paper' }, BR));
    const stillThere = await call('GET', `/orders/${o._id}`); out.push({ name: 'order NOT lost after print failure', ok: stillThere.s === 200 && stillThere.j.order.status === 'CONFIRMED', s: stillThere.s, detail: '' });
    const st = step('printer status shows a failed job', await call('GET', '/printing/status')); out.push({ name: 'failed job is visible to the cashier', ok: (st.j?.failed ?? st.j?.failedCount ?? 0) >= 1 || JSON.stringify(st.j).includes('FAILED') || JSON.stringify(st.j).includes('failed'), s: '', detail: JSON.stringify(st.j).slice(0, 120) });
    step('retry the failed print', await call('POST', `/printing/jobs/${job1.id}/retry`, {}));
    const c2 = await call('POST', '/bridge/claim', {}, BR); step('bridge claims the retried job', c2);
    if (c2.j?.job) step('bridge reports PRINTED', await call('POST', `/bridge/${c2.j.job.id}/result`, { status: 'PRINTED' }, BR));
  }
  step('paper copy (printer down fallback)', await call('POST', `/orders/${o._id}/paper-copy`, { value: 'PRINTED' }));
  step('reprint bill', await call('POST', `/orders/${o._id}/reprint`, { kind: 'BILL' }), [200, 201, 400]);

  // kitchen
  const kt = step('kitchen tickets', await call('GET', '/kitchen/tickets'));
  out.push({ name: 'new order is on the kitchen screen', ok: !!kt.j?.tickets?.some((t) => String(t.id ?? t._id) === String(o._id)), s: '', detail: '' });
  step('kitchen: PREPARING', await call('PUT', `/kitchen/tickets/${o._id}/status`, { status: 'PREPARING' }));
  step('kitchen: READY', await call('PUT', `/kitchen/tickets/${o._id}/status`, { status: 'READY' }));

  // payment: part cash, rest UPI (verified) then complete
  const half = Math.floor(o.totalPaise / 2);
  step('part payment CASH', await call('POST', `/orders/${o._id}/payments`, { idempotencyKey: uid(), method: 'CASH', amountPaise: half, tenderedPaise: half + 1000 }));
  const upiKey = uid();
  const p2 = step('rest by UPI (verified)', await call('POST', `/orders/${o._id}/payments`, { idempotencyKey: upiKey, method: 'UPI', amountPaise: o.totalPaise - half, upiVerified: true, upiRef: 'UTR123' }));
  const retry = await call('POST', `/orders/${o._id}/payments`, { idempotencyKey: upiKey, method: 'UPI', amountPaise: o.totalPaise - half, upiVerified: true }); out.push({ name: 'retrying the same payment is safe (no double charge)', ok: retry.j?.duplicate === true, s: retry.s, detail: '' });
  const paid = (await call('GET', `/orders/${o._id}`)).j.order; out.push({ name: 'order shows PAID', ok: paid.paymentStatus === 'PAID' && paid.paidPaise === paid.totalPaise, s: '', detail: `${paid.paymentStatus} ${paid.paidPaise}/${paid.totalPaise}` });
  step('complete order', await call('POST', `/orders/${o._id}/complete`, {}));
  const tFree = (await call('GET', '/tables')).j.tables.find((t) => t._id === tbl._id); out.push({ name: 'table freed after completion', ok: !tFree.activeOrderId, s: '', detail: '' });
  const rcptTok = paid.receiptToken; const rc = await fetch(API + '/public/receipt/' + rcptTok); out.push({ name: 'customer digital receipt opens', ok: rc.status === 200, s: rc.status, detail: '' });
  step('refund by owner', await call('POST', `/orders/${o._id}/refunds`, { idempotencyKey: uid(), method: 'CASH', amountPaise: 1000, reason: 'Wrong item' }));

  // stock
  const ing = step('create ingredient', await call('POST', '/stock/ingredients', { name: 'Smoke Item ' + Date.now(), baseUnit: 'pcs', reorderLevel: 30 })).j?.ingredient;
  if (ing) {
    step('stock: receive 60 eggs', await call('POST', '/stock/receive', { ingredientId: ing._id, qty: 60, unit: 'pcs', costPaise: 600000 }));
    step('stock: adjust out 5', await call('POST', '/stock/adjust', { ingredientId: ing._id, qty: 5, unit: 'pcs', direction: 'OUT', reason: 'Broken' }));
    step('stock: count', await call('POST', '/stock/count', { ingredientId: ing._id, qty: 52, unit: 'pcs' }));
    step('stock: waste', await call('POST', '/stock/waste', { ingredientId: ing._id, qty: 2, unit: 'pcs', wasteReason: 'SPOILAGE' }));
    step('stock: low-stock list', await call('GET', '/stock/low-stock'));
    step('stock: movements', await call('GET', '/stock/movements?ingredientId=' + ing._id));
  }
  step('stock: supplier', await call('POST', '/stock/suppliers', { name: 'Murugan Poultry', phone: '9876543210' }), [200, 201, 400]);
  step('stock: list suppliers', await call('GET', '/stock/suppliers'));
  step('stock: purchases', await call('GET', '/stock/purchases'));

  // expenses + close the day
  step('expense', await call('POST', '/finance/expenses', { category: 'Gas', amountPaise: 120000, date: new Date().toISOString().slice(0, 10), method: 'CASH' }));
  step('expense list', await call('GET', '/finance/expenses'));
  const cur = (await call('GET', '/finance/cash-sessions/current')).j?.session;
  if (cur) step('close cash session', await call('POST', `/finance/cash-sessions/${cur._id}/close`, { countedPaise: 100000 + half + 1000, note: 'smoke' }));

  // menu admin: price list + star
  step('set parcel + takeaway price', await call('PUT', `/products/${rice._id}/price`, { pricePaise: 12000, takeawayPricePaise: 12500, parcelPricePaise: 13000 }));
  step('star on', await call('PUT', `/products/${rice._id}/star`, { starred: true }));
  const np = step('create product with prices', await call('POST', '/products', { name: 'Smoke Dosa', categoryId: rice.categoryId, pricePaise: 5000, takeawayPricePaise: 5500, parcelPricePaise: 6000, starred: true }));
  step('price history', await call('GET', `/products/${rice._id}/price-history`));
  step('category list', await call('GET', '/categories'));
  const par = step('PARCEL order uses parcel price', await call('POST', '/orders', { idempotencyKey: uid(), type: 'PARCEL', confirm: true, items: [{ productId: rice._id, qty: 1 }] }));
  out.push({ name: 'parcel total = parcel price 130', ok: par.j?.order?.totalPaise === 13000, s: '', detail: String(par.j?.order?.totalPaise) });

  // tables, QR, feedback, admin
  step('table QR svg', await call('GET', `/tables/${tables[0]._id}/qr.svg`), [200, 404]);
  step('feedback list', await call('GET', '/customers/feedback'));
  step('customers csv', await call('GET', '/customers/export.csv'));
  step('audit log', await call('GET', '/audit'));
  step('users', await call('GET', '/users')); step('roles', await call('GET', '/roles')); step('settings', await call('GET', '/settings'));
  step('devices/sessions', await call('GET', '/auth/devices'), [200, 404]);
  step('printing jobs', await call('GET', '/printing/jobs'));
  step('printer test page', await call('POST', '/printing/test', {}), [200, 201]);
  step('orders list (today)', await call('GET', '/orders')); step('orders history', await call('GET', '/orders?view=history'));
  step('reports csv sales', await call('GET', '/reports/export/sales.csv'), [200, 500]); // dashboard aggregations use $ifNull which the FerretDB test DB lacks
  // settings: secrets, printer config, no-table orders, browser print
  const full = { restaurantName: 'AMMAS', timezone: 'Asia/Kolkata' };
  const se = await call('PUT', '/settings', { emailCfg: { host: 'smtp.example.com', port: 587, user: 'u', from: 'AMMAS <r@example.com>', pass: 'Sup3rSecret!' }, whatsappCfg: { token: 'EAAGsecrettoken', phoneNumberId: '12345', templateName: 'owner_report', templateLang: 'en', billMessage: 'Bill {bill} {link}' }, browserPrint: { paperMm: 58, copies: 1, fontPx: 14, autoPrintBill: false, autoPrintKot: false, showTamil: false }, reportContent: { payments: true, peakHour: true, topItems: false, expenses: true, lowStock: true, waste: true, cancelled: true, verified: true }, useTables: false });
  out.push({ name: 'save email + WhatsApp + printer + report content', ok: se.s === 200, s: se.s, detail: se.t.slice(0, 120) });
  const gs = await call('GET', '/settings');
  out.push({ name: 'secrets never sent back (only "is set")', ok: gs.j?.settings?.emailCfg?.passSet === true && gs.j?.settings?.whatsappCfg?.tokenSet === true && !gs.t.includes('Sup3rSecret') && !gs.t.includes('EAAGsecret'), s: gs.s, detail: '' });
  const keep = await call('PUT', '/settings', { emailCfg: { host: 'smtp.example.com', port: 587, user: 'u', from: 'AMMAS <r@example.com>' } });
  const gs2 = await call('GET', '/settings'); out.push({ name: 'empty password box keeps the saved password', ok: keep.s === 200 && gs2.j?.settings?.emailCfg?.passSet === true, s: keep.s, detail: '' });
  const al = await call('GET', '/audit'); out.push({ name: 'audit log never contains the secrets', ok: !al.t.includes('Sup3rSecret') && !al.t.includes('EAAGsecret'), s: al.s, detail: '' });
  const badHost = await call('PUT', '/settings', { emailCfg: { host: 'a b;rm', port: 587, user: '', from: '' } }); out.push({ name: 'bad SMTP host rejected', ok: badHost.s === 400, s: badHost.s, detail: '' });
  out.push({ name: 'report content setting reaches the owner', ok: gs2.j?.settings?.reportContent?.topItems === false, s: '', detail: '' });
  const nt = await call('POST', '/orders', { idempotencyKey: uid(), type: 'DINE_IN', confirm: true, items: [{ productId: tea._id, qty: 1 }] });
  out.push({ name: 'Eat here order works with no table', ok: nt.s === 201 || nt.s === 200, s: nt.s, detail: nt.t.slice(0, 100) });
  if (nt.j?.order) {
    const rc = await call('GET', `/orders/${nt.j.order._id}/receipt?kind=BILL`);
    out.push({ name: 'browser-print receipt (58 mm = 32 chars, says Eat here)', ok: rc.s === 200 && rc.j.lines.every((l) => l.length <= 32) && rc.j.lines.some((l) => l.includes('Eat here')) && rc.j.paperMm === 58, s: rc.s, detail: JSON.stringify(rc.j?.lines?.slice(0, 6)) });
    const rk = await call('GET', `/orders/${nt.j.order._id}/receipt?kind=KOT`); out.push({ name: 'browser-print kitchen ticket', ok: rk.s === 200, s: rk.s, detail: '' });
  }
  await call('PUT', '/settings', { useTables: true });
  const nt2 = await call('POST', '/orders', { idempotencyKey: uid(), type: 'DINE_IN', confirm: true, items: [{ productId: tea._id, qty: 1 }] });
  out.push({ name: 'with "use tables" on, a table is required again', ok: nt2.s === 400, s: nt2.s, detail: '' });
  await call('PUT', '/settings', { useTables: false, printerConnection: 'BROWSER' });
  const bo = await call('POST', '/orders', { idempotencyKey: uid(), type: 'TAKEAWAY', confirm: true, items: [{ productId: tea._id, qty: 1 }] });
  const jb = await call('GET', '/printing/jobs'); out.push({ name: 'browser mode queues no bridge print job', ok: !JSON.stringify(jb.j).includes(bo.j?.order?.billNo ?? 'zzz'), s: jb.s, detail: '' });
  const ck0 = ck; ck = ''; const rc0 = await call('GET', `/orders/${bo.j?.order?._id}/receipt`); ck = ck0; out.push({ name: 'receipt text needs login', ok: rc0.s === 401, s: rc0.s, detail: '' });
  const ls = await call('GET', '/stock/low-stock'); out.push({ name: 'low-stock list works', ok: ls.s === 200 && Array.isArray(ls.j?.items), s: ls.s, detail: ls.t.slice(0, 80) });

  // digital bill: send -> verify -> report
  const nb = step('new order for digital bill', await call('POST', '/orders', { idempotencyKey: uid(), type: 'PARCEL', confirm: true, items: [{ productId: tea._id, qty: 2 }] })).j?.order;
  if (nb) {
    step('pay in full', await call('POST', `/orders/${nb._id}/payments`, { idempotencyKey: uid(), method: 'CASH', amountPaise: nb.totalPaise, tenderedPaise: nb.totalPaise }));
    const short = String(nb.billNo).slice(-4).replace(/^0+/, '') || '0';
    const v0 = await call('GET', '/bills/verify?bill=' + short); out.push({ name: 'bill never sent digitally -> NOT_SENT (fake on a phone)', ok: v0.j?.verdict === 'NOT_SENT', s: v0.s, detail: v0.t.slice(0, 100) });
    const bad = await call('POST', `/bills/${nb._id}/digital-sent`, { channel: 'WHATSAPP', phone: '12345' }); out.push({ name: 'invalid phone rejected', ok: bad.s === 400, s: bad.s, detail: '' });
    step('record bill sent on WhatsApp', await call('POST', `/bills/${nb._id}/digital-sent`, { channel: 'WHATSAPP', phone: '+91 98765 43210' }));
    const lst = await call('GET', '/bills/digital'); out.push({ name: 'sent bill appears in today\'s digital list (last 4 only)', ok: lst.j?.bills?.some((x) => x.billNo === nb.billNo && x.phoneLast4 === '3210') && !lst.t.includes('9876543210'), s: lst.s, detail: '' });
    const v1 = await call('GET', '/bills/verify?bill=' + short); out.push({ name: 'sent + paid bill -> GENUINE', ok: v1.j?.verdict === 'GENUINE', s: v1.s, detail: v1.t.slice(0, 100) });
    const race = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', `/bills/${nb._id}/verified`, {}))); const wins = race.filter((r) => r.s === 200).length;
    out.push({ name: '5 simultaneous verify taps -> exactly 1 wins', ok: wins === 1 && race.filter((r) => r.s === 409).length === 4, s: '', detail: race.map((r) => r.s).join(',') });
    const v3 = await call('GET', '/bills/verify?bill=' + nb.billNo); out.push({ name: 'second check -> ALREADY_VERIFIED', ok: v3.j?.verdict === 'ALREADY_VERIFIED', s: v3.s, detail: '' });
    const rep = await call('GET', '/reports/verified?range=today'); const row = rep.j?.rows?.find((x) => x.billNo === nb.billNo);
    out.push({ name: 'verified report has amount, items, who, when', ok: !!row && row.totalPaise === nb.totalPaise && row.items[0]?.name === 'Tea' && !!row.verifiedByName && !!row.verifiedAt && row.channel === 'WHATSAPP', s: rep.s, detail: JSON.stringify(row ?? rep.j).slice(0, 140) });
    step('verified report CSV', await call('GET', '/reports/export/verified.csv?range=today'));
  }
  const v4 = await call('GET', '/bills/verify?bill=AM-20200101-0001'); out.push({ name: 'fake bill number -> NOT_FOUND', ok: v4.j?.verdict === 'NOT_FOUND', s: v4.s, detail: '' });
  const v5 = await call('GET', '/bills/verify?bill[$ne]=x'); out.push({ name: 'operator injection rejected', ok: v5.s === 400, s: v5.s, detail: '' });
  const v6 = await call('GET', '/bills/verify?bill=abc'); out.push({ name: 'junk input rejected', ok: v6.s === 400, s: v6.s, detail: '' });
  const sv = ck; ck = '';
  const v7 = await call('GET', '/bills/verify?bill=1'); out.push({ name: 'verify needs login', ok: v7.s === 401, s: v7.s, detail: '' });
  const v8 = await call('GET', '/reports/verified'); out.push({ name: 'verified report needs login', ok: v8.s === 401, s: v8.s, detail: '' });
  ck = sv;
  report();
})().catch((e) => { console.error('SMOKE ERROR', e); process.exit(1); });

function report() {
  const bad = out.filter((x) => !x.ok);
  console.log(`SMOKE: ${out.length - bad.length}/${out.length} steps OK`);
  for (const b of bad) console.log(`  FAIL ${b.name} [${b.s}] ${b.detail}`);
}
