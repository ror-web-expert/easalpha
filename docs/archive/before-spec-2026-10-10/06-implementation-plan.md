# Servio: Implementation Plan

Date: 8 Oct 2026. Sources: the build blueprint roadmap, the Servio Feature Specification v1, and `01-features.md`.

Phase 1 ships a sellable core POS in 10 two-week sprints, 20 weeks, with a 16-week target if two tracks overlap well. Three pilot restaurants go live in sprint 9 and the gate to Phase 2 is two clean weeks of real trading.

---

## 1. Before sprint 1

- [ ] Set the 7 decisions in the specification (stock timing, payment accounts, khata in Core, staff meals, kitchen device, accounting scope, forecast phase). The plan below assumes the recommendations.
- [ ] Decide the Android till build: Tauri 2 mobile sharing the desktop code (recommended) or a separate app later.
- [ ] Name the 3 pilot restaurants and get their menu, staff list and a printer model each.
- [ ] Apply for FBR and PRA POS-provider integration and Meta Business verification now. Both take weeks and sit on the critical path.
- [ ] Register the company, open a bank account, file the Servio trademark.

## 2. Team and tracks

| Role | Owns | Repositories |
|---|---|---|
| Backend developer | Rails API, tenancy, jobs, sync, tax, WhatsApp, billing, super admin | `servio-api` |
| Frontend developer | Next.js admin panel, till screens, kitchen display, customer site | `servio-web` |
| Full-stack or desktop developer | Tauri till, local SQLite, sync queue, printing, print bridge; rider app in Phase 2 | `servio-pos-desktop`, `servio-print-bridge`, `servio-mobile` |
| Designer, part time | Design system in `07-design-system.md`, till and admin screens, receipts, Urdu layout | Figma |
| QA and pilot owner, part time | Test plans, staging checks, pilot onboarding, help articles | |

Two tracks run in parallel from sprint 2: the **API and admin** track and the **till** track. They meet on the OpenAPI spec, which is written first and generated into TypeScript types.

## 3. Week 0: foundations

1. Create the five repositories with CI (lint, tests, security scan) and branch protection.
2. Docker Compose for local: PostgreSQL 16, Rails 8 API, Next.js, mailcatcher, a fake WhatsApp endpoint.
3. Staging on Heroku or a single Kamal host; production on AWS Bahrain prepared but empty.
4. Rails API skeleton: UUID primary keys, `business_id` on every table, acts_as_tenant, Row-Level Security policies, Pundit, Rack::Attack, audit log, Solid Queue, Action Cable, rswag.
5. The tenant isolation test harness: a request spec helper that replays every endpoint as another business and expects 404 or 403.
6. OpenAPI v1 skeleton with auth, businesses, menus, orders, payments, shifts, sync; TypeScript types generated into `servio-web`.
7. Design tokens from `07-design-system.md` as CSS variables and a Tailwind config in `servio-web`; shadcn/ui installed.
8. Tauri 2 project with SQLCipher, a hello-world sync queue and ESC/POS test print on one printer model.
9. Seed data: one sample restaurant with 30 items, 6 categories, 2 deals, 10 tables, 3 staff.
10. Sentry, uptime check, public status page.

## 4. Phase 1 sprint plan

| Sprint | Weeks | Goal | API and admin track | Till track | Done when |
|---|---|---|---|---|---|
| 1 | 1 to 2 | Tenancy and login | Businesses, branches, users, memberships, roles, permissions, devices; WhatsApp OTP and email login; device pairing with one-time code; audit log; super admin list | Pair device, PIN screen, local DB schema, connection badge | A user signs up, pairs a till, logs in with a PIN; isolation suite green |
| 2 | 3 to 4 | Menu | Menus, categories, products, variants, modifier groups, deals, promotions with unit limits, prices by order type, allergen tags, import from CSV and ArfaPOS JSON, photos to S3 | Menu sync to the till; category grid and item grid render from local data | A menu imported from the ArfaPOS JSON shows on the till within one sync |
| 3 | 5 to 6 | Orders and kitchen | Order life cycle, order items with snapshots, status events, daily serial per branch and business day, stations, Action Cable to kitchen, KOT print jobs, change and cancel tickets | New order, modifiers, notes, hold and recall, order type switch, send to kitchen, kitchen display page, token screen | 20 orders offline then online sync with no duplicates; kitchen screen updates in under 2 seconds |
| 4 | 7 to 8 | Tables and customers | Floors, tables, merge and move, waiter assignment, service charge; customers by phone, groups, addresses, the walk-in record; repeat last order | Floor plan, table picker, customer lookup, repeat order | Dine-in order from table to kitchen with a waiter on a tablet |
| 5 | 9 to 10 | Payments and receipts | Payment methods, payment accounts auto-linked, account entries, khata orders and balance, split, rounding, tips, Raast QR, card terminal link, receipt designer, WhatsApp digital receipt | Payment screen, receipt print, reprint marked DUPLICATE, cash drawer kick, Urdu receipt as image | An order is paid three ways and printed on 58 mm and 80 mm |
| 6 | 11 to 12 | Shifts, cash and control | Shifts, cash movements, blind close, over or short, Z report, drawer account per cashier, forced close at day end, day close and day lock, voids with reason and PIN, refunds, price override, open item, staff meals, discount limits, manager approval with both names | Shift open and close, cash in and out, void and refund dialogs, PIN approval dialog | A full day: open, sell, void, refund, close, Z report, day lock; every action in the audit log |
| 7 | 13 to 14 | Tax, offline hardening, khata | FBR and PRA invoice sync with queue and retries; tax rates per item and category; customer ledger, unpaid orders, AR aging, customer payments, pay to customer, WhatsApp balance message; sync conflict rules; needs-attention list | Pending-tax receipt and reprint with QR; needs-attention screen; 24-hour offline capacity test; auto-update outside open shifts | The 8 offline test scenarios pass; a tax invoice prints with a real sandbox QR |
| 8 | 15 to 16 | Reports, staff, settings | Dashboard, business overview, sales, items, hours, cashiers, cashier till, voids and modified orders, discounts, sales calendar, category and order taker reports; staff add with WhatsApp invite, Manage Access, sessions, deactivate; settings pages; receipt designer; one formatter for money, dates, phones | Reports for this till; settings for printers and stations; dark mode and high contrast | An owner understands the day in under a minute on a phone |
| 9 | 17 to 18 | Billing, onboarding, pilots | Plans, 90-day trial, invoices, Paddle, JazzCash and EasyPaisa confirmation, grace period, read-only mode, plan limits; signup and onboarding checklist that flags features switched off; setup tour and notification center; WhatsApp alerts and daily summary; Urdu translations complete | Installer signed for Windows and Mac; Android tablet build; print bridge | 3 pilot restaurants installed and trading |
| 10 | 19 to 20 | Pilot hardening | Fix what the pilots find; performance against the targets; Playwright end-to-end suite; help center articles and videos; data export; penetration checklist | Fix what the pilots find; 1366, 1024 and 390 px pass on every screen | Gate: 3 pilots live for 2 weeks with no data loss and no manual fixes |

