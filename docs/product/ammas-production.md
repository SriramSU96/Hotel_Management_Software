# AMMAS Coimbatore — Production Requirements & Implementation Specification

> **Document:** `ammas-production.md`  
> **Product:** One-branch restaurant POS, kitchen, inventory and owner reporting system  
> **Primary goal:** Make order-taking and billing extremely fast for the cashier, easy for staff with limited computer experience, and give the owner reliable operational and financial visibility.  
> **Platforms:** Web app, tablet app experience, and mobile app experience.  
> **Initial deployment:** Cloud-first, designed so a local server can be added later.  
> **Currency:** INR (₹). Store monetary values as integer paise.

---

## 1. Product vision and operating model

AMMAS is a single-branch restaurant management application for the AMMAS hotel.

The core workflow is:

1. Cashier selects a table or takeaway.
2. Cashier taps food product tiles with photos and large quantity controls.
3. The system creates an order and sends the kitchen ticket (KOT) to the kitchen display.
4. The system attempts to print the customer bill using the configured receipt printer.
5. Cashier collects cash or verifies the UPI payment, then records the payment.
6. Kitchen staff prepare the order and update its status.
7. Owner views live sales, demand, rush hours, product performance, stock, expenses and profit/loss.
8. Daily/weekly/monthly reports can be delivered to the owner by WhatsApp and email.

**Important business distinction:** the table QR code is for customer details and feedback, not customer self-ordering. The cashier remains responsible for entering orders.

The app must not require every worker to understand accounting or complex software terminology. Use familiar words, clear icons, large tap targets, short forms, Tamil + English labels, and confirmation messages.

---

## 2. Confirmed requirements and decisions

| Area | Requirement / decision |
|---|---|
| Business | AMMAS Coimbatore, one branch initially |
| Platforms | Responsive web, tablet-friendly interface, mobile-friendly experience |
| Primary POS | Quick cashier-operated order entry |
| Order types | Dine-in by table and takeaway; parcel can be configured |
| Customer ordering | No QR self-ordering in the initial scope |
| Billing | Print customer bill; provide a safe fallback if printer fails |
| Kitchen | KOT on kitchen screen and printed KOT where printer is configured |
| Payments | Cash and UPI; UPI is marked paid only after the cashier verifies the actual payment |
| Menu | Product photos, categories, availability, admin-controlled prices |
| Stock | Quick-add common stock such as eggs, chicken, rice, oil, etc., with units |
| Dashboard | Sales, profit/loss, rush hours, best sellers, demand and operational insights |
| Owner reports | Deliver reports to owner through WhatsApp and email after integration and recipient verification |
| Table QR | Capture customer details and feedback/reviews |
| Customer fields | Name, phone, email, profession, notes/review; optional fields and consent |
| Staff usability | Very simple UI for cashier and workers with limited computer experience |
| Design | Follow the supplied AMMAS HTML reference: warm ivory, forest green, muted gold, editorial typography, restrained cards and spacing |
| Printer | BluPrints Utkarsh Ultra Premium; label states USB / BT / Ethernet interfaces |

### Decisions still requiring confirmation before production go-live

- Printer paper width, command language/ESC-POS compatibility, driver, exact connection selected, and whether the supplied unit can be reached reliably from the cashier device.
- Whether bill printing and KOT printing use one printer or separate printers.
- GST/tax configuration and invoice fields; do not assume a tax rate.
- Whether discounts, split payments, refunds and credit/customer dues are required.
- Exact table count, menu, prices, stock units, opening hours and business timezone.
- Owner's verified WhatsApp number and email address, report schedule, and consent/opt-in requirements.
- Whether a dedicated local server is wanted later. It is not a Phase 1 assumption.

---

## 3. Users, roles and permissions

### Owner / Admin
- Full dashboard and reports.
- Create/edit products, categories, photos, prices and availability.
- Configure taxes, bill footer, receipt settings and printer settings.
- Manage stock, suppliers, purchases, waste and expenses.
- Manage users, roles and permissions.
- Configure owner report delivery and recipients.
- View audit logs, cash sessions, refunds and payment reconciliation.

