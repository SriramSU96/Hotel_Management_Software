# AMMAS Hotel App v2

One-branch restaurant system for AMMAS Coimbatore: cashier POS, kitchen screen, stock, owner dashboard, table-QR feedback, receipt printing with failure recovery, and WhatsApp/email owner reports. Built from `docs/product/ammas-production.md`.

**Stack:** React + TypeScript + Vite + Tailwind 4 (web) · Node + Express + TypeScript + Mongoose (server) · MongoDB · Socket.IO · small Node print bridge.

```
apps/web          cashier / kitchen / owner UI (Tamil + English, phone, tablet, desktop)
apps/server       REST API /api/v1, realtime, scheduled reports
apps/print-bridge runs on the counter PC, sends jobs to the thermal printer
docs/product      the requirements spec
infrastructure    Dockerfile + docker-compose
```

## Run it (development)

Needs Node 20+ and a MongoDB (local, Docker, or free Atlas).

```bash
npm install
cp apps/server/.env.example apps/server/.env     # set MONGODB_URI
npm run seed        # creates roles, an owner login, sample menu, 10 tables, stock items
npm run dev         # web http://localhost:5173  API http://localhost:4000
```

`npm run seed` prints the owner password **once** (username `owner`). Set `SEED_OWNER_PASSWORD` to choose it. Change it after first sign-in. The sample menu (Rice, Biryani, Meals, Snacks, Drinks, taken from the reference design) and prices are placeholders: replace them in **Menu**.

Docker trial: `docker compose -f infrastructure/docker/docker-compose.yml up --build`, then `docker compose -f infrastructure/docker/docker-compose.yml exec app node dist/seed.js` (prints the owner password once). Open http://localhost:4000.

Production: `npm run build && npm start` (the server also serves the built web app). Use HTTPS, MongoDB Atlas with backups, and set `NODE_ENV=production`.

## Printing (BluPrints Utkarsh Ultra Premium)

The app never depends on the printer. Confirming an order saves it and queues a print job; if printing fails the cashier sees **Retry Print / Digital Receipt / Continue Without Printing**, and the job waits in **Prints**. Retries reuse the same job, so no second bill is created. Reprints are marked COPY with the original bill number.