Sprint demos on staging every second Friday with one pilot owner present from sprint 5.

## 5. Working agreements

- Pull requests under 400 lines, reviewed within one working day, merged to main behind a feature flag when unfinished.
- The definition of done in `02-technology.md` applies to every ticket: three screen sizes, English and Urdu strings, server-side permissions, isolation test, audit log, tests in CI, tested on staging by someone else, help text updated.
- Database migrations are backward compatible for one release so tills on the old API version keep working.
- Every money or stock rule in `01-features.md` section 11 has a named test; a rule without a test is not implemented.
- Production deploys by tag between 3 pm and 5 pm Pakistan time; never on a Friday evening.

## 6. Pilot launch

1. Import the pilot's menu from the ArfaPOS JSON export and stock items from the Items export; preview with an error list before saving.
2. Install the till, pair it, test the printer and cash drawer, print a test receipt in English and Urdu.
3. Add staff and send WhatsApp invites; cashiers get PINs, the manager gets an admin login.
4. Run one parallel day: the pilot sells on both systems; compare the Z report line by line.
5. Switch over on a quiet weekday morning; a developer is reachable on WhatsApp for the first three days.
6. Daily check for two weeks: sync queue empty, no needs-attention records, Z report matches cash, tax queue empty.

## 7. Phase 2 and Phase 3 in outline

Phase 2, about 8 weeks: stock items and sections, stock documents and ledger, recipes and sub-recipes, food cost, purchasing and suppliers with returns, expenses and overheads, delivery zones, rider app and rider cash float, online ordering site and QR table ordering, customer queue display, scheduled reports, usage forecast with a budget cap. Gate: 10 paying clients and stock reports trusted.

Phase 3, about 8 weeks: Foodpanda, loyalty and campaigns, reservations, payroll and attendance with leave and holidays, finance ledger with reconciliation, accounting export, multi-branch and central kitchen, branded customer app, local offline hub. Gate: first chain client with 3 or more branches.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| FBR and PRA approval arrives late | Tax feature cannot go live for pilots | Apply in week 0; build against the sandbox; pilots can trade without tax sync and backfill the queue |
| Meta Business verification delayed | No WhatsApp OTP or receipts | SMS and email fallback are built in; verification started in week 0 |
| Printer models that do not follow ESC/POS | Receipts fail at a pilot | Test the three pilots' exact printer models in week 0; keep a supported-printer list |
| Offline sync bugs lose or duplicate sales | Loss of trust at pilots | Idempotent UUIDs, the 8 test scenarios in CI, parallel day before switch-over |
| Scope creep from the 160-feature list | Phase 1 slips | Only Core rows marked Yes are in Phase 1; everything else needs a decision to move |
| Two developers instead of three | 20 weeks becomes 26 | Drop the Android tablet build and the customer display from Phase 1 first |

## 9. First week, in order

1. Set the 7 decisions and sign the specification.
2. Create repositories and CI; agree the branch and review rules.
3. Write the OpenAPI v1 skeleton and generate types.
4. Apply for FBR and PRA sandbox access and Meta verification.
5. Buy one of each pilot printer model and a cash drawer; test ESC/POS from Tauri.
6. Designer delivers the till new-order screen and the admin shell from `07-design-system.md`.
7. Backend lands tenancy, RLS and the isolation test harness.
8. Seed data script and a demo business on staging.