### Cashier / Biller
- Open a new order quickly.
- Choose dine-in/table or takeaway.
- Add products and adjust quantities.
- Add short item notes when needed.
- Save/confirm order and request bill printing.
- Record cash received or UPI verified.
- Reprint an existing bill if permission allows.
- See printer status and a clear recovery action.
- Cannot change product prices unless explicitly permitted.

### Kitchen staff
- See incoming KOTs on a large, simple kitchen screen.
- View order number, table/type, item, quantity and preparation notes.
- Mark accepted / preparing / ready.
- Print or reprint KOT only if permitted.
- Do not see owner financial reports by default.

### Stock staff
- Quickly add received stock or adjust stock.
- Record waste/spoilage with a reason.
- View low-stock alerts.
- Cannot change selling prices or view sensitive financial data unless permitted.

### Permissions
- Use configurable roles and permissions, not only hard-coded role names.
- Enforce permissions in backend APIs, not just by hiding buttons.
- Keep an audit record for price changes, refunds, voids, stock adjustments, expense edits and permission changes.
- Protect the last active full-access administrator from accidental lockout.

---

## 4. UX and visual design principles

Use the supplied `ammas_final (2).html` as the design reference.

### Visual direction
- Warm ivory / paper background.
- Deep forest-green navigation and primary actions.
- Muted gold accents for emphasis.
- White or warm-white cards, fine neutral borders, subtle shadows.
- DM Sans or a similar highly readable sans-serif for UI; Playfair Display or a similar restrained editorial face for selected headings.
- Do not make the interface look like a generic admin template.
- Maintain good contrast and readable font sizes in bright restaurant lighting.

### Low-training / low-literacy interaction design
- Every primary action should have a clear icon and short text label.
- Use familiar terms: “New Order”, “Print Bill”, “Kitchen”, “Add Stock”, “Ready”.
- Tamil and English language toggle must be available; remember the device's selected language.
- Large product tiles with real food images, clear names and prices.
- Large `−` and `+` quantity controls; avoid tiny controls and long forms.
- Keep the cashier's common workflow to as few taps as possible.
- Use color plus text/icon for status; never rely on color alone.
- Confirm destructive actions such as cancel, refund, void and stock correction.
- Provide clear success/error messages in plain language.
- Keep the most used actions reachable on tablets and phones.
- Support keyboard shortcuts on desktop where helpful, without making shortcuts mandatory.
- Do not put owner-only financial information on the cashier's default screen.

### Accessibility and reliability
- Touch targets should be comfortably large (target about 44–48 CSS px or larger).
- Responsive layouts for desktop, tablet landscape/portrait and mobile.
- Support browser zoom and readable text.
- Show loading, empty, offline, printer-disconnected and error states.
- Prevent double taps from creating duplicate orders or payments.
- Never clear a cashier's order because a print attempt failed.

---

## 5. Main modules and screens

1. Secure login / device session.
2. Owner dashboard.
3. Cashier POS / quick order.
4. Active orders and order history.
5. Kitchen display (KDS) and KOT queue.
6. Table management and table QR management.
7. Menu / product management.
8. Price management and price history.
9. Stock / inventory quick entry.
10. Suppliers and purchases.
11. Waste management.
12. Expenses and cash management.
13. Reports and analytics.
14. Customer profiles and feedback.
15. Staff, roles and permissions.
16. Printer configuration and print queue.
17. WhatsApp/email report configuration.
18. Business settings, language, taxes, backup and audit history.

---

## 6. Cashier POS — highest priority

### Main layout
- Product category tabs.
- Search field with immediate filtering.
- Product cards with image, name, price and availability.
- Cart/order summary always visible on larger screens.
- Large quantity `− / +` controls.
- Order type: Dine-in / Takeaway (Parcel configurable).
- Table selection only for dine-in.
- Optional customer name/phone; do not force customer data for every walk-in order.
- Subtotal, configured tax, discount (if enabled) and grand total.
- Clear actions: Save Order, Confirm Order, Print Bill, Record Payment.

