# AMMAS security and quality audit (v6)

Scope: the whole server (auth, permissions, orders, payments, printing, uploads, public QR pages, realtime) and the web app.
Method: code review, then a live attack suite (96 checks) and a workflow smoke test (61 steps) against the running server on a real database.
Result: **22 of 90 attack checks failed at the start; after the fixes 95 of 96 pass** (the last one is informational: the Secure cookie flag only applies in production over HTTPS and was confirmed separately).

## What was found and fixed

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | Critical | **Every order failed to save (HTTP 500)** on a real database. The order `events` field used a key named `type`, which Mongoose reads as a type declaration. Versions v2 to v4 were affected. | Explicit sub-schema, plus a regression test. |
| 2 | Critical | **Owner takeover.** A user with only "manage users" could reset the owner's password, make themselves Owner, grant themselves any permission, deactivate the owner, or add permissions to a role. | Nobody can change, create or grant access higher than their own. Owner is unaffected. |
| 3 | Critical | **Concurrent payments could overpay** (10 simultaneous full payments recorded 10 times the bill). | Amount is reserved in one atomic step, payments for a bill run one at a time, status only moves forward. |
| 4 | Critical | **Concurrent refunds could exceed the amount paid** (cash theft vector). | Same atomic reservation and per-bill lock. |
| 5 | High | Two or more simultaneous orders could take the **same table**. | Atomic table claim. |
| 6 | High | A payment key reused on another bill returned "duplicate" and **silently left that bill unpaid**. | Key is bound to its bill; reuse is refused with a clear message. |
| 7 | High | **Login and QR-feedback rate limits could be bypassed** with a fake `X-Forwarded-For` header. | Proxy headers are trusted only when `TRUST_PROXY` is set. |
| 8 | High | **CSV formula injection.** Anyone could type `=HYPERLINK(...)` into the public feedback form and it reached the owner's Excel exports. | Cells starting with `= + - @` are neutralised in every CSV. |
| 9 | High | **Cross-site WebSocket hijacking**: another website could open the live-updates socket using a logged-in user's cookie. | Origin must match this site. |
| 10 | Medium | The login limiter counted successful logins too, so a few typos could lock out **every staff member sharing the restaurant's IP**. | Only failures count, per account and address. |
| 12 | Medium | Bad or oversized image uploads returned a server error. | Clean 400/413 messages; decompression-bomb pixel cap. |
| 13 | Medium | Reports accepted query objects (`?range[$gt]=`) and crashed. | Only plain text values are accepted. |
| 14 | Medium | API responses had no `Cache-Control`, so orders and customers could be cached by browsers or proxies. | `no-store` on the whole API. |
| 15 | Medium | The security headers forced HTTPS (`upgrade-insecure-requests`, HSTS), which **breaks the app on a plain-HTTP restaurant network**. The CSP also allowed any WebSocket host. | Applied only when HTTPS is in use; WebSocket limited to this site. New `COOKIE_SECURE` setting. |
| 16 | Low | Invalid ids and malformed JSON returned 500; `/health` exposed uptime; table QR tokens were 72 bits; Docker ran as root; failed logins were not recorded. | 400 responses, minimal health, 96-bit tokens, non-root container, failed logins audited. |

## What held up (tested, no change needed)

* All 22 admin endpoints refuse a cashier; kitchen and stock roles refuse orders, prices, users, reports and money endpoints.
* Prices, totals and discounts sent by the browser are ignored; the server prices every order itself (including the new dine-in / takeaway / parcel prices).
* Zero, negative, fractional and absurd quantities, unknown and sold-out items, and oversized discounts are refused or clamped.
* Double taps and retries never create a second order or payment; UPI cannot be saved unverified; a paid bill cannot be cancelled; only the owner role can refund.
* Login does not reveal whether a username exists; sessions are HttpOnly, SameSite, hashed in the database, and die on logout, password change and deactivation.
* CSRF: state-changing calls without the app header are refused, there is no cross-origin CORS.
* Operator-injection into login and queries, path traversal on `/uploads`, script/HTML/SVG/PHP uploads and the print bridge token (missing, wrong, or a staff cookie) were all refused.
* No password hashes or session tokens in any API response; no stack traces in errors; the digital receipt shows no customer phone or staff names.
* Workflow smoke test: cash drawer open/close, dine-in order, **printer failure then retry without losing the order**, kitchen steps, split cash + UPI payment, completion frees the table, refund, stock receive/adjust/count/waste, expenses, price list, stars, parcel pricing: 60 of 61 steps pass (the 61st uses a query this test database cannot run).

