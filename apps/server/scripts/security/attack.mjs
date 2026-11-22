// Penetration test harness for the AMMAS server. Usage: node attack.mjs [baseUrl]
import fs from 'node:fs';
import { io as ioc } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:4100';
const API = BASE + '/api/v1';
const results = [];
const rec = (id, area, sev, ok, detail = '') => { results.push({ id, area, sev, ok, detail }); };

class Jar {
  constructor() { this.c = {}; }
  set(res) { for (const sc of res.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) this.c[k] = v; else delete this.c[k]; } }
  get header() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '); }
}
async function call(method, path, { body, jar, headers = {}, csrf = true, raw, ip } = {}) {
  const h = { ...headers };
  if (jar?.header) h.cookie = jar.header;
  if (csrf) h['x-requested-with'] = 'ammas';
  if (ip) h['x-forwarded-for'] = ip;
  let payload;
  if (raw !== undefined) payload = raw; else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers: h, body: payload, redirect: 'manual' });
  jar?.set(res);
  let json = null; const text = await res.text(); try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
const uid = () => 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36);
async function login(username, password, ip) { const jar = new Jar(); const r = await call('POST', '/auth/login', { body: { username, password }, jar, ip }); return { jar, r }; }

const OWNER_PW = 'Owner#Pass2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- setup ----------
  const { jar: owner, r: ol } = await login('owner', OWNER_PW, '10.0.0.1');
  if (ol.status !== 200) { console.error('owner login failed', ol.status, ol.text); process.exit(2); }
  const cats = (await call('GET', '/categories', { jar: owner })).json.categories;
  const prods = (await call('GET', '/products?all=1', { jar: owner })).json.products;
  const tables = (await call('GET', '/tables', { jar: owner })).json.tables;
  const chickenRice = prods.find((p) => p.name === 'Chicken Rice');
  await call('PUT', '/settings', { jar: owner, body: { discountsEnabled: true, parcelEnabled: true } });
  // staff accounts
  const mk = async (username, roleKey, password = 'Staff#Pass123') => { const r = await call('POST', '/users', { jar: owner, body: { username, name: username, password, roleKey } }); return r; };
  await mk('cashier1', 'cashier'); await mk('kitchen1', 'kitchen'); await mk('stock1', 'stock');
  // a custom "manager" role: has users.manage + some others, but NOT everything
  await call('POST', '/roles', { jar: owner, body: {} }); // may not exist
  const rolesList = await call('GET', '/roles', { jar: owner });
  // create manager role directly through model-less API is impossible; use the cashier role clone via PUT on 'cashier' for escalation test later
  const { jar: cash } = await login('cashier1', 'Staff#Pass123', '10.0.0.2');
  const { jar: kit } = await login('kitchen1', 'Staff#Pass123', '10.0.0.3');
  const { jar: stk } = await login('stock1', 'Staff#Pass123', '10.0.0.4');

  // ---------- A. unauthenticated access ----------
  const protectedGets = ['/auth/devices', '/categories', '/products', '/tables', '/orders', '/kitchen/tickets', '/stock/ingredients', '/finance/expenses', '/finance/cash-sessions', '/reports/summary', '/settings', '/roles', '/users', '/audit', '/customers/feedback', '/customers/export.csv', '/printing/status', '/printing/jobs'];
  let leaked = [];
  for (const p of protectedGets) { const r = await call('GET', p); if (r.status !== 401 && r.status !== 404) leaked.push(`${p}:${r.status}`); }
  rec('A1', 'authn', 'critical', leaked.length === 0, leaked.join(' ') || 'all 401');
  const protectedPosts = ['/orders', '/products', '/users', '/stock/ingredients', '/finance/expenses', '/tables', '/reports/send-now'];
  leaked = [];
  for (const p of protectedPosts) { const r = await call('POST', p, { body: {} }); if (r.status !== 401) leaked.push(`${p}:${r.status}`); }
  rec('A2', 'authn', 'critical', leaked.length === 0, leaked.join(' ') || 'all 401');

  // ---------- B. login hardening ----------
  const bad = await call('POST', '/auth/login', { body: { username: 'owner', password: 'wrong' }, ip: '10.9.9.9' });
  const nouser = await call('POST', '/auth/login', { body: { username: 'nobody', password: 'wrong' }, ip: '10.9.9.9' });
  rec('B1', 'authn', 'medium', bad.json?.error === nouser.json?.error && bad.status === nouser.status, 'same message/status for bad user and bad password');
  const t0 = Date.now(); for (let i = 0; i < 3; i++) await call('POST', '/auth/login', { body: { username: 'owner', password: 'x' + i }, ip: '10.9.9.9' }); const tWrongUser = Date.now();
  for (let i = 0; i < 3; i++) await call('POST', '/auth/login', { body: { username: 'ghost' + i, password: 'x' }, ip: '10.9.9.9' }); const tGhost = Date.now();
  const dKnown = tWrongUser - t0, dGhost = tGhost - tWrongUser;
  rec('B2', 'authn', 'low', Math.abs(dKnown - dGhost) < Math.max(60, dKnown * 0.5), `timing known-user ${dKnown}ms vs unknown-user ${dGhost}ms (3 tries each)`);
  // NoSQL injection in login
  const inj1 = await call('POST', '/auth/login', { body: { username: { $ne: null }, password: { $ne: null } } });
  rec('B3', 'injection', 'critical', inj1.status === 400, `operator object login -> ${inj1.status}`);
  const cookieHdr = (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'ammas' }, body: JSON.stringify({ username: 'owner', password: OWNER_PW }) })).headers.get('set-cookie') || '';
  rec('B4', 'session', 'medium', /HttpOnly/i.test(cookieHdr) && /SameSite=Lax/i.test(cookieHdr), cookieHdr.replace(/=[^;]+/, '=***'));
  rec('B5', 'session', 'info', /Secure/i.test(cookieHdr), 'Secure flag present (expected only in production over HTTPS)');
  // ---------- C. CSRF / CORS ----------
  const noHdr = await call('POST', '/orders', { jar: cash, csrf: false, body: {} });
  rec('C1', 'csrf', 'high', noHdr.status === 403, `state-changing POST without X-Requested-With -> ${noHdr.status}`);
  const pre = await fetch(API + '/orders', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-requested-with,content-type' } });
  rec('C2', 'cors', 'high', !pre.headers.get('access-control-allow-origin'), `CORS preflight from evil origin: ACAO=${pre.headers.get('access-control-allow-origin')}`);
  const getMut = await call('GET', '/auth/logout', { jar: cash });
  rec('C3', 'csrf', 'low', getMut.status === 404, `logout via GET -> ${getMut.status}`);
  // text/plain form post (classic CSRF) without custom header
  const form = await fetch(API + '/orders', { method: 'POST', headers: { cookie: cash.header, 'content-type': 'text/plain' }, body: '{"x":1}' });
  rec('C4', 'csrf', 'high', form.status === 403, `text/plain cross-site style POST -> ${form.status}`);

  // ---------- D. authorization matrix ----------
  const must403 = async (who, jar, method, path, body) => { const r = await call(method, path, { jar, body: method === 'GET' ? undefined : (body ?? {}) }); return { ok: r.status === 403, s: r.status, label: `${who} ${method} ${path}` }; };
  const cashierDenied = [
    ['GET', '/users'], ['POST', '/users'], ['GET', '/roles'], ['PUT', '/roles/cashier'], ['GET', '/audit'], ['PUT', '/settings'], ['GET', '/customers/feedback'], ['GET', '/customers/export.csv'],
    ['GET', '/reports/summary'], ['GET', '/reports/export/sales.csv'], ['POST', '/reports/send-now'], ['GET', '/finance/expenses'], ['POST', '/finance/expenses'], ['GET', '/finance/cash-sessions'], ['POST', '/finance/cash-sessions'],
    ['POST', '/products'], ['PUT', `/products/${chickenRice._id}`], ['PUT', `/products/${chickenRice._id}/price`], ['PUT', `/products/${chickenRice._id}/star`], ['POST', '/tables'], ['GET', '/stock/ingredients?x=1'], ['POST', '/stock/ingredients'],
  ];
  const cashFails = [];
  for (const [m, p] of cashierDenied) { const r = await must403('cashier', cash, m, p); if (!r.ok && r.s !== 404) cashFails.push(`${p}:${r.s}`); }
  rec('D1', 'rbac', 'critical', cashFails.length === 0, `cashier vs ${cashierDenied.length} admin endpoints; leaks: ${cashFails.join(' ') || 'none'}`);
  const kitFails = [];
  for (const [m, p] of [['POST', '/orders'], ['GET', '/users'], ['PUT', `/products/${chickenRice._id}/price`], ['POST', '/orders/000000000000000000000000/payments'], ['POST', '/orders/000000000000000000000000/refunds'], ['GET', '/reports/summary'], ['PUT', '/settings']]) { const r = await must403('kitchen', kit, m, p); if (!r.ok && r.s !== 404) kitFails.push(`${p}:${r.s}`); }
  rec('D2', 'rbac', 'critical', kitFails.length === 0, `kitchen role leaks: ${kitFails.join(' ') || 'none'}`);
  const stkFails = [];
  for (const [m, p] of [['POST', '/orders'], ['GET', '/users'], ['PUT', `/products/${chickenRice._id}/price`], ['GET', '/finance/expenses'], ['GET', '/reports/summary']]) { const r = await must403('stock', stk, m, p); if (!r.ok && r.s !== 404) stkFails.push(`${p}:${r.s}`); }
  rec('D3', 'rbac', 'critical', stkFails.length === 0, `stock role leaks: ${stkFails.join(' ') || 'none'}`);
  // price edit by menu editor without price.edit (grant menu.edit only via user grants)
  // cashier cannot give discount
  const tAvail = tables[0];
  const dOrd = await call('POST', '/orders', { jar: cash, body: { idempotencyKey: uid(), type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 1 }], discountPaise: 5000 } });
  rec('D4', 'rbac', 'high', dOrd.status === 403, `cashier discount on create -> ${dOrd.status}`);
  // settings read by cashier must not expose owner contact
  const sRead = await call('GET', '/settings', { jar: cash });
  rec('D5', 'privacy', 'medium', !sRead.json?.settings?.owner && !sRead.json?.settings?.schedule, 'cashier /settings hides owner contact + schedule');
  // user list must not expose password hashes
  const ul = await call('GET', '/users', { jar: owner });
  rec('D6', 'secrets', 'critical', !/passwordHash|argon2/.test(ul.text), 'GET /users contains no password hash');
  const cr = await mk('tmpuser1', 'cashier');
  rec('D7', 'secrets', 'critical', !/passwordHash|argon2/.test(cr.text), 'POST /users response contains no password hash');
  const meResp = await call('GET', '/auth/me', { jar: cash });
  rec('D8', 'secrets', 'medium', !/tokenHash|passwordHash/.test(meResp.text), '/auth/me leaks nothing sensitive');

  // ---------- E. privilege escalation by a user-manager (non-owner) ----------
  // Owner edits cashier role to include users.manage (simulating "manager" given the user-admin power), then that user attacks.
  const cashRoleOrig = (await call('GET', '/roles', { jar: owner })).json.roles.find((r) => r.key === 'cashier').permissions;
  await call('PUT', '/roles/cashier', { jar: owner, body: { permissions: [...cashRoleOrig, 'users.manage'] } });
  await call('POST', '/users', { jar: owner, body: { username: 'mgr1', name: 'mgr1', password: 'Staff#Pass123', roleKey: 'cashier' } });
  const { jar: mgr } = await login('mgr1', 'Staff#Pass123', '10.0.0.5');
  const users = (await call('GET', '/users', { jar: mgr })).json.users;
  const ownerUser = users.find((u) => u.username === 'owner'); const mgrUser = users.find((u) => u.username === 'mgr1');
  // (1) reset the owner's password
  const takeover = await call('PUT', `/users/${ownerUser._id}`, { jar: mgr, body: { password: 'Hacked#Pass999' } });
  const ownerNow = await login('owner', 'Hacked#Pass999', '10.0.0.6');
  rec('E1', 'privesc', 'critical', !(takeover.status === 200 && ownerNow.r.status === 200), `user-manager resets OWNER password -> ${takeover.status}; login with new password -> ${ownerNow.r.status}`);
  if (ownerNow.r.status === 200) { // restore
    await call('PUT', `/users/${ownerUser._id}`, { jar: ownerNow.jar, body: { password: OWNER_PW } });
  }
  const { jar: owner2 } = await login('owner', OWNER_PW, '10.0.0.1');
  Object.assign(owner, owner2);
  // (2) promote self to owner role
  const selfPromote = await call('PUT', `/users/${mgrUser._id}`, { jar: mgr, body: { roleKey: 'owner' } });
  rec('E2', 'privesc', 'critical', selfPromote.status !== 200, `user-manager sets own role to owner -> ${selfPromote.status}`);
  // (3) grant self permissions they do not hold (settings.manage, price.edit, orders.refund)
  const selfGrant = await call('PUT', `/users/${mgrUser._id}`, { jar: owner, body: {} });
  const grantAttempt = await call('PUT', `/users/${mgrUser._id}`, { jar: mgr, body: { grants: ['settings.manage', 'orders.refund', 'price.edit', 'audit.view'] } });
  rec('E3', 'privesc', 'critical', grantAttempt.status !== 200, `user-manager grants self permissions they lack -> ${grantAttempt.status}`);
  // (4) deactivate the owner (is last-admin protection tied to owner?)
  const kill = await call('PUT', `/users/${ownerUser._id}`, { jar: mgr, body: { active: false } });
  rec('E4', 'privesc', 'high', kill.status !== 200, `user-manager deactivates owner -> ${kill.status}`);
  if (kill.status === 200) await call('PUT', `/users/${ownerUser._id}`, { jar: owner, body: { active: true } });
  // (5) edit a role to add every permission
  const roleEsc = await call('PUT', '/roles/cashier', { jar: mgr, body: { permissions: ['users.manage', 'settings.manage', 'orders.refund', 'price.edit', 'audit.view', 'reports.view'] } });
  rec('E5', 'privesc', 'critical', roleEsc.status !== 200, `user-manager adds permissions they lack to a role -> ${roleEsc.status}`);
  // legit admin work must still function for a limited user-manager (peer/lower roles only)
  const kitchenUser = users.find((u) => u.username === 'tmpuser1');
  const okEdit = await call('PUT', `/users/${kitchenUser._id}`, { jar: mgr, body: { name: 'Kitchen Boy' } });
  rec('E6', 'regression', 'high', okEdit.status === 200, `user-manager can still edit a user within their own access -> ${okEdit.status}`);
  const mkHigher = await call('POST', '/users', { jar: mgr, body: { username: 'sneaky1', name: 's', password: 'Staff#Pass123', roleKey: 'owner' } });
  rec('E7', 'privesc', 'critical', mkHigher.status === 403, `user-manager creates a new OWNER-role user -> ${mkHigher.status}`);
  // restore cashier role
  await call('PUT', '/roles/cashier', { jar: owner, body: { permissions: cashRoleOrig } });
  const ownerReset = await call('PUT', `/users/${kitchenUser._id}`, { jar: owner, body: { password: 'Staff#Pass123' } });
  rec('E8', 'regression', 'high', ownerReset.status === 200, `owner can still reset staff passwords -> ${ownerReset.status}`);
  await call('PUT', `/users/${mgrUser._id}`, { jar: owner, body: { active: false } });

  // ---------- F. injection / malformed input ----------
  const inj = async (path, jar = owner) => (await call('GET', path, { jar })).status;
  const codes = { 'orders view[$ne]': await inj('/orders?view[$ne]=x'), 'orders q[$regex]': await inj('/orders?q[$regex]=.*'), 'audit action[$ne]': await inj('/audit?action[$ne]=x'), 'summary range[$gt]': await inj('/reports/summary?range[$gt]='), 'summary from obj': await inj('/reports/summary?from[$ne]=1&to[$ne]=1') };
  const baseline = await inj('/reports/summary');
  rec('F1', 'injection', 'high', Object.values(codes).every((c) => c === baseline || c < 500), `operator-injection statuses ${JSON.stringify(codes)} vs normal request ${baseline} (same as normal = input ignored, not injected)`);
  const rd = Date.now(); const redos = await call('GET', '/orders?view=history&q=' + 'a'.repeat(3000), { jar: owner }); rec('F2', 'dos', 'medium', Date.now() - rd < 2000 && redos.status < 500, `3000-char search -> ${redos.status} in ${Date.now() - rd}ms`);
  const badId = await call('GET', '/orders/not-an-objectid', { jar: owner });
  rec('F3', 'robustness', 'low', badId.status === 400 || badId.status === 404, `invalid ObjectId -> ${badId.status} (500 means unhandled CastError)`);
  const badJson = await call('POST', '/auth/login', { raw: '{bad json', headers: { 'content-type': 'application/json' } });
  rec('F4', 'robustness', 'low', badJson.status === 400, `malformed JSON -> ${badJson.status}`);
  const big = await call('POST', '/auth/login', { raw: JSON.stringify({ username: 'a', password: 'b'.repeat(300_000) }), headers: { 'content-type': 'application/json' } });
  rec('F5', 'dos', 'medium', big.status === 413, `300KB JSON body -> ${big.status}`);
  rec('F6', 'info-leak', 'medium', !/at .*\.ts|node_modules|MongoServerError|stack/i.test(badId.text + badJson.text + big.text), 'no stack traces or driver names in error bodies');
  const traversal = [];
  for (const p of ['/uploads/..%2f..%2fpackage.json', '/uploads/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd']) { const r = await fetch(BASE + p); const t = await r.text(); traversal.push(r.status + (/root:|"name"/.test(t) ? ' LEAK' : '')); }
  rec('F7', 'traversal', 'critical', !traversal.some((x) => /LEAK/.test(x)), `path traversal probes -> ${traversal.join(', ')}`);
  const tr = await fetch(BASE + '/', { method: 'TRACE' }).catch(() => ({ status: 0 }));
  rec('F8', 'misc', 'low', tr.status !== 200, `TRACE -> ${tr.status}`);

  // ---------- G. price / business-logic tampering ----------
  const place = async (jar, body) => call('POST', '/orders', { jar, body: { idempotencyKey: uid(), ...body } });
  const tk = tables.find((t) => !t.activeOrderId);
  const tamper = await place(cash, { type: 'TAKEAWAY', confirm: true, items: [{ productId: chickenRice._id, qty: 1, unitPricePaise: 1, pricePaise: 1 }], totalPaise: 1, subtotalPaise: 1 });
  rec('G1', 'logic', 'critical', tamper.json?.order?.totalPaise === (chickenRice.takeawayPricePaise ?? chickenRice.pricePaise), `client-sent price/total ignored: total=${tamper.json?.order?.totalPaise} expected ${chickenRice.takeawayPricePaise ?? chickenRice.pricePaise}`);
  const parcel = await place(cash, { type: 'PARCEL', items: [{ productId: chickenRice._id, qty: 2 }] });
  rec('G2', 'logic', 'medium', parcel.json?.order?.totalPaise === 2 * (chickenRice.parcelPricePaise ?? chickenRice.pricePaise), `parcel price used: total=${parcel.json?.order?.totalPaise}`);
  const neg = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: -5 }] });
  const zero = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 0 }] });
  const frac = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 1.5 }] });
  const huge = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 100 }] });
  const nan = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 'NaN' }] });
  rec('G3', 'logic', 'critical', [neg, zero, frac, huge, nan].every((r) => r.status === 400), `negative/zero/fractional/100/NaN qty -> ${[neg, zero, frac, huge, nan].map((r) => r.status).join(',')}`);
  const ghost = await place(cash, { type: 'TAKEAWAY', items: [{ productId: '64b000000000000000000000', qty: 1 }] });
  rec('G4', 'logic', 'medium', ghost.status === 400, `unknown product -> ${ghost.status}`);
  const key = uid(); const a1 = await call('POST', '/orders', { jar: cash, body: { idempotencyKey: key, type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 1 }] } }); const a2 = await call('POST', '/orders', { jar: cash, body: { idempotencyKey: key, type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 9 }] } });
  rec('G5', 'logic', 'medium', a1.json?.order?._id === a2.json?.order?._id, 'same idempotency key returns the same order (no duplicate)');
  // concurrent identical orders (double tap)
  const dk = uid(); const dbl = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/orders', { jar: cash, body: { idempotencyKey: dk, type: 'TAKEAWAY', confirm: true, items: [{ productId: chickenRice._id, qty: 1 }] } })));
  const ids = new Set(dbl.map((r) => r.json?.order?._id).filter(Boolean));
  rec('G6', 'race', 'high', ids.size === 1, `8 concurrent identical submits -> ${ids.size} distinct order(s), statuses ${[...new Set(dbl.map((r) => r.status))]}`);
  // table double-booking race
  const tFree = tables.filter((t) => !t.activeOrderId).slice(0, 2); const tid = tFree[0]._id;
  const bookings = await Promise.all(Array.from({ length: 6 }, () => call('POST', '/orders', { jar: cash, body: { idempotencyKey: uid(), type: 'DINE_IN', tableId: tid, confirm: true, items: [{ productId: chickenRice._id, qty: 1 }] } })));
  const okBook = bookings.filter((r) => r.status === 200 || r.status === 201).length;
  rec('G7', 'race', 'high', okBook === 1, `6 concurrent orders for the same table -> ${okBook} accepted (expected 1)`);
  // sold-out item
  await call('PUT', `/products/${chickenRice._id}/availability`, { jar: owner, body: { status: 'SOLD_OUT' } });
  const so = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 1 }] });
  await call('PUT', `/products/${chickenRice._id}/availability`, { jar: owner, body: { status: 'AVAILABLE' } });
  rec('G8', 'logic', 'medium', so.status === 409, `sold-out item ordered -> ${so.status}`);
  // discount as owner larger than subtotal clamps
  const dsc = await place(owner, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 1 }], discountPaise: 99_999_999 });
  rec('G9', 'logic', 'high', (dsc.status === 200 || dsc.status === 201) && dsc.json.order.totalPaise >= 0 && dsc.json.order.discountPaise <= dsc.json.order.subtotalPaise, `huge discount clamped: total=${dsc.json?.order?.totalPaise} discount=${dsc.json?.order?.discountPaise}`);

  // ---------- H. payments and refunds ----------
  const mkOrder = async (qty = 2) => { const r = await place(cash, { type: 'TAKEAWAY', confirm: true, items: [{ productId: chickenRice._id, qty }] }); if (!r.json?.order) console.error('mkOrder failed', r.status, r.text.slice(0,200)); return r.json.order; };
  const pay = (jar, id, body) => call('POST', `/orders/${id}/payments`, { jar, body: { idempotencyKey: uid(), ...body } });
  const o1 = await mkOrder(); const due1 = o1.totalPaise;
  const over = await pay(cash, o1._id, { method: 'CASH', amountPaise: due1 + 100 });
  rec('H1', 'money', 'high', over.status === 400, `overpay -> ${over.status}`);
  const upiNoVerify = await pay(cash, o1._id, { method: 'UPI', amountPaise: due1 });
  rec('H2', 'money', 'high', upiNoVerify.status === 400, `UPI without verification -> ${upiNoVerify.status}`);
  const negPay = await pay(cash, o1._id, { method: 'CASH', amountPaise: -500 });
  rec('H3', 'money', 'critical', negPay.status === 400, `negative payment -> ${negPay.status}`);
  const draft = await place(cash, { type: 'TAKEAWAY', items: [{ productId: chickenRice._id, qty: 1 }] });
  const payDraft = await pay(cash, draft.json.order._id, { method: 'CASH', amountPaise: 100 });
  rec('H4', 'money', 'high', payDraft.status === 409, `payment on unconfirmed order -> ${payDraft.status}`);
  // concurrent overpayment race
  const o2 = await mkOrder(); const par = await Promise.all(Array.from({ length: 10 }, () => pay(cash, o2._id, { method: 'CASH', amountPaise: o2.totalPaise })));
  const o2now = (await call('GET', `/orders/${o2._id}`, { jar: owner })).json;
  const paidSum = o2now.payments.reduce((a, p) => a + p.amountPaise, 0);
  rec('H5', 'race', 'critical', o2now.order.paidPaise <= o2now.order.totalPaise && paidSum <= o2now.order.totalPaise, `10 concurrent full payments: total=${o2now.order.totalPaise} paid=${o2now.order.paidPaise} payments recorded=${paidSum} (${o2now.payments.length} rows)`);
  rec('H5b', 'race', 'high', o2now.order.paymentStatus === 'PAID', `after concurrent payments status is ${o2now.order.paymentStatus} (must be PAID)`);
  // idempotency key reuse across different orders
  const oa = await mkOrder(1), ob = await mkOrder(1); const sk = uid();
  const pa = await call('POST', `/orders/${oa._id}/payments`, { jar: cash, body: { idempotencyKey: sk, method: 'CASH', amountPaise: oa.totalPaise } });
  const pb = await call('POST', `/orders/${ob._id}/payments`, { jar: cash, body: { idempotencyKey: sk, method: 'CASH', amountPaise: ob.totalPaise } });
  const obNow = (await call('GET', `/orders/${ob._id}`, { jar: owner })).json.order;
  rec('H6', 'money', 'high', pb.status === 409 && obNow.paidPaise === 0, `payment key reused on ANOTHER order: reply duplicate=${pb.json?.duplicate}, order B paid=${obNow.paidPaise}/${obNow.totalPaise} (silently unpaid = bug)`);
  // refunds
  const o3 = await mkOrder(1); await pay(cash, o3._id, { method: 'CASH', amountPaise: o3.totalPaise });
  const cashRef = await call('POST', `/orders/${o3._id}/refunds`, { jar: cash, body: { idempotencyKey: uid(), method: 'CASH', amountPaise: 100, reason: 'test' } });
  rec('H7', 'rbac', 'critical', cashRef.status === 403, `cashier refund -> ${cashRef.status}`);
  const rr = await Promise.all(Array.from({ length: 10 }, () => call('POST', `/orders/${o3._id}/refunds`, { jar: owner, body: { idempotencyKey: uid(), method: 'CASH', amountPaise: o3.totalPaise, reason: 'race' } })));
  const o3now = (await call('GET', `/orders/${o3._id}`, { jar: owner })).json;
  const refSum = o3now.refunds.reduce((a, r) => a + r.amountPaise, 0);
  rec('H8', 'race', 'critical', refSum <= o3now.order.paidPaise, `10 concurrent full refunds: paid=${o3now.order.paidPaise} refunded rows=${refSum} (${o3now.refunds.length} refunds)`);
  const cancelPaid = await call('POST', `/orders/${oa._id}/cancel`, { jar: owner, body: { reason: 'attack' } });
  rec('H9', 'money', 'high', cancelPaid.status === 409, `cancel an order that is already paid -> ${cancelPaid.status}`);
  const cashCancel = await call('POST', `/orders/${ob._id}/cancel`, { jar: cash, body: { reason: 'attack' } });
  rec('H10', 'rbac', 'medium', cashCancel.status === 403, `cashier cancel -> ${cashCancel.status}`);

  // ---------- I. public (unauthenticated) surface ----------
  const tok = tables[0].publicToken;
  const pubGet = await call('GET', `/public/table/${tok}`);
  rec('I1', 'public', 'low', pubGet.status === 200 && Object.keys(pubGet.json).sort().join() === 'restaurantName,tableLabel', `QR info exposes only: ${Object.keys(pubGet.json || {})}`);
  const badTok = await call('GET', '/public/table/AAAAAAAAAAAA');
  rec('I2', 'public', 'low', badTok.status === 404, `unknown QR token -> ${badTok.status}`);
  const fb1 = await call('POST', `/public/feedback/${tok}`, { body: { rating: 5, notes: 'Great', name: '=HYPERLINK("http://evil.example/steal","Click for refund")', phone: '+919999999999', consentStoreContact: true, profession: '@SUM(1+1)*cmd|\' /C calc\'!A0' }, headers: { 'x-forwarded-for': '198.51.100.1' }, csrf: true });
  rec('I3', 'public', 'info', fb1.status === 201, `anonymous feedback accepted -> ${fb1.status}`);
  const fbNoHdr = await call('POST', `/public/feedback/${tok}`, { csrf: false, body: { rating: 4 } });
  rec('I4', 'csrf', 'info', true, `public feedback without X-Requested-With -> ${fbNoHdr.status} (public form is intentionally anonymous)`);
  // spam / rate limit
  let limited = 0; for (let i = 0; i < 14; i++) { const r = await call('POST', `/public/feedback/${tok}`, { body: { rating: 3, notes: 'spam' + i }, ip: '198.51.100.55' }); if (r.status === 429) limited++; }
  rec('I5', 'public', 'medium', limited > 0, `14 rapid anonymous submits from one IP -> ${limited} rate-limited`);
  let limited2 = 0; for (let i = 0; i < 14; i++) { const r = await call('POST', `/public/feedback/${tok}`, { body: { rating: 3, notes: 'spoof' + i }, ip: `198.51.100.${100 + i}` }); if (r.status === 429) limited2++; }
  rec('I6', 'public', 'high', limited2 > 0, `14 submits rotating spoofed X-Forwarded-For -> ${limited2} rate-limited (0 = limiter bypassable, feedback table can be flooded)`);
  const longNote = await call('POST', `/public/feedback/${tok}`, { body: { notes: 'x'.repeat(5000) } });
  rec('I7', 'public', 'low', longNote.status === 400 || longNote.status === 429, `oversized note -> ${longNote.status}`);
  const exp = await call('GET', '/customers/export.csv', { jar: owner });
  const cells = exp.text.split('\n').flatMap((l) => l.split(','));
  const formula = cells.filter((c) => /^"?[=+\-@]/.test(c.trim()) && !/^-?\d/.test(c.trim().replace(/^"/, '')));
  rec('I8', 'injection', 'high', formula.length === 0, `CSV export contains formula-looking cells an attacker planted via the public form: ${formula.slice(0, 2).join(' | ') || 'none'}`);
  const rcp = await call('GET', '/public/receipt/' + 'A'.repeat(22));
  rec('I9', 'public', 'low', rcp.status === 404, `random receipt token -> ${rcp.status}`);
  const okOrder = (await call('GET', `/orders/${o3._id}`, { jar: owner })).json.order;
  const rcpOk = await call('GET', '/public/receipt/' + okOrder.receiptToken);
  rec('I10', 'privacy', 'medium', rcpOk.status === 200 && !/customerPhone|customerName|upiRef|byName|createdBy/.test(rcpOk.text), 'digital receipt has no customer phone/name/staff/UPI ref');

  // ---------- J. uploads ----------
  const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = async (buf, name, type, jar = owner) => { const fd = new FormData(); fd.append('image', new Blob([buf], { type }), name); const r = await fetch(`${API}/products/${chickenRice._id}/image`, { method: 'POST', headers: { cookie: jar.header, 'x-requested-with': 'ammas' }, body: fd }); return { status: r.status, text: await r.text() }; };
  const good = await up(png1, 'a.png', 'image/png'); rec('J1', 'upload', 'info', good.status === 200, `valid PNG -> ${good.status}`);
  const html = await up(Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', 'image/png'); rec('J2', 'upload', 'high', html.status >= 400 && html.status < 500, `HTML disguised as PNG -> ${html.status} ${html.status >= 500 ? '(server error = unhandled)' : ''}`);
  const svg = await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml'); rec('J3', 'upload', 'high', svg.status >= 400 && svg.status < 500, `SVG with script -> ${svg.status}`);
  const php = await up(Buffer.concat([png1, Buffer.from('<?php system($_GET[0]); ?>')]), 'shell.php.png', 'image/png');
  const pj = JSON.parse(php.text || '{}'); const url = pj.product?.imageUrl; let phpBody = ''; if (url) phpBody = await (await fetch(BASE + url)).text();
  rec('J4', 'upload', 'high', !/<\?php/.test(phpBody), `polyglot PNG+PHP is re-encoded (served file contains no <?php): ${url ?? 'n/a'}`);
  const bigbuf = Buffer.alloc(8 * 1024 * 1024, 1); const bigUp = await up(bigbuf, 'big.png', 'image/png'); rec('J5', 'upload', 'medium', bigUp.status >= 400 && bigUp.status < 500, `8MB upload -> ${bigUp.status}`);
  const cashUp = await up(png1, 'a.png', 'image/png', cash); rec('J6', 'rbac', 'high', cashUp.status === 403, `cashier uploads product image -> ${cashUp.status}`);
  const noauthUp = await fetch(`${API}/products/${chickenRice._id}/image`, { method: 'POST', headers: { 'x-requested-with': 'ammas' } }); rec('J7', 'authn', 'high', noauthUp.status === 401, `unauthenticated upload -> ${noauthUp.status}`);
  // decompression bomb: 30000x30000 1-bit PNG (tiny file, huge pixels)
  try { const sharp = (await import('sharp')).default; const bomb = await sharp({ create: { width: 20000, height: 20000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer(); const t = Date.now(); const b = await up(bomb, 'bomb.png', 'image/png'); rec('J8', 'dos', 'medium', b.status >= 400 && Date.now() - t < 15000, `20000x20000 px image (${(bomb.length / 1024).toFixed(0)} KB file) -> ${b.status} in ${Date.now() - t}ms`); } catch (e) { rec('J8', 'dos', 'medium', true, 'bomb generation skipped: ' + String(e).slice(0, 80)); }

  // ---------- K. print bridge ----------
  const bNo = await call('POST', '/bridge/claim', { body: {} }); rec('K1', 'bridge', 'critical', bNo.status === 401, `bridge claim without token -> ${bNo.status}`);
  const bBad = await call('POST', '/bridge/claim', { body: {}, headers: { authorization: 'Bearer wrong-token-wrong-token' } }); rec('K2', 'bridge', 'critical', bBad.status === 401, `bridge wrong token -> ${bBad.status}`);
  const bCookie = await call('POST', '/bridge/claim', { jar: owner, body: {} }); rec('K3', 'bridge', 'high', bCookie.status === 401, `owner session cookie cannot call bridge -> ${bCookie.status}`);
  const bOk = await call('POST', '/bridge/claim', { body: {}, headers: { authorization: 'Bearer bridge-token-1234567890' } }); rec('K4', 'bridge', 'info', bOk.status === 200, `valid bridge token -> ${bOk.status}`);
  const bridgeAsUser = await call('POST', '/bridge/heartbeat', { jar: cash, body: { ok: true } }); rec('K5', 'bridge', 'high', bridgeAsUser.status === 401, `cashier fakes printer heartbeat -> ${bridgeAsUser.status}`);

  // ---------- L. sessions ----------
  const { jar: s1 } = await login('cashier1', 'Staff#Pass123', '10.0.0.20'); const { jar: s2 } = await login('cashier1', 'Staff#Pass123', '10.0.0.21');
  const savedCookie = s1.header;
  await call('POST', '/auth/logout', { jar: s1 });
  const replay = await fetch(API + '/auth/me', { headers: { cookie: savedCookie } }).then((r) => r.json());
  rec('L1', 'session', 'high', !replay.user, 'cookie replay after logout is rejected');
  const cpw = await call('POST', '/auth/change-password', { jar: s2, body: { current: 'Staff#Pass123', next: 'Staff#Pass456' } });
  const old = await call('GET', '/auth/me', { jar: cash }); rec('L2', 'session', 'high', !old.json?.user, `password change kills other sessions of that user (change-password -> ${cpw.status} ${cpw.text.slice(0,80)}; old session /me -> ${old.text.slice(0,60)})`);
  await call('PUT', `/users/${(await call('GET', '/users', { jar: owner })).json.users.find((u) => u.username === 'cashier1')._id}`, { jar: owner, body: { password: 'Staff#Pass123' } });
  const { jar: c3 } = await login('cashier1', 'Staff#Pass123', '10.0.0.22');
  const uid1 = (await call('GET', '/users', { jar: owner })).json.users.find((u) => u.username === 'cashier1')._id;
  await call('PUT', `/users/${uid1}`, { jar: owner, body: { active: false } });
  const deact = await call('GET', '/auth/me', { jar: c3 }); rec('L3', 'session', 'high', !deact.json?.user, 'deactivating a user ends their session immediately');
  await call('PUT', `/users/${uid1}`, { jar: owner, body: { active: true } });
  const weak = await call('POST', '/users', { jar: owner, body: { username: 'weakpw', name: 'w', password: 'password', roleKey: 'cashier' } });
  rec('L4', 'authn', 'info', true, `common password "password" accepted for a new user? -> ${weak.status} (201 = weak passwords allowed)`);
  const same = await call('POST', '/users', { jar: owner, body: { username: 'samepw99', name: 'w', password: 'samepw99', roleKey: 'cashier' } });
  rec('L5', 'authn', 'info', true, `password equal to username -> ${same.status}`);
  const lastAdmin = await call('PUT', `/users/${ownerUser._id}`, { jar: owner, body: { active: false } });
  rec('L6', 'logic', 'high', lastAdmin.status === 409, `owner deactivates the last administrator -> ${lastAdmin.status}`);

  // ---------- M. realtime (Socket.IO) ----------
  const trySock = (opts) => new Promise((resolve) => { const s = ioc(BASE, { transports: ['websocket'], reconnection: false, timeout: 4000, ...opts }); const done = (v) => { s.close(); resolve(v); }; s.on('connect', () => done('connected')); s.on('connect_error', (e) => done('rejected: ' + e.message)); setTimeout(() => done('timeout'), 5000); });
  const sNo = await trySock({}); rec('M1', 'realtime', 'high', /rejected/.test(sNo), `socket without session -> ${sNo}`);
  const sAuth = await trySock({ extraHeaders: { cookie: owner.header } }); rec('M2', 'realtime', 'info', sAuth === 'connected', `socket with session -> ${sAuth}`);
  const sEvil = await trySock({ extraHeaders: { cookie: owner.header, origin: 'https://evil.example' } });
  rec('M3', 'realtime', 'high', /rejected|timeout/.test(sEvil), `cross-site WebSocket with the victim's cookie from Origin evil.example -> ${sEvil} (connected = cross-site WebSocket hijacking possible)`);

  // ---------- N. headers & caching ----------
  const h = await fetch(API + '/auth/me', { headers: { cookie: owner.header } });
  rec('N1', 'headers', 'medium', /no-store|private/.test(h.headers.get('cache-control') || ''), `Cache-Control on authenticated API responses: "${h.headers.get('cache-control')}"`);
  const csp = (await fetch(API + '/auth/me')).headers.get('content-security-policy') || ''; rec('N0', 'headers', 'medium', csp.length > 20, 'CSP header present');
  rec('N2', 'headers', 'medium', !/upgrade-insecure-requests/.test(csp), 'CSP does not force HTTPS upgrade (would break plain-HTTP restaurant LAN installs)');
  rec('N3', 'headers', 'low', !/connect-src[^;]*\sws:(\s|;|$)/.test(csp), `CSP connect-src allows arbitrary ws:/wss: hosts: ${(csp.match(/connect-src[^;]*/) || [''])[0]}`);
  rec('N4', 'headers', 'low', !!(await fetch(API + '/auth/me')).headers.get('x-content-type-options'), 'X-Content-Type-Options present');
  rec('N5', 'info-leak', 'low', !(await fetch(BASE + '/health').then((r) => r.text())).includes('uptime'), '/health does not reveal uptime to the public internet');

  {
  // ---------- O. v7-v9 features: digital bills, settings secrets, browser print ----------
  const tea = prods.find((p) => p.name === 'Tea');
  await call('POST', '/finance/cash-sessions', { jar: owner, body: { openingPaise: 100000 } });
  await mk('supplier1', 'supplier');
  const { jar: sup } = await login('supplier1', 'Staff#Pass123', '10.0.0.30');
  const { jar: cashO } = await login('cashier1', 'Staff#Pass123', '10.0.0.31');
  const newOrder = async (extra = {}) => (await call('POST', '/orders', { jar: owner, body: { idempotencyKey: uid(), type: 'PARCEL', confirm: true, items: [{ productId: tea._id, qty: 1, note: '<img src=x onerror=alert(1)>' }], ...extra } })).json?.order;
  const payFull = (o) => call('POST', `/orders/${o._id}/payments`, { jar: owner, body: { idempotencyKey: uid(), method: 'CASH', amountPaise: o.totalPaise, tenderedPaise: o.totalPaise } });
  const oA = await newOrder(); await payFull(oA);
  const sendA = await call('POST', `/bills/${oA._id}/digital-sent`, { jar: cashO, body: { channel: 'WHATSAPP', phone: '9876543210' } });
  rec('O1', 'rbac', 'high', sendA.status === 200, `cashier records a digital send -> ${sendA.status}`);
  const matrix = [
    ['kitchen', kit, [['GET', '/bills/digital'], ['GET', '/bills/verify?bill=1'], ['POST', `/bills/${oA._id}/verified`], ['POST', `/bills/${oA._id}/digital-sent`], ['GET', '/reports/verified'], ['PUT', '/settings'], ['POST', '/settings/test-email']]],
    ['stock', stk, [['GET', '/bills/digital'], ['GET', '/bills/verify?bill=1'], ['POST', `/bills/${oA._id}/verified`], ['POST', `/bills/${oA._id}/digital-sent`], ['GET', '/reports/verified'], ['GET', `/orders/${oA._id}/receipt`], ['PUT', '/settings']]],
    ['cashier', cashO, [['GET', '/reports/verified'], ['PUT', '/settings'], ['POST', '/settings/test-email'], ['GET', '/reports/export/verified.csv']]],
    ['supplier', sup, [['POST', `/bills/${oA._id}/digital-sent`], ['GET', `/orders/${oA._id}/receipt`], ['GET', '/reports/verified'], ['PUT', '/settings'], ['POST', '/orders'], ['POST', `/orders/${oA._id}/payments`], ['GET', '/finance/expenses']]],
  ];
  for (const [role, jar, list] of matrix) {
    const bad = []; for (const [m, p] of list) { const r = await call(m, p, { jar, body: m === 'GET' ? undefined : {} }); if (r.status !== 403) bad.push(`${m} ${p.split('?')[0]} -> ${r.status}`); }
    rec(`O2-${role}`, 'rbac', 'critical', bad.length === 0, bad.join('; ') || `${role} is refused everywhere it should be`);
  }
  const supOk = [await call('GET', '/bills/digital', { jar: sup }), await call('GET', `/bills/verify?bill=${oA.billNo}`, { jar: sup })];
  rec('O3', 'rbac', 'medium', supOk.every((r) => r.status === 200), `supplier role can list and check digital bills -> ${supOk.map((r) => r.status)}`);
  const kitReceipt = await call('GET', `/orders/${oA._id}/receipt?kind=KOT`, { jar: kit }); rec('O4', 'rbac', 'info', kitReceipt.status === 200, `kitchen can print its own ticket -> ${kitReceipt.status}`);
  // secrets
  await call('PUT', '/settings', { jar: owner, body: { emailCfg: { host: 'smtp.example.com', port: 587, user: 'mailer', from: 'a@b.co', pass: 'TopSecretPass99' }, whatsappCfg: { token: 'EAAGtopsecrettoken', phoneNumberId: '1', templateName: 't', templateLang: 'en', billMessage: 'x {link}' } } });
  const gsOwner = await call('GET', '/settings', { jar: owner }); const gsCash = await call('GET', '/settings', { jar: cashO }); const aud = await call('GET', '/audit?limit=300', { jar: owner });
  const hay = gsOwner.text + gsCash.text + aud.text;
  rec('O5', 'secrets', 'critical', !/TopSecretPass99|EAAGtopsecret|passEnc|tokenEnc/.test(hay), 'SMTP password / WhatsApp token never appear in settings, staff settings or the audit log (not even encrypted)');
  rec('O6', 'secrets', 'high', !gsCash.text.includes('smtp.example.com') && !gsCash.text.includes('mailer'), 'a cashier does not see the mail server or user name');
  const mass = await call('PUT', '/settings', { jar: owner, body: { emailCfg: { host: 'smtp.example.com', port: 587, user: 'mailer', from: 'a@b.co', passEnc: 'pwned', passSet: false }, owner: { email: 'evil@x.co', emailVerified: true } } });
  const afterMass = (await call('GET', '/settings', { jar: owner })).json.settings;
  rec('O7', 'mass-assignment', 'high', mass.status === 200 && afterMass.emailCfg.passSet === true && afterMass.owner.email !== 'evil@x.co' && afterMass.owner.emailVerified !== true || mass.status === 400, `cannot write encrypted fields or mark the owner email verified through /settings -> ${mass.status}`);
  const bads = [
    { browserPrint: { paperMm: 5, copies: 1, fontPx: 13, autoPrintBill: false, autoPrintKot: false, showTamil: false } },
    { browserPrint: { paperMm: 80, copies: 99, fontPx: 13, autoPrintBill: false, autoPrintKot: false, showTamil: false } },
    { browserPrint: { paperMm: 80, copies: 1, fontPx: 1000, autoPrintBill: false, autoPrintKot: false, showTamil: false } },
    { emailCfg: { host: 'evil.com/x?y', port: 587, user: '', from: '' } }, { emailCfg: { host: 'h.com', port: 0, user: '', from: '' } }, { emailCfg: { host: 'h.com', port: 99999, user: '', from: '' } },
    { whatsappCfg: { phoneNumberId: '12ab', templateName: 'ok', templateLang: 'en', billMessage: 'x' } }, { whatsappCfg: { phoneNumberId: '1', templateName: 'Bad Name!', templateLang: 'en', billMessage: 'x' } },
    { whatsappCfg: { phoneNumberId: '1', templateName: 'ok', templateLang: 'en', billMessage: 'x'.repeat(5000) } }, { useTables: 'yes' }, { reportContent: { payments: 'no' } },
  ];
  const badOk = []; for (const [i, b] of bads.entries()) { const r = await call('PUT', '/settings', { jar: owner, body: b }); if (r.status !== 400) badOk.push(`#${i}:${r.status}`); }
  rec('O8', 'validation', 'high', badOk.length === 0, badOk.join(' ') || 'every out-of-range printer / email / WhatsApp / report setting is rejected');
  const te = await call('POST', '/settings/test-email', { jar: owner, body: { to: 'stranger@example.org' } });
  rec('O9', 'abuse', 'high', te.status === 400, `test email to an address that is not the owner's saved one is refused -> ${te.status} (otherwise the shop's mail server is a spam relay)`);
  // injection into the new endpoints
  const injO = []; 
  for (const p of ['/bills/verify?bill[$ne]=x', '/bills/verify?bill[$regex]=.*', '/bills/verify?bill=AM-%2E*', '/bills/verify?bill=1%00', '/bills/verify?bill=' + 'A'.repeat(5000), '/bills/verify', '/bills/verify?bill=12&bill=13']) {
    const r = await call('GET', p, { jar: cashO }); if (r.status >= 500 || (r.status === 200 && r.json?.verdict === 'GENUINE')) injO.push(`${p.slice(0, 40)} -> ${r.status}`); }
  rec('O10', 'injection', 'critical', injO.length === 0, injO.join('; ') || 'operator / regex / null-byte / array / huge inputs to Verify never crash or approve');
  const idBad = []; for (const id of ['abc', '{"$ne":1}', '../../x', '%24ne', 'a'.repeat(24).replace(/a/g, 'z')]) { for (const [m, p] of [['POST', `/bills/${encodeURIComponent(id)}/verified`], ['POST', `/bills/${encodeURIComponent(id)}/digital-sent`], ['GET', `/orders/${encodeURIComponent(id)}/receipt`]]) { const r = await call(m, p, { jar: owner, body: m === 'POST' ? { phone: '9876543210' } : undefined }); if (r.status >= 500) idBad.push(`${m} ${p.slice(0, 40)} -> ${r.status}`); } }
  rec('O11', 'injection', 'high', idBad.length === 0, idBad.join('; ') || 'malformed ids give 4xx, never a server error');
  const rq = []; for (const q of ['kind=../../etc', 'kind=BILL&copy=2', 'kind[$ne]=1', 'kind=KOT&copy[]=1']) { const r = await call('GET', `/orders/${oA._id}/receipt?${q}`, { jar: owner }); if (r.status !== 400) rq.push(`${q} -> ${r.status}`); }
  rec('O12', 'validation', 'medium', rq.length === 0, rq.join('; ') || 'receipt kind/copy parameters are strictly validated');
  const rr = await call('GET', '/reports/verified?range[$ne]=1', { jar: owner }); const rr2 = await call('GET', '/reports/verified?range=custom&from=garbage', { jar: owner });
  rec('O13', 'injection', 'medium', rr.status < 500 && rr2.status < 500, `verified report with hostile range -> ${rr.status}/${rr2.status}`);
  // state machine
  const oUn = await newOrder(); await call('POST', `/bills/${oUn._id}/digital-sent`, { jar: cashO, body: { phone: '9876543211' } });
  const vUn = await call('GET', `/bills/verify?bill=${oUn.billNo}`, { jar: cashO }); const mUn = await call('POST', `/bills/${oUn._id}/verified`, { jar: cashO, body: {} });
  rec('O14', 'logic', 'critical', vUn.json?.verdict === 'NOT_PAID' && mUn.status === 409, `unpaid digital bill -> ${vUn.json?.verdict}, verify tap -> ${mUn.status}`);
  const oPart = await newOrder({ items: [{ productId: tea._id, qty: 4 }] }); await call('POST', `/orders/${oPart._id}/payments`, { jar: owner, body: { idempotencyKey: uid(), method: 'CASH', amountPaise: 100, tenderedPaise: 100 } });
  await call('POST', `/bills/${oPart._id}/digital-sent`, { jar: cashO, body: { phone: '9876543212' } });
  rec('O15', 'logic', 'critical', (await call('GET', `/bills/verify?bill=${oPart.billNo}`, { jar: cashO })).json?.verdict === 'NOT_PAID', 'part-paid bill is not genuine');
  const oNs = await newOrder(); await payFull(oNs);
  const vNs = await call('GET', `/bills/verify?bill=${oNs.billNo}`, { jar: cashO }); const mNs = await call('POST', `/bills/${oNs._id}/verified`, { jar: cashO, body: {} });
  rec('O16', 'logic', 'critical', vNs.json?.verdict === 'NOT_SENT' && mNs.status === 409, `paid bill AMMAS never sent digitally (fake on a phone) -> ${vNs.json?.verdict}, verify tap -> ${mNs.status}`);
  const oCan = await newOrder(); await payFull(oCan); await call('POST', `/bills/${oCan._id}/digital-sent`, { jar: cashO, body: { phone: '9876543213' } });
  const cn = await call('POST', `/orders/${oCan._id}/cancel`, { jar: owner, body: { reason: 'test' } });
  const vCan = await call('GET', `/bills/verify?bill=${oCan.billNo}`, { jar: cashO }); const sCan = await call('POST', `/bills/${oCan._id}/digital-sent`, { jar: cashO, body: { phone: '9876543213' } });
  rec('O17', 'logic', 'high', ['CANCELLED', 'REFUNDED'].includes(vCan.json?.verdict) || cn.status >= 400, `cancelled/refunded bill is not genuine (cancel ${cn.status}) -> ${vCan.json?.verdict}; re-send -> ${sCan.status}`);
  const oRace = await newOrder(); await payFull(oRace); await call('POST', `/bills/${oRace._id}/digital-sent`, { jar: cashO, body: { phone: '9876543214' } });
  const race = await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', `/bills/${oRace._id}/verified`, { jar: i % 2 ? cashO : sup, body: {} })));
  rec('O18', 'race', 'critical', race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 11, `12 simultaneous verify taps from 2 people -> ${race.map((r) => r.status).join(',')}`);
  const resend = await call('POST', `/bills/${oRace._id}/digital-sent`, { jar: cashO, body: { phone: '9000000000' } });
  const reVer = await call('GET', `/bills/verify?bill=${oRace.billNo}`, { jar: cashO });
  rec('O19', 'logic', 'critical', resend.status === 409 && reVer.json?.verdict === 'ALREADY_VERIFIED', `after verification the bill cannot be re-sent or re-verified (resend ${resend.status}, now ${reVer.json?.verdict})`);
  const badPhone = []; for (const ph of ['12345', '0000000000', { $ne: 1 }, '98765 4321', 'abcdefghij', '+91 12345 67890']) { const r = await call('POST', `/bills/${oRace._id}/digital-sent`, { jar: cashO, body: { phone: ph } }); if (r.status === 200) badPhone.push(JSON.stringify(ph)); }
  rec('O20', 'validation', 'medium', badPhone.length === 0, badPhone.join(' ') || 'invalid mobile numbers are refused');
  const lst = await call('GET', '/bills/digital', { jar: cashO });
  rec('O21', 'privacy', 'high', !/9876543210|9876543211/.test(lst.text) && !/customerPhone|receiptToken/.test(lst.text), 'the digital list shows only the last 4 digits, no full number or receipt token');
  const vr = await call('GET', `/bills/verify?bill=${oRace.billNo}`, { jar: sup }); rec('O22', 'privacy', 'high', !/customerPhone|customerName|receiptToken|upiRef|tenderedPaise/i.test(vr.text), 'what the supplier sees contains no customer data, payment reference or receipt link');
  const rep = await call('GET', '/reports/verified?range=today', { jar: owner });
  rec('O23', 'report', 'medium', rep.json?.rows?.some((x) => x.billNo === oRace.billNo && x.items?.length && x.verifiedByName) && !/9000000000|9876543214/.test(rep.text), 'verified report lists the bill with items and who verified, no full phone numbers');
  const csvR = await call('GET', '/reports/export/verified.csv?range=today', { jar: owner });
  rec('O24', 'csv', 'high', csvR.status === 200 && !/^[=+\-@]/m.test(csvR.text.split('\n').slice(1).map((l) => l.split(',')[4] ?? '').join('\n')) || !/=cmd|@SUM/i.test(csvR.text), 'CSV cannot carry spreadsheet formulas from item notes or names');
  const brA = await call('GET', `/orders/${oRace._id}/receipt`, { jar: owner }); const brB = await call('GET', `/orders/${oRace._id}/receipt?copy=1`, { jar: owner });
  rec('O25', 'print', 'medium', brA.status === 200 && !/COPY/i.test(brA.text) && /COPY/i.test(brB.text), 'a second printed bill is clearly marked COPY');
  const noteLine = (brA.json?.lines ?? []).join('\n'); rec('O26', 'print', 'info', true, `item note with <img onerror> arrives as plain text (browser print escapes it): ${noteLine.includes('<img') ? 'yes, escaped client-side' : 'removed'}`);
  rec('O27', 'throttle', 'medium', (await (async () => { let hit = false; for (let i = 0; i < 110; i++) { const r = await call('GET', '/bills/verify?bill=' + (1000 + i), { jar: sup }); if (r.status === 429) { hit = true; break; } } return hit; })()), 'guessing many bill numbers in a minute is slowed down (429)');
  const spam = []; for (let i = 0; i < 10; i++) spam.push((await call('POST', '/reports/recipient', { jar: owner, body: { channel: 'EMAIL', target: `victim${i}@example.org` } })).status);
  rec('O28', 'abuse', 'high', spam.includes(429), `starting owner-email verification 10 times in a row is throttled -> ${spam.join(',')}`);

  }

  // ---------- B (late). brute-force tests run last because they exhaust the per-address failure budget ----------
  // brute force from many spoofed IPs against one account (limiter bypass via X-Forwarded-For)
  let blocked = 0; for (let i = 0; i < 40; i++) { const r = await call('POST', '/auth/login', { body: { username: 'stock1', password: 'guess' + i }, ip: `172.16.${i}.${i + 1}` }); if (r.status === 429) blocked++; }
  rec('B6', 'authn', 'high', blocked > 0, `40 wrong passwords for one (staff) account from 40 spoofed X-Forwarded-For addresses -> ${blocked} blocked (0 means the limiter is bypassable)`);
  // a shared restaurant IP: someone hammering ONE account must not lock out the OTHER staff on the same address
  let sawLimit = false; for (let i = 0; i < 25; i++) { const r = await call('POST', '/auth/login', { body: { username: 'cashier1', password: 'nope' + i }, ip: '203.0.113.7' }); if (r.status === 429) sawLimit = true; }
  const legit = await call('POST', '/auth/login', { body: { username: 'kitchen1', password: 'Staff#Pass123' }, ip: '203.0.113.7' });
  rec('B7', 'availability', 'medium', legit.status === 200, `after 25 failed tries on one account (limiter fired: ${sawLimit}), a DIFFERENT staff member on the same IP logs in -> ${legit.status}`);
  rec('B8', 'authn', 'high', sawLimit, 'repeated wrong passwords against one account are throttled');

  // ---------- report ----------
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const failed = results.filter((r) => !r.ok).sort((a, b) => order[a.sev] - order[b.sev]);
  console.log(`\nTOTAL ${results.length} checks | PASS ${results.length - failed.length} | FAIL ${failed.length}\n`);
  for (const f of failed) console.log(`FAIL [${f.sev.toUpperCase()}] ${f.id} (${f.area}): ${f.detail}`);
  fs.writeFileSync(process.argv[3] || 'attack-results.json', JSON.stringify(results, null, 2));
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