### Fast order flow
1. Start new order.
2. Select order type.
3. If dine-in, tap a table.
4. Tap product photo/tile to add.
5. Tap `+` / `−` to adjust quantity.
6. Review total.
7. Confirm order.
8. Send KOT to kitchen.
9. Print customer bill or use fallback.
10. Record verified payment.

### Rules
- An unavailable product cannot be added.
- Product price comes from the server's current price, not a value trusted from the browser.
- Price changes apply according to a defined policy; existing confirmed order lines retain their recorded price.
- Validate table selection for dine-in.
- Use a unique human-readable order/bill number.
- Double-click or retry must not create duplicate orders.
- Keep order and payment statuses separate.
- A failed print must never create another order or payment.
- Allow order edits only according to status and permission rules.
- Use a confirmation step for cancellation/void/refund.

### Product photos
- Admin can upload or change product photos.
- Use image cropping/resize and reasonable file-size limits.
- Store images in managed object storage in production, not as large database blobs.
- Provide a sensible placeholder if no image exists.
- Keep text labels visible even when an image fails to load.

---

## 7. Billing and receipt printer

### Hardware observed in supplied photos

The printer label in the supplied images reads:

- **Brand:** BluPrints
- **Model:** Utkarsh Ultra Premium
- **Interfaces printed on label:** USB / BT / Ethernet
- **Serial number shown:** U5K25120182
- A support number is printed on the device label; confirm the current support contact with the vendor before relying on it.

The photographs show a USB-style connection and an Ethernet-style port. Bluetooth is listed on the label. The photos do **not** establish paper width, supported printer command language, driver availability, network configuration, or successful compatibility with a browser/PWA. These must be verified with the vendor and a physical test.

### Printer integration approach
- Build a printer adapter/service so the application is not tightly coupled to one model.
- Preferred first test: Ethernet or USB via a small trusted local print bridge on the cashier Windows computer, depending on the confirmed driver/protocol.
- Test Bluetooth as an alternative only after verifying pairing, browser/device support and reliability.
- Browser `window.print()` is a basic fallback, not a substitute for dependable direct thermal printing.
- The print bridge should accept authenticated, queued print jobs from the app and report success/failure.
- Keep printer configuration separate for customer receipts and kitchen tickets if separate printers are later added.

### Customer bill contents
- AMMAS name and configured address/contact/tax details.
- Bill number and date/time.
- Order type and table number (if dine-in).
- Item names, quantities, unit prices and line totals.
- Subtotal, discount, configured taxes and grand total.
- Payment method and payment status.
- Footer message configured by admin.
- Optional QR code for digital receipt/feedback, if enabled.

### Print failure recovery — must-have workflow

**The sale must continue safely even when the printer is unavailable.** Printing is a separate job; it must not be the thing that creates or confirms the order.

When printing fails:
1. Keep the order and bill saved.
2. Show a clear message: “Bill saved. Printer is not responding.”
3. Give the cashier three simple options:
   - **Retry Print** — resend the same print job using the same job ID.
   - **Digital Receipt** — show a QR/link or share a receipt through an approved channel when available and customer consent is present.
   - **Continue Without Printing** — allow the cashier to complete the sale and mark that a paper copy was not printed.
4. Add the print job to a visible “Pending Prints” queue.
5. Let an authorized user reconnect the printer and retry pending jobs.
6. Store print attempts and outcomes in an audit log.
7. Reprint must be marked “COPY” / “DUPLICATE” with the original bill number; it must not create a new sale.
8. If the business requires a physical receipt during a prolonged outage, provide a controlled manual fallback: pre-numbered duplicate receipt book, cashier records the system bill number on it, and later reconciles the manual receipt. Do not invent or reuse bill numbers.