1. Set `PRINT_BRIDGE_TOKEN` (16+ chars) in `apps/server/.env`.
2. On the counter PC: `cp apps/print-bridge/.env.example apps/print-bridge/.env`, put the same token and your server URL.
3. Start with `PRINTER_MODE=DRYRUN` to see output in the console, then try the real printer:
   - **Ethernet:** `PRINTER_MODE=TCP`, `PRINTER_HOST=<printer IP>`, `PRINTER_PORT=9100` (print the printer's self-test page to read its IP).
   - **USB:** share the printer in Windows and use `PRINTER_MODE=FILE`, `PRINTER_PATH=\\localhost\<ShareName>` (or `/dev/usb/lp0` on Linux).
4. `npm run bridge`, then **Prints → Print test page**.

**Must be verified on the real printer** (the photos do not prove these): paper width (set "Characters per line" in Settings: 32 for 58 mm, 42/48 for 80 mm), ESC/POS compatibility, Tamil text (the bridge sends plain ASCII; Tamil on paper needs printer font support or image printing, not included), paper-out/offline behaviour, Bluetooth. Run the acceptance list in the spec section 7. Bluetooth is not implemented in the bridge. Jobs show "Sent, not confirmed" when the printer does not answer status queries.

## Owner reports

WhatsApp uses the official WhatsApp Business Cloud API; email uses SMTP. Fill the `SMTP_*` and `WHATSAPP_*` values in `apps/server/.env` (WhatsApp needs an approved message template with one body variable). Then in **Settings → Reports** add the recipient, enter the 6-digit code, and choose a schedule. Delivery history, failures and retries are listed there. Without credentials nothing is sent and the screen says so.

## What follows the spec, and what it does not do

- Money is integer paise; the server prices and totals every order; prices are snapshotted per line.
- Order, payment and print status are separate; creating orders, payments, refunds and print retries are idempotent.
- UPI is recorded only after the cashier ticks "I have seen the money".
- No tax is assumed (set it in Settings). No ingredient is auto-deducted from stock. Profit is shown as "unavailable" with clearly labelled partial figures until recipes and costs exist.
- Permissions are enforced in the API; the last administrator cannot be removed; sensitive changes are in the audit history.
- QR cards open a feedback page only. Contact details are stored only with consent; marketing consent is separate.
- Cloud-only: if the internet is down the app says so and saves nothing. No offline POS (that is the optional Phase 2 local server).

## Not done / needs your decision

Split payments, customer credit/dues, PDF export (CSV is included), recipe-based costing, receipt attachments for expenses, push notifications, Bluetooth printing, a local offline server. Product photos are uploaded by the owner (none are bundled).

## Checks

`npm run typecheck`, `npm test` (unit tests for money, tax, units, time zone, receipts, permissions). The API integration flows need a MongoDB to exercise; run them against a staging database before go-live and follow the spec's test list (section 22) and go-live checklist (section 23).


## v3: reference design and responsive layout
- Styling follows `ammas_final.html`: DM Sans + Playfair Display, the same palette, sidebar/topbar layout and dashboard cards.
- Food photos are hotlinked from Unsplash (the CSP allows `images.unsplash.com`), so they need internet. If a photo fails, or the item has none (Lime Juice), a letter placeholder is shown. Upload your own photos in **Menu**.
- Responsive: phone under 640px uses a bottom nav, a More page and a floating cart bar; tablet 640 to 1099px uses an icon rail and a side cart from 760px; desktop 1100px and up uses the full sidebar.
- Touch targets stay at 44px or larger, bigger than the reference, for counter staff.

## v4: price list, order-type prices, quick-order stars
- **Menu > Price list & quick order** (owner/manager): one screen to set each food's **Dine-in**, **Takeaway** and **Parcel** price. Leave Takeaway or Parcel empty to use the Dine-in price. Changes are saved together with one "Save prices" button and are written to the audit log; Dine-in changes also go to price history.
- **Star**: tap the star on a food to add it to **Quick order**, a row at the top of the billing screen (one swipeable row on phones). Only available items show there.
- The billing screen shows the price for the chosen order type and re-prices the cart when the type changes. The server prices every order itself from the order type, including at confirm time, so the browser's price is never trusted.
- Responsive audit: all screens checked at 1440, 1180, 820, 390 and 360px for sideways scrolling and for buttons under 44px. Fixed: the language toggle (now 44px) and checkboxes that shrank on phones.
- The seed stars Chicken Rice, Chicken Biryani, Veg Meals, Parotta and Tea. Existing databases keep their menu; star items in Price list.

## v6: security audit
- Full report: `SECURITY-AUDIT.md`. A live attack suite and a workflow smoke test are in `apps/server/scripts/security/` (run them on a test database only).
- **Important fix:** saving an order failed on a real MongoDB in v2 to v4 (a schema bug). It is fixed and covered by a test. Please use v5.
- New settings in `.env`: `TRUST_PROXY` (set to 1 only when Caddy/nginx/Cloudflare sits in front) and `COOKIE_SECURE` (set `false` only on a plain-HTTP shop network). Run **one** server process.
- Admins can no longer create or edit users, roles or permissions above their own access. Failed logins appear in the audit log.

## v8 – Verify digital bills only + Verified report

- Printed bills need no checking. Only bills the cashier **sends to the customer on WhatsApp** are verified, because only those can be faked.
- **Send bill on WhatsApp** (receipt screen): the system records that it sent that bill (channel, time, who, last 4 digits of the phone; the full number is never stored) and opens WhatsApp with a link, never an image.
- **Verify digital bill** (`/verify`, cashier / admin / optional Supplier role): shows today's digital bills as a tappable list. Tap one (or type its number) to see the real bill. If the number is not in the list the screen says NOT SENT BY AMMAS (fake). Tap **Verified** to accept; it works once per bill and is race-safe.
- **Verified bills report** (`/verified-report`, needs reports.view): every verified bill with food items, amount, payment, who verified, date and time, how it was sent, who sent it, time taken, plus counts per person and "sent but never verified". CSV export included.

## v9 – Settings for printer, WhatsApp, email and reports

- **Settings > Printer:** choose *Any printer (browser print)* and the computer's own print window opens for the bill (and kitchen ticket), so any printer works, even PDF. Set paper (58 mm, 80 mm, A4), text size, copies, auto-print, and print a test slip. Thermal bridge modes are still there.
- **Settings > WhatsApp:** the message the cashier sends with a bill (`{shop}`, `{bill}`, `{link}`) with a live preview, plus the WhatsApp Business details for owner reports.
- **Settings > Email:** SMTP server, port, user, password, from address, and a *Send test email* button.
- **Settings > Reports:** choose what the owner report contains, plus recipients and schedule as before.
- Passwords and tokens typed in Settings are stored **encrypted** (AES-256-GCM, key from `SETTINGS_KEY`, or the bridge token if not set), are never sent back to the browser, and never appear in the audit log. Leave the box empty to keep the saved value. Set `SETTINGS_KEY` (16+ characters) in `.env` and do not change it later, or the saved passwords must be typed again.
- **Eat here** replaces Dine-in. Tables are optional (*Settings > Business > Use table numbers*, off by default).
- Low-stock list fixed (no longer needs a database feature the test DB lacked).
