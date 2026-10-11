# EasAlpha: Technology and Architecture

Date: 8 Oct 2026. Source: the build blueprint, with additions from the ArfaPOS audit.

> **10 Oct 2026: `SPEC.md` is the requirement.** Where this file differs from `SPEC.md`, `SPEC.md` wins. The differences are listed in `PDF-ALIGNMENT.md`; the extras in this file stay. The text before this change is kept in `archive/before-spec-2026-10-10/`.


One Rails API serves every screen: the desktop till, the kitchen display, the admin panel, the online ordering site, the rider app and the super admin. Background jobs talk to outside services. The till keeps selling when the internet is down and syncs when it returns.

---

## 1. System architecture

```
 EasAlpha POS        Kitchen screen     Admin panel        Online and QR      Rider app
 Web, IndexedDB    By station         Next.js web        Website, QR menu   Deliveries, map
 Works offline     Live updates       Owner, manager     Customer app       Cash collected
      |                 |                  |                  |                  |
      +-----------------+------------------+------------------+------------------+
                                           |
                                      Rails API
                 Auth, roles and PINs - Orders - Menu - Stock ledger - Cash drawer - Reports
                 Action Cable pushes live orders to till, kitchen and admin
                                           |
            +------------------------------+------------------------------+
            |                              |                              |
       PostgreSQL 16              Solid Queue jobs                   S3 storage
  Orders, stock, ledger      Tax sync, stock jobs, reports,      Menu photos, receipts
  business_id on every row   WhatsApp jobs                        Daily backups
                                           |
                 +--------------+----------+-----------+------------------+
                 |              |                      |                  |
            FBR / PRA tax    Foodpanda             Payments          WhatsApp / SMS
```

5 apps, 1 API, 3 data stores, 4 outside services.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend API | Ruby on Rails 8, API mode | Fast to build; mature auth, jobs and WebSockets |
| Admin panel | Next.js, Tailwind, shadcn/ui | Modern, fast, easy to hire for |
| Till and kitchen | Installable web app at `/pos` with the catalog in IndexedDB and an offline queue (SPEC); kitchen display in the browser on a websocket | Keeps selling through load-shedding and internet cuts |
| Rider, order-taker tablet and customer apps | Technology open: SPEC names these apps but not their tools (`PDF-ALIGNMENT.md` question 2). Recommended: installable pages in the web app; React Native (Expo) stays an option | One codebase with the POS |
| Database | PostgreSQL 16, business_id on every table, Row-Level Security | One database for all restaurants, hard isolation |
| Background jobs | Solid Queue (built into Rails 8); Sidekiq and Redis later if load grows | Tax sync retries, stock jobs, scheduled reports, WhatsApp |
| Real-time | Action Cable | New orders reach the kitchen in under 2 seconds |
| Validation and tests | Zod for forms; RSpec and FactoryBot request specs for every endpoint (happy path, permission denial, one edge case); Vitest and Testing Library for screens; Playwright end to end (SPEC) | Nothing is called done until it is tested |
| Printing | ESC/POS; printers set up on the desktop POS behind the PRINTERS permission; tablets print through the desktop's IP stored as the print server (SPEC). How the web app reaches the printer is open: SPEC question 3 asks whether installed software is needed for printer access | 58 mm and 80 mm thermal printers |
| Storage | S3 under a per-business prefix, versioned, short-lived signed links | Menu photos, receipt images, exports |
| Hosting | AWS Bahrain (me-south-1) with Kamal 2; Heroku for the pilot | Closest region to Pakistan and the Gulf |
| Monitoring | Sentry for errors; uptime alerts to WhatsApp or Slack; public status page | Catch till and API errors early |
| Secrets | AWS Secrets Manager or Rails credentials | Never in the repository |

---

## 3. Repositories

| Repository | Contents |
|---|---|
| `easalpha-api` | Rails API, background jobs, super admin |
| `easalpha-web` | Next.js admin panel, kitchen display, online ordering pages, shared till screens (one monorepo with shared UI components) |
| `easalpha-pos-desktop` | Tauri desktop till with local SQLite and the sync queue (not needed: the POS is a web app per SPEC) |
| `easalpha-mobile` | Rider app and branded customer app, only if native builds are chosen (`PDF-ALIGNMENT.md` question 2) |
| `easalpha-print-bridge` | Printing helper for Android tablets and kitchen printers (replaced by the SPEC print server) |