### Prevent duplicate printing / duplicate transactions
- Each bill has a stable bill ID.
- Each print request has a stable print-job ID and idempotency key.
- Retry the same print job; do not create a new bill.
- Track `QUEUED`, `PRINTING`, `PRINTED`, `FAILED`, `CANCELLED`.
- Do not automatically claim a job printed merely because it was sent to the printer; require an acknowledgement where supported or clearly label the status as “sent / unconfirmed”.
- Provide a printer test page and paper-out / cover-open / offline diagnostics when hardware supports them.

### Printer acceptance tests
- Correct receipt layout and Tamil/English text rendering.
- Correct paper width and line wrapping.
- USB and/or Ethernet connection stability.
- Bluetooth connection stability if used.
- Paper-out, disconnected cable, power-off and network-loss recovery.
- Retry after failure without duplicate order or duplicate bill.
- Reprint clearly marked as copy.
- KOT print does not accidentally print customer payment details.
- Test during a realistic busy period.

---

## 8. Kitchen display and KOT

- Confirmed orders create KOT tickets.
- KOT appears on the kitchen tablet/screen in real time.
- If a kitchen printer is configured, print KOT separately from the customer receipt.
- Show order number, table/order type, items, quantities, notes and elapsed waiting time.
- Sort oldest unprepared orders first.
- Large buttons: Accept / Preparing / Ready.
- Use audible/visual alert for new KOT, configurable to avoid excessive noise.
- Reprint KOT with “COPY” marking.
- KOT must not expose customer phone/email or payment details.
- If network disconnects, show connection status and recover/refresh safely without duplicating tickets.

Suggested order states:
`DRAFT → CONFIRMED → PREPARING → READY → COMPLETED`

Cancellation must be explicit and audited. Payment status is independent:
`UNPAID`, `PARTIALLY_PAID`, `PAID`, `FAILED`, `REFUNDED`.

---

## 9. Table management and customer QR

### Table management
- Admin can create/edit table numbers and optional seating capacity.
- Show Available / Occupied status.
- Occupied table links to the active order.
- Avoid two active orders on one table unless the owner enables that workflow.
- Each table has a unique QR code and printable table tent/card.

### QR purpose
The QR opens a mobile-friendly customer details and feedback page. It does **not** create an order.

### Customer form
- Name — optional.
- Phone number — optional.
- Email — optional.
- Profession — optional.
- Rating/review.
- Notes or suggestions.
- Consent checkbox for storing contact details and separately for promotional messages.
- Table identifier can be included in the QR token without exposing internal database IDs.

### Privacy and abuse protection
- Explain why information is requested.
- Do not require all personal fields to submit feedback.
- Do not expose customer details to other customers.
- Restrict access to customer data by role.
- Provide retention/deletion policy and data export process.
- Rate-limit public form submissions and use abuse protection.
- Promotional WhatsApp/email messages require appropriate consent; a feedback submission is not automatic marketing consent.

---

## 10. Menu, product images and admin price control

Admin can:
- Create categories and products.
- Upload product image.
- Set display name in Tamil and English.
- Set selling price.
- Set product availability (available / unavailable / sold out).
- Set optional description and preparation note.
- Reorder products/categories for cashier screen.
- View price change history.

Rules:
- Only authorized admin/manager can change prices.
- Cashier cannot edit price by typing over it.
- Every price change records old price, new price, user, timestamp and optional reason.
- Existing confirmed orders retain the price captured at order time.
- The server validates price and totals.
- Currency amounts stored in paise; never use floating point for financial calculations.

---

## 11. Stock and inventory — fast entry first

The owner wants common items such as eggs and chicken to be very quick to add.

### Quick stock screen
- Large common-item buttons/cards (e.g. Egg, Chicken, Rice, Onion, Oil, Tomato, Milk).
- One-tap select, enter quantity, select unit if needed, Save.
- Support units such as `pcs`, `kg`, `g`, `L`, `ml`, `packet`, `box`.
- Remember the last-used unit for each item.
- Provide quick actions: Stock In, Stock Adjustment, Stock Count, Waste.
- Show current quantity, reorder level and low-stock warning.