## Known limits and risks (please read)

1. **A dishonest cashier can mark UPI as paid without money arriving.** The app records who did it (audit log) but has no payment-gateway link. Compare UPI totals with your bank/UPI app every day.
2. **Run one server process.** The locks that protect payments live in that process. Do not run several copies behind a load balancer.
3. **Use HTTPS if the app is reachable from the internet.** On a private shop network over plain HTTP, set `COOKIE_SECURE=false`; anyone on that network could then read the traffic.
4. **Account lockout can be abused**: someone who knows a username can lock that account for 15 minutes by guessing wrongly 40 times. This was chosen over unlimited guessing.
5. **Dependency advisory:** zod (used to validate input) has a known memory-exhaustion issue for oversized collections. It is limited here by the 200 KB request-body cap. The fix is a major-version upgrade that has not been made.
6. **Not covered:** the Windows/printer PC itself, network equipment, backups, the WhatsApp/email provider accounts, denial-of-service from the network, and a professional external penetration test before you go live with real customers.
7. **Test database:** the live tests ran on FerretDB because real MongoDB could not be downloaded here. FerretDB is not fully atomic, so the payment, refund and table protections were proven through the in-process lock; the dashboard aggregations and the low-stock query could not run on it. Please repeat the checks once on MongoDB (below).

## Repeat the tests yourself

See `apps/server/scripts/security/README.md`. The attack suite creates users and orders, so **run it only against a test database, never your live one.**

## v10 – deep audit of the v7–v9 features (digital bills, Settings, browser print)

Tested live (attack suite section O, 31 new checks) plus code review plus a visual sweep of every page at 5 screen sizes.

**Found and fixed**
- Test email and "owner email verification" could be used to send mail to any address with the shop's mail account (spam relay, cost). Now: test email goes only to the owner's saved address, and both are limited to 8 per hour per person.
- Verify / mark-verified had no limit, so bill numbers could be guessed quickly and the audit log filled. Now limited to 100 per minute per signed-in person.
- A role list sent to the server had no size cap (zod advisory GHSA-mrhx-c7xc-m3w5). Capped at 100; all request bodies are already capped at 200 KB. The zod 4 upgrade is a breaking change and is not needed for this.
- In browser-print mode the header showed a permanent "printer not connected" warning. It now shows the printer as ready.
- Settings > Reports could crash on an empty delivery history response. Made safe.
- Report range buttons wrapped to 3 lines on small phones. Shortened.

**Checked and passing**
- Every new endpoint refuses kitchen, stock, cashier and supplier roles where it should (cashier cannot see reports or change settings; supplier cannot send, print, take payments or see money).
- SMTP password and WhatsApp token never appear in any API response, in the audit log, or to a cashier, not even encrypted. An empty box keeps the saved value. Writing the encrypted fields or marking the owner email verified through /settings is ignored.
- Unpaid, part-paid, cancelled, never-sent-digitally, already-verified bills are never "genuine". 12 simultaneous verify taps from 2 people: exactly 1 wins.
- Operator, regex, null-byte, array and huge inputs to the new endpoints give 4xx, never a crash or an approval.
- Item names and notes containing HTML show as plain text on the Verify page, the report and the printed slip.
- No customer name, phone, payment reference or receipt link is shown to the verifier. Only the last 4 digits of the phone are stored.

**Known and accepted**
- Whoever shows a real bill number first gets it verified. If a customer forwards their bill to a friend, the friend may be first, and the real customer then sees "Already verified". The cashier sees who verified it and when in the Verified report.
- The owner can point the email server at any host. This is an owner-only setting; the error text is shortened.
- The test database (FerretDB) cannot prove behaviour on real MongoDB; run the attack suite once against your real database.