Separate repositories per app, small pull requests, nothing reaches customers without passing tests on staging.

On 10 Oct 2026 the code lives in two folders, `easalpha-api` and `easalpha-web`, beside `docs`. The desktop, mobile and print-bridge repositories are not needed while the POS is a web app.

---

## 4. Environments

| Environment | Purpose | Data |
|---|---|---|
| Local | Developer machines, Docker Compose | Seed data |
| Staging | Testing and client demos | Fake businesses, copy of a real menu structure |
| Production | Live customers | Real data, backups on |

---

## 5. API rules

- **Versioning**: all endpoints under `/api/v1/`. Breaking changes go to `/api/v2/`; old versions stay live until every till has updated.
- **Format**: JSON, snake_case, money as integers in the smallest unit with a `currency` field, times in ISO 8601 UTC.
- **Errors**: one shape everywhere, `{"error": {"code": "orders.already_paid", "message": "...", "details": {}}}` with the right HTTP status (400, 401, 403, 404, 409, 422, 429).
- **Pagination**: cursor based, `?cursor=...&limit=50`, max 200.
- **Idempotency**: every create from a till or app sends an `Idempotency-Key` equal to the record's UUID; repeats return the first result.
- **Auth**: short-lived access token plus refresh token; device tokens for POS devices; tokens carry user, business, branch, app and the granted permission codes (SPEC).
- **Permission check on every request**: user active, member of this business, allowed at this branch, has this permission (read from the token, so a change applies at the next sign-in per SPEC), using an allowed app.
- **Documentation**: OpenAPI generated from request specs (rswag); TypeScript types generated from it for web and apps.
- **Rate limits**: per user and per device; public ordering endpoints stricter (Rack::Attack).
- **Webhooks** (Phase 3): signed with a secret, retried with backoff, for order created, order paid, stock low.

---

## 6. Data model

About 110 tables: the 70 core tables, the 22 additions in `01-features.md` and the SPEC additions in `08-database-schema.md` section 13. All except the platform group carry `business_id`; branch-level ones also carry `branch_id`.

| Group | Tables |
|---|---|
| Platform | businesses, branches, users, memberships, devices, plans, subscriptions, invoices, payments_received, feature_flags |
| Menu | menus, categories, products, product_variants, modifier_groups, modifiers, deals, deal_items, promotions, price_overrides, product_prices |
| Dine-in | floors, tables, reservations, table_requests |
| Orders | orders, order_items, order_item_modifiers, order_status_events, payments, refunds, voids, discounts_applied, delivery_status_events |
| Money | shifts, cash_movements, payment_accounts, account_entries, tax_rates, tax_invoices, expenses, expense_categories, customer_payments, supplier_payments |
| Stock | stock_items, units, unit_conversions, stock_sections, stock_levels, stock_ledger_entries, stock_documents, recipes, recipe_lines, production_batches, inventory_settings, demand_rules, deduction_audits |
| Purchasing | suppliers, purchase_orders, purchase_order_lines, goods_receipts, purchase_returns, purchase_return_lines |
| People | customers, customer_groups, customer_addresses, loyalty_transactions, riders, deliveries, rider_cash_movements, employees, departments, salary_components, attendance, leave_requests, holidays, attendance_rules, payroll_runs, payslips, advances |
| System | audit_logs, whatsapp_messages, whatsapp_templates, notifications, import_jobs, sync_batches, setup_checklist_items |

Rules every developer follows:

1. Money as integers in the smallest unit (paisa, cents). Never floats.
2. Quantities in the item's base unit at full decimal precision, converted only at the edges (SPEC).
3. Time stored in UTC, shown in the branch time zone.
4. Business day: each branch has a start and end time, default 06:01 to 02:01 (SPEC). An order at 1:30 am belongs to the previous business day in every report.
5. Order numbers: a short daily serial per branch plus a UUID. Tax invoice numbers come from FBR or PRA.
6. Nothing financial is deleted. Void or reverse. Archive menu items and staff.
7. Price snapshots on order items: name, price, tax, recipe cost at the time of sale.
8. Offline IDs: records created on a till get a UUID on the device; the server accepts each UUID once.
9. Audit log row for every create, update, void, refund, discount, price change, permission change and login, with user, device and before and after values.
10. Soft limits from the plan (branches, devices, staff, messages) are checked on the server.
11. One formatter for money, dates and phone numbers, used by every app. Phones stored in international format (+92...).
12. Sale deductions are unique on (source, item), so the safety-net job can re-run without deducting twice (SPEC).
13. Settings live in a typed key-value table per branch with seeded defaults and a version number the POS compares to know when to re-sync (SPEC).
14. Permissions are granted per user and carried in the access token, so a change applies at the next sign-in (SPEC).