### Stock records
- Ingredient/item master.
- Stock movement ledger: opening, purchase/receive, adjustment, waste, count correction and (later) recipe consumption.
- Supplier and purchase details.
- Purchase cost and supplier invoice reference where available.
- Low-stock threshold configurable per item.
- Record who changed stock, when, quantity, unit and reason.

### Important accuracy rule
Do not automatically deduct chicken, eggs or other ingredients from stock just because a menu item was sold unless the owner has configured and approved a recipe/consumption mapping. Without that mapping, show stock movements that are actually recorded and label consumption estimates clearly.

### Waste management
- Record item, quantity, unit, reason, date/time, staff member and estimated cost.
- Reasons: spoilage, over-preparation, unsold food, preparation error, customer return, other.
- Waste value must use recorded cost data, not selling price unless explicitly labelled as an estimate.

---

## 12. Owner dashboard and analytics

The owner dashboard should answer: “How is the hotel performing today, when is it busiest, what sells, what is running low, and are we actually making money?”

### Top KPI cards
- Gross sales.
- Net sales after configured discounts/refunds/tax treatment.
- Number of orders.
- Average order value.
- Cash collected.
- UPI collected.
- Pending/unverified payments.
- Estimated or actual gross profit (clearly labelled based on available cost data).
- Expenses.
- Net profit/loss (only when all required cost/expense data is available).
- Low-stock count.
- Waste value.

### Rush-hour / peak-time dashboard
- Orders by hour.
- Sales by hour.
- Busiest 30-minute / 60-minute period.
- Average order preparation time, if kitchen timestamps are captured.
- Weekday vs weekend demand.
- Compare today with previous comparable days.
- Highlight peak hours and recommend staffing/preparation planning based on actual history.

### Product demand
- Top-selling products by quantity.
- Top products by sales value.
- Slow-moving products.
- Product/category mix.
- Hour-wise product demand (e.g. breakfast/lunch/evening only if business hours/categories are configured).
- Out-of-stock periods and estimated missed demand only when data supports it.

### Payment and operations
- Cash vs UPI split.
- Unpaid / partial / refunded bills.
- Order type split.
- Cancelled/voided orders.
- Cashier/shift summary.
- Cash drawer expected vs counted amount.

### Filters
- Today, yesterday, last 7 days, last 30 days and custom range.
- Compare with previous period.
- All figures must reconcile to the underlying orders, payments, refunds and expenses.

### Profit/loss correctness
Never calculate “profit” as sales minus arbitrary estimates. Distinguish:
- Sales/revenue.
- Discounts and refunds.
- Tax liabilities/collections as configured by the accountant.
- Cost of goods sold (COGS), based on actual purchase cost and configured consumption/recipe method.
- Operating expenses.
- Gross profit and net profit.

If ingredient consumption/cost mapping is not configured, show “Profit estimate unavailable — configure item costs/recipes” or show a clearly labelled partial estimate. Do not mislead the owner with fabricated profit.

---

## 13. Owner report delivery — WhatsApp and email

### Report types
- End-of-day summary.
- Weekly summary.
- Monthly summary.
- Optional low-stock alert.
- Optional unusually high waste / cancellation alert.

### Report content
- Date range.
- Sales and order count.
- Average order value.
- Cash and UPI collection.
- Best-selling products.
- Peak hour.
- Low-stock list.
- Waste summary.
- Expenses and profit/loss only where the data is complete and correctly configured.
- Link to secure dashboard/report for details.

### Delivery settings
- Owner can configure verified WhatsApp number and email.
- Choose daily / weekly / monthly schedule and preferred local delivery time.
- Show delivery status: queued, sent, delivered where provider supports it, failed.
- Retry failures safely; avoid duplicate sends.
- Keep report delivery history.
- Use WhatsApp Business Platform or an approved provider; do not use unofficial WhatsApp automation.
- Use an email provider/SMTP service with authenticated credentials.
- Store credentials securely in backend secrets, never in frontend code.
- Obtain appropriate opt-in and follow provider/template rules.

### Demo vs production
In a static HTML demo, “Send report” must be visibly simulated. Actual WhatsApp/email delivery requires backend integration, credentials, verified recipient and provider configuration.

---

## 14. Expenses and cash management

### Expenses
- Expense category.
- Amount.
- Date.
- Payment method.
- Vendor/description.
- Optional attachment/receipt.
- Created by and approved by.
- Edit/delete actions audited.

### Cash session
- Opening cash float.
- Cash sales.
- Cash refunds/paid-outs.
- Expected closing cash.
- Actual counted cash.
- Difference/shortage/overage and explanation.
- Shift close confirmation.

UPI should be reconciled against actual transaction confirmation/settlement records where available. A cashier clicking “UPI paid” is not proof of payment.

---

## 15. Reports and exports

- Daily sales report.
- Product-wise sales.
- Hourly demand / rush-hour report.
- Payment collection report.
- Order cancellation/refund report.
- Stock movement and low-stock report.
- Waste report.
- Purchase report.
- Expense report.
- Cashier/shift reconciliation.
- Profit/loss report with clear data-completeness indicators.
- CSV/PDF export with date range and generated timestamp.

---

## 16. Technology and architecture

### Phase 1 — Cloud-first production foundation

- Frontend: React + TypeScript + Vite.
- UI: Tailwind CSS and shadcn/ui, adapted to AMMAS visual language.
- State: Zustand for local UI state; TanStack Query for server state.
- Routing: React Router.
- Forms/validation: React Hook Form + Zod.
- Backend: Node.js LTS + Express + TypeScript.
- API: REST `/api/v1`; Socket.IO for live kitchen/order updates.
- Database: MongoDB Atlas + Mongoose.
- Authentication: secure sessions/refresh strategy, Argon2id password hashing, session revocation.
- Internationalization: Tamil + English.
- PWA/responsive app experience for web/tablet/mobile.
- File storage: object storage for product photos and report attachments.
- Reports: server-side generation and scheduled jobs.
- Observability: structured logs, error monitoring and audit events.
- Tests: unit, integration and Playwright end-to-end tests.

### Printer connectivity
Use a local print bridge/agent when direct browser printing is unreliable. The bridge runs on the cashier computer or a dedicated local device and communicates with the printer over the confirmed USB/Ethernet/Bluetooth method. The cloud app should submit a print job through an authenticated, restricted channel; do not expose arbitrary printer/network access to the public internet.