---

## 7. Tenant isolation

1. Every business-owned table has a `business_id` column, not null, indexed.
2. After login the server sets the current business from the user's membership, never from a URL or form field.
3. All queries are scoped automatically (acts_as_tenant). Unscoped queries are blocked outside super admin code.
4. PostgreSQL Row-Level Security is the second wall.
5. Branch-level access is checked: a cashier of branch A cannot see branch B.
6. IDs in URLs are UUIDs.
7. Files are stored under the business folder and served by short-lived signed links.
8. An automated test suite tries to read and write another business's data on every endpoint and must fail every time.
9. Super admin opens a business only for support, with the owner's approval, and every action is logged.

Domains: `easalpha.com` for marketing; `app.easalpha.com` for staff; `easalpha.com/store/<slug>` for customer ordering; `order.<restaurant>.com` custom domain on the Business plan; `admin.easalpha.com` for super admin with 2FA and an office IP allowlist.

---

## 8. Security, backups, performance

Security:

- HTTPS everywhere; passwords hashed with bcrypt; PINs hashed and locked after 5 wrong tries.
- Rate limits on login, OTP and public ordering endpoints.
- Role checks on every API endpoint (Pundit) plus the tenant rules above.
- Payment card data never touches EasAlpha servers (Paddle and card terminals).
- Dependency and security scans in CI: Brakeman, bundler-audit, npm audit.
- Yearly external penetration test once there are paying international customers.
- Local till database encrypted; synced orders older than 7 days cleared from the device.

Backups and data ownership:

- Daily database backups kept 30 days, point-in-time recovery for 7 days, restore tested monthly.
- Uploaded files versioned in S3.
- Owners can export all their data as CSV or Excel at any time.
- On account deletion, data removed within 30 days except invoices kept as tax law requires.
- Customer data used only by that restaurant; Pakistan data protection rules and GDPR for UK and EU customers.

Targets:

| Target | Value |
|---|---|
| Add item on till | under 100 ms, local |
| Payment and receipt print | under 2 seconds |
| Order reaching kitchen display | under 2 seconds online |
| Admin page load | under 2 seconds on 4G |
| Offline operation | at least 24 hours of orders stored on the till |
| Uptime | 99.9% per month, on a public status page |
| Year 1 scale | 1,000 businesses, 2 million orders per month |

---

## 9. Integrations

| Service | Use | Notes |
|---|---|---|
| FBR and PRA (also SRB, KPRA, BRA) | Real-time sales tax invoice sync; invoice number and QR on receipt | Per-branch registration; offline queue with retries in Solid Queue; integration approval needed before launch |
| WhatsApp Business Platform (Meta Cloud API) | OTP, receipts, order status, daily summary, alerts, trial reminders, campaigns | Pre-approved templates in English and Urdu stored with approval status; delivery and read status by webhook; opt-in and STOP; monthly counter per business; SMS and email fallback. Shared EasAlpha number on Starter and Pro; own number through Meta Embedded Signup on Business |
| Paddle | International subscription billing as merchant of record | Cards, global tax, payouts to Pakistan |
| JazzCash, EasyPaisa, bank transfer | Pakistan subscription billing and customer payments | Monthly invoice with manual or automatic confirmation; 7-day grace then read-only |
| Raast QR | Customer pays from any bank app | QR on screen or receipt |
| Card terminals | Amount sent to the bank machine | No card data on EasAlpha servers |
| Foodpanda and other aggregators (Phase 3) | Orders pulled into the same order list with commission tracking | |
| QuickBooks and Xero (Phase 3) | Accounting export | |
| ZKTeco fingerprint devices (Phase 3) | Attendance | |

---

## 10. Localization and hardware

Localization:

- English and Urdu at launch, Urdu right-to-left tested; Arabic later. All screen text in translation files.
- Currency per business; formats per locale (Rs 1,487,366 / AED 1,250.00 / £12.50).
- Tax engine per country: Pakistan FBR and provincial, UAE VAT, UK VAT. Rate, inclusive or exclusive, and invoice rules are settings.
- Payment methods per country.
- Time zone and business-day window per branch.
- Fonts: Roboto for English (Material Design 3, chosen 10 Oct 2026), Noto Nastaliq Urdu for Urdu receipts and labels.

Hardware:

| Device | Support |
|---|---|
| Till | EasAlpha POS web app at `/pos` on a Windows or Mac PC; Android tablet 10 inch and up; iPad |
| Kitchen display | Any Android TV box or tablet in browser kiosk mode |
| Receipt printers | 58 mm and 80 mm ESC/POS thermal, USB or network; Urdu printed as image |
| Kitchen printers | One per station, network; prints KOT when the kitchen display is off |
| Cash drawer | Opens through the receipt printer port |
| Barcode scanner | USB keyboard mode |
| Customer display | Second screen showing order and total (Phase 2) |
| Fingerprint device | Common ZKTeco models (Phase 3) |

---

## 11. Development process

Testing:

- Unit and request tests for every API endpoint (RSpec); the tenant isolation test runs on all of them.
- Money and stock logic covered by fixed examples: an order, a void, a refund, a shift close.
- End-to-end tests for signup, take order, pay, print, void, close shift (Playwright).
- Offline test: disconnect the till, take 20 orders, reconnect, confirm no duplicates and correct stock.

CI and CD:

- GitHub Actions: lint, tests, security scan on every pull request.
- Merge to main deploys to staging automatically; production deploy by tag during low-traffic hours (3 pm to 5 pm Pakistan time).
- Database migrations backward compatible; feature flags for unfinished features.
- Errors to Sentry; logs and uptime alerts to the team's WhatsApp or Slack.

Definition of done for every feature:

- [ ] Works on a 1366 px laptop, a 10-inch tablet and a phone
- [ ] English and Urdu text in translation files
- [ ] Permissions checked on the server
- [ ] Tenant isolation test passes
- [ ] Audit log written for money, stock and permission changes
- [ ] Tests written and passing in CI
- [ ] Tested on staging by someone other than the developer
- [ ] Help text or help article updated

---

## 12. Build roadmap

From 10 Oct 2026 the build follows the 7 phases in `SPEC.md`. Each phase ends with a gate that must pass before the next starts.

| Phase | Contents | Gate |
|---|---|---|
| 1 Foundation | Outlets (branches), users and the staff types, the 58 permissions and 3 presets, the access token, the settings store, the business-day helper, the admin shell with the PDF sidebar | Login and permissions |
| 2 Catalog | Menus with online visibility, categories with sort order, the three-tab product form, variants, favourites, deals, promotions, quick add, images, JSON import and menu export | Menu renders in the POS |
| 3 Orders and POS | Idempotent orders, the three order types and five sources, the status machine, charges and discounts, payments against accounts, the order story, reopen with PIN, tables, the kitchen display, the offline POS | First order paid |
| 4 Inventory | Items, sections, units, display units, variant recipes, order-type consumables, prep recipes, the stock document register, the movement ledger, the deduction job, the safety net, Deduction Health, day lock, Demand | Stock deducts on sale |
| 5 Purchasing and money | Suppliers, purchase orders, supplier ledger and aging, purchase price history, customers with khata and AR aging, payment accounts, expenses, the chart of accounts with journal vouchers, trial balance and balance sheet | Supplier ledger ties out |
| 6 People and time | Cashier sessions and Day-End Settlement, order takers, permanent and temporary riders, the rider vault, employees, the fingerprint kiosk, the attendance rules engine, payroll runs with advances | Payroll run matches |
| 7 Reports, customers, AI | The 27 reports with filters and CSV and PDF export, loyalty, regular discounts, vouchers, reviews, WhatsApp account messages, the storefront, audit logs, AI pricing and AI stock forecast | Grand report ties out |

EasAlpha extras (signup, billing, super admin, Foodpanda, reservations, multi-branch, Urdu) are built inside the nearest phase.

Team estimate: 2 to 3 developers.