### Future Phase 2 — optional local server
If the owner later requires the POS to continue fully during internet failure:
- Add a dedicated always-on local mini PC/server (not the cashier's everyday workstation).
- Local API and local database (SQLite is a candidate).
- Local print bridge.
- Durable outbox/inbox sync with cloud.
- Explicit sync status and conflict handling.
- Secure remote access through the cloud, not direct public exposure of the local database.

Do not promise full offline POS in the cloud-only phase. Browser caching can support limited safe reads, but order creation/payment/printing offline needs a local server design and testing.

---

## 17. Suggested project structure

```text
ammas-coimbatore/
  apps/
    web/                  # React web, tablet and mobile responsive UI
    cloud-server/         # Node + Express API and background jobs
    print-bridge/         # Local Windows print agent
    local-server/         # Optional future local POS server
  packages/
    shared-types/
    validation/
    business-rules/
    translations/
    api-contracts/
  infrastructure/
    docker/
    deployment/
    backup/
  docs/
    product/
    architecture/
    database/
    api/
    security/
    operations/
```

Use a modular monolith first. Do not introduce microservices for a single-branch restaurant without a demonstrated need.

---

## 18. Core data entities

- `users`, `roles`, `permissions`, `role_permissions`, `user_permission_overrides`, `sessions`
- `categories`, `products`, `product_images`, `product_price_history`, `product_availability`
- `tables`, `table_qr_tokens`
- `orders`, `order_items`, `order_events`
- `payments`, `refunds`
- `kot_tickets`, `print_jobs`, `printers`, `printer_events`
- `ingredients`, `stock_movements`, `stock_counts`, `waste_records`
- `suppliers`, `purchase_orders`, `purchase_items`
- `expenses`, `cash_sessions`, `cash_movements`
- `customers`, `feedback`, `customer_consent`
- `report_jobs`, `report_deliveries`
- `audit_logs`, `device_registry`
- Future local sync: `sync_outbox`, `sync_inbox`, `sync_checkpoints`

Every order item stores a snapshot of product name, unit price and quantity at the time of sale. Keep a stable unique ID across systems.

---

## 19. API domains (initial proposal)

Base path: `/api/v1`

- Auth: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/devices`
- Users/RBAC: `/users`, `/roles`, `/permissions`, `/users/:id/overrides`
- Menu: `/categories`, `/products`, `/products/:id/price`, `/products/:id/availability`, `/products/:id/image`
- POS: `/orders`, `/orders/:id`, `/orders/:id/confirm`, `/orders/:id/cancel`, `/orders/:id/payments`, `/orders/:id/refunds`
- Kitchen: `/kitchen/tickets`, `/kitchen/tickets/:id/status`
- Tables/QR: `/tables`, `/tables/:id/qr`, `/public/feedback`
- Inventory: `/ingredients`, `/stock/receive`, `/stock/adjust`, `/stock/movements`, `/stock/low-stock`, `/waste`
- Purchases: `/suppliers`, `/purchases`, `/purchases/:id/receive`
- Finance: `/expenses`, `/cash-sessions`, `/cash-sessions/:id/close`
- Reports: `/reports/sales`, `/reports/peak-hours`, `/reports/products`, `/reports/payments`, `/reports/profit-loss`, `/reports/stock`
- Printing: `/printers`, `/printers/test`, `/print-jobs`, `/print-jobs/:id/retry`
- Delivery: `/report-settings`, `/report-jobs`, `/report-deliveries`

These are proposed contracts, not claims that endpoints already exist.

---

## 20. Reliability, security and data integrity

- Store money in integer paise.
- Use server-side price and total calculation.
- Use idempotency keys for order creation, payment recording, refunds and print retries.
- Separate order status, payment status and print status.
- Use audit logs for sensitive operations.
- Apply role checks on every protected backend route.
- Hash passwords with Argon2id; use secure cookies/session controls and CSRF protection where applicable.
- Rate-limit login and public feedback endpoints.
- Validate all API input with schemas.
- Protect customer personal information; collect only what is needed.
- Keep secrets out of source control and frontend bundles.
- Encrypt backups and test restoration.
- Use database indexes for date/time, order number, status and product lookups.
- Do not silently discard failed report, print or sync jobs.
- Provide a clear backup/recovery and incident procedure.

---

## 21. Development phases and acceptance criteria

### Phase 0 — Confirm and foundation
- Confirm workflow, printer test plan, tax settings and menu data.
- Create monorepo, shared types, linting, formatting, environment validation and health checks.
- Document local setup, deployment and backup approach.

### Phase 1 — UX and POS foundation
- Implement responsive login shell and Tamil/English.
- Build product/category management and product photo upload.
- Build fast cashier POS with dine-in/takeaway.
- Verify totals and order creation.

**Acceptance:** a cashier can create a normal order quickly on desktop and tablet without needing a training manual; no duplicate order on repeated click.

### Phase 2 — Billing and printer recovery
- Bill preview, print job queue and print bridge.
- Test BluPrints printer using confirmed interface/driver.
- Implement retry, pending queue, duplicate marking and manual fallback.

**Acceptance:** unplugging/powering off printer does not lose the order; cashier can continue; retry does not create a duplicate bill.

### Phase 3 — Kitchen
- Live KOT screen and separate KOT printing.
- Kitchen status updates.

**Acceptance:** confirmed order appears once on kitchen screen; status change is visible to cashier; KOT contains no payment/private customer details.

### Phase 4 — Stock, purchases and waste
- Quick stock entry for eggs, chicken and other common items.
- Suppliers, purchase receiving, stock ledger and waste records.

**Acceptance:** every stock change has quantity, unit, user, timestamp and reason; no invented recipe deductions.

### Phase 5 — Owner dashboard and finance
- Sales, hourly demand, best sellers, payment split, expenses and cash reconciliation.
- Profit/loss only when cost/tax data is sufficient.

**Acceptance:** dashboard figures reconcile to source transactions; incomplete profit data is clearly labelled.

### Phase 6 — Customer QR and feedback
- Table-specific QR, mobile feedback page, optional customer details and consent.

**Acceptance:** QR captures feedback without creating an order; optional fields remain optional; customer data is permission-protected.

### Phase 7 — WhatsApp and email reports
- Owner recipient verification, schedule settings, report generation and delivery logs.

**Acceptance:** report is generated from real database data; failure is visible and retryable; no duplicate report delivery on retry where provider idempotency allows.

### Phase 8 — Security, performance and go-live
- Full role testing, backup restore, load test, device compatibility, Tamil rendering and staff training.
- Go-live checklist and rollback plan.

---

## 22. Essential test scenarios

1. Rapid repeated taps on one product.
2. Two cashiers creating orders at the same time.
3. Product price changed while another order is open.
4. Product becomes sold out.
5. Dine-in order without table selection.
6. Cash payment and verified UPI payment.
7. UPI payment not received / unverified.
8. Printer power off before bill print.
9. Printer cable/network disconnected during print.
10. Retry same print job; confirm no duplicate sale.
11. Reprint bill; ensure “COPY” marking.
12. KOT screen disconnect/reconnect.
13. Kitchen marks ready while cashier screen is open.
14. Stock quick-add with different units.
15. Waste entry and stock correction audit.
16. Staff attempts unauthorized price change/refund.
17. QR form with optional fields blank.
18. Customer declines marketing consent.
19. WhatsApp/email report delivery failure and retry.
20. End-of-day sales, payment and cash reconciliation.
21. Backup restoration to a clean environment.
22. Tablet portrait/landscape, desktop and mobile usability.
23. Tamil menu labels and receipt rendering.
24. Internet loss in cloud-only mode; verify honest offline messaging and no false success.

---

## 23. Go-live checklist

- [ ] Actual menu, categories, prices and product photos approved.
- [ ] Taxes/invoice rules reviewed by the business/accountant.
- [ ] Printer interface, driver, paper width and command support verified.
- [ ] Customer receipt and kitchen ticket tested physically.
- [ ] Printer failure fallback trained with cashier.
- [ ] Cash and UPI procedures tested.
- [ ] Owner WhatsApp/email recipients verified.
- [ ] Report schedule approved.
- [ ] Customer privacy notice and consent wording approved.
- [ ] Staff accounts and permissions configured.
- [ ] Backup and restore tested.
- [ ] Owner and staff trained in Tamil/English.
- [ ] Pilot run completed before full cutover.

---

## 24. Product principles — never compromise

1. **Do not lose an order because a printer fails.**
2. **Do not create a second sale when retrying a print.**
3. **Do not mark UPI paid without verification.**
4. **Do not show estimated profit as actual profit.**
5. **Do not force customer personal details for a normal walk-in order.**
6. **Do not make QR a self-ordering system in the initial scope.**
7. **Do not allow cashiers to change prices without permission.**
8. **Do not deduct ingredients without configured consumption rules.**
9. **Do not claim full offline POS until a local server is implemented and tested.**
10. **Make the cashier workflow simple, fast, readable and forgiving.**

