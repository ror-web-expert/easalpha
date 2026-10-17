# EasAlpha: All Features

Date: 8 Oct 2026. Sources: "Restaurant POS Product Overview and Build Blueprint" (7 Oct 2026), the ArfaPOS audit of 64 admin screenshots, and "EasAlpha Feature Specification v1".

> **10 Oct 2026: `SPEC.md` is the requirement.** Where this file differs from `SPEC.md`, `SPEC.md` wins. The differences are listed in `PDF-ALIGNMENT.md`; the extras in this file stay. The text before this change is kept in `archive/before-spec-2026-10-10/`.


This file lists every feature EasAlpha will have, by module. Each row gives where the feature comes from (Blueprint, ArfaPOS, or Both), its phase, and its current include status.

Phases: **Core** ships first (about 16 to 20 weeks), then **Phase 2** stock, **Phase 3** growth, **Phase 4** AI. From 10 Oct 2026 the build follows the 7 phases in `SPEC.md` (see `02-technology.md` section 12 and `PDF-ALIGNMENT.md` section 8, Testing); the Phase column below is kept for reference.

Include values: **Yes** build in the phase shown; **Later** a later phase. (No and Decide no longer occur: `SPEC.md` settled them on 10 Oct 2026.)

---

## 1. Decisions, settled by SPEC.md on 10 Oct 2026

| # | Question | Final answer (SPEC.md) | Earlier recommendation |
|---|---|---|---|
| 1 | When is stock deducted? | Once, when the order is completed, with a safety-net job for lost deductions | At Placed |
| 2 | Payment accounts in Phase 1? | Accounts from day one; every payment method is a finance account | Same |
| 3 | Customer khata and aging: Core or Phase 2? | Core: Customer Account, Customer Ledger and AR Aging are SPEC screens | Same |
| 4 | Staff meals? | Complimentary order with its own permission; the reason, approver and monthly report stay as extras | Order type with reason and approver |
| 5 | Kitchen display? | A staff login that holds only the KDS permission; a paired station device stays possible as an extra | Paired device |
| 6 | Accounting? | Full double entry: chart of accounts, journal voucher, fixed assets, liabilities, equity, trial balance, balance sheet; P&L and exports stay as extras | P&L and QuickBooks or Xero export |
| 7 | Stock forecast? | AI Stock Forecast in SPEC phase 7; the usage forecast with a budget cap stays as an extra | Usage-based in Phase 2, AI in Phase 4 |

---

## 2. Modules and phases

| Group | Module | Phase | What the ArfaPOS audit adds |
|---|---|---|---|
| Selling | Till | Core | Staff meals as an order type (decision 4). |
| Selling | Kitchen Display and KOT | Core | Stations, timers, bump, change tickets (decision 5). |
| Selling | Tables and Dine-in | Core | Table code, seats, location, status, QR card per table, grid and list views. |
| Selling | Delivery and Riders | Phase 2 | Rider cash float; rider status chips on the till; delivered never closes an order. |
| Selling | Online ordering, QR menu, app | Phase 2 | Cashier accept, call waiter, ask for bill, running bill, guest name, printable cards. |
| Selling | Aggregator orders | Phase 3 | Nothing. |
| Selling | Reservations | Phase 3 | Nothing. |
| Menu | Menus and Catalog | Core | Favourites, drag-ordered categories, ArfaPOS JSON import, quick add. |
| Menu | Deals and Promotions | Core | Promotion unit limits with a Sold Out state. |
| Money | Shifts and Cash Drawer | Core | Drawer account per cashier, settlement status per session, forced close (decision 2). |
| Money | Tax | Core | Nothing. |
| Money | Payments | Core | Accounts auto-linked to methods; bank and wallet accounts; pay to customer. |
| Money | Expenses | Phase 2 | Subcategories, by cashier or admin, payroll sync. |
| Money | Finance and Accounts | Phase 3 | Combined ledger with POS reconciliation and integrity check (decision 6). |
| Stock | Inventory | Phase 2 | Counting switch, display units, numbered documents, supplier returns, production. |
| Stock | Recipes and Costing | Phase 2 | Sub-recipes with yield and cost per kg, consumption by dish, the 10x flag. |
| Stock | Purchasing and Suppliers | Phase 2 | Purchase returns, supplier aging, insights, numbered payments. |
| People | Customers and Loyalty | Core profiles, Phase 3 loyalty | Groups, approval status, source, khata ledger, AR aging, insights, WhatsApp balance message, one walk-in customer (decision 3). |
| People | Staff, Roles, Attendance | Core | Session log, per-user permissions; leave, holidays and rules in Phase 3. |
| People | Payroll | Phase 3 | Departments, designations, CNIC, salary components, advances, absence deduction method. |
| Insight | Reports and Dashboard | Core | Business overview comparisons, cashier till report, cancelled and modified orders, order taker report, sales calendar, category report. |
| Insight | Multi-branch and Central Kitchen | Phase 3 | Nothing. |
| Platform | Signup and onboarding | Core | Setup checklist that flags features switched off. |
| Platform | Accounts and branches | Core | Nothing. |
| Platform | Users and login | Core | Nothing. |
| Platform | Subscription and billing | Core | Nothing. |
| Platform | WhatsApp and notifications | Core | Balance-on-payment template with the ArfaPOS variable set. |
| Platform | Super admin | Core | Nothing. |
| Platform | Settings | Core | One formatter for money, dates and phones; business-day window (SPEC). |

---

## 3. Selling

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| S1 | Category grid with photos, search, open order panel and pay button | Both | Core | Yes |
| S2 | Order types dine-in, takeaway, delivery and walk-in with a big switch | Both | Core | Yes |
| S3 | Modifiers for size, spice and extras, in modifier groups | Blueprint | Core | Yes |
| S4 | Split bill | Blueprint | Core | Yes |
| S5 | Hold and recall an order | Blueprint | Core | Yes |
| S6 | Discounts with a limit per role; manager PIN above the limit | Blueprint | Core | Yes |
| S7 | Void before payment with reason and manager PIN; no delete anywhere | Blueprint | Core | Yes |
| S8 | Refund after payment, manager only | Blueprint | Core | Yes |
| S9 | Open item with a custom name and price, permission needed | Blueprint | Core | Yes |
| S10 | Price override with manager PIN, logged | Blueprint | Core | Yes |
| S11 | Reprint receipt marked DUPLICATE, logged | Blueprint | Core | Yes |
| S12 | Staff meals and complimentary orders with reason and approver | Blueprint | Core | Yes |
| S13 | One-tap repeat of a customer's last order by phone number | Blueprint | Core | Yes |
| S14 | Keyboard shortcuts: F1 new order, F2 search, F8 pay | Blueprint | Core | Yes |
| S15 | Dark mode and high-contrast mode | Blueprint | Core | Yes |
| S16 | Works offline; syncs with device UUIDs; needs-attention list for failed records | Blueprint | Core | Yes |
| S17 | Kitchen display by station with a timer per order and bump | Blueprint | Core | Yes |
| S18 | KOT printing per station as fallback | Blueprint | Core | Yes |
| S19 | CHANGED and CANCELLED tickets after an order is sent | Blueprint | Core | Yes |
| S20 | Token and order-ready screen with sound | Blueprint | Core | Yes |
| S21 | Tables with code, seats, location, status and a QR card each; grid and list views | ArfaPOS | Core | Yes |
| S22 | Floor plan, merge and move tables, waiter assignment, service charge | Blueprint | Core | Yes |
| S23 | Rider assignment, delivery zones and charges | Both | Phase 2 | Yes |
| S24 | Cash collected per rider and settlement at shift end | Both | Phase 2 | Yes |
| S25 | Rider cash float: issue, return, spend, adjust, statement | ArfaPOS | Phase 2 | Yes |
| S26 | Rider status on the till: picked up, on the way, arrived, delivered, failed; delivered never closes the order | ArfaPOS | Phase 2 | Yes |
| S27 | Online ordering site per restaurant on its own subdomain | Both | Phase 2 | Yes |
| S28 | QR table ordering with cashier accept, call waiter, ask for bill, running bill, guest name, printable cards | ArfaPOS | Phase 2 | Yes |
| S29 | Online on or off per menu, category and item | Both | Phase 2 | Yes |
| S30 | Customer queue display on a second screen | Blueprint | Phase 2 | Yes |
| S31 | Phone orders with caller ID | Blueprint | Phase 2 | Yes |
| S32 | Bulk and catering pre-orders with advance payment | Blueprint | Phase 2 | Yes |
| S33 | Course firing for dine-in | Blueprint | Phase 2 | Yes |
| S34 | Aggregator orders from Foodpanda with commission tracking | Blueprint | Phase 3 | Yes |
| S35 | Reservations with deposit and reminders | Blueprint | Phase 3 | Yes |
| S36 | Self-order kiosk | Blueprint | Phase 3 | Later |
| S37 | Waitlist with WhatsApp alert | Blueprint | Phase 3 | Later |
| S38 | Cloud kitchen brands from one kitchen | Blueprint | Phase 3 | Later |

## 4. Menu

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| M1 | Multiple menus with online on or off, and time-based menus | Both | Core | Yes |
| M2 | Categories with drag ordering and product counts | ArfaPOS | Core | Yes |
| M3 | Products with photo, price, active flag, favourite star and a default placeholder per category | Both | Core | Yes |
| M4 | Variants and modifier groups | Blueprint | Core | Yes |
| M5 | Prices by order type | Blueprint | Core | Yes |
| M6 | Allergen and dietary tags | Blueprint | Core | Yes |
| M7 | Combo deals with fixed items, quantities and an image | Both | Core | Yes |
| M8 | Combos with choices | Blueprint | Phase 2 | Yes |
| M9 | Promotions: happy hours, percent or fixed, coupon codes, date and time rules | Blueprint | Core | Yes |
| M10 | Promotion unit limits with a Sold Out state | ArfaPOS | Core | Yes |
| M11 | Menu import from Excel, CSV and the ArfaPOS JSON export; menu export | Both | Core | Yes |
| M12 | Quick add menu | ArfaPOS | Core | Yes |
| M13 | Menu change approval for chains | Blueprint | Phase 3 | Later |
| M14 | Menu import from a photo with AI | Blueprint | Phase 4 | Later |

## 5. Money

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| Y1 | Shift open with opening cash; cash in and out with reason; blind close; over or short; manager approval | Blueprint | Core | Yes |
| Y2 | Z report per cashier: sales by payment type, voids, discounts, tax, over or short | Blueprint | Core | Yes |
| Y3 | Drawer account per cashier posting to finance, behind the Cashier Drawer switch; cannot be disabled with a balance | ArfaPOS | Core | Yes |
| Y4 | Forced shift close at day end; one open shift per cashier | ArfaPOS | Core | Yes |
| Y5 | Day close: shifts closed, pending orders resolved, optional count, day locked; manager reopen with reason | Blueprint | Core | Yes |
| Y6 | Business day as a start and end window per branch, default 06:01 to 02:01 (SPEC), used by every report and ledger | Both | Core | Yes |
| Y7 | Payment methods: cash, card, EasyPaisa, JazzCash, bank transfer, khata, split payment | Both | Core | Yes |
| Y8 | Payment accounts auto-linked to methods, with transfer, deposit, withdraw and verify | ArfaPOS | Core | Yes |
| Y9 | Cash rounding to Rs 5 or Rs 10, shown on the receipt | Blueprint | Core | Yes |
| Y10 | Raast QR payment | Blueprint | Core | Yes |
| Y11 | Card terminal link | Blueprint | Core | Yes |
| Y12 | Tips on the bill, shared to staff in payroll | Both | Core | Yes |
| Y13 | Service charge on dine-in | Both | Core | Yes |
| Y14 | Tax per item or category, inclusive or exclusive; FBR and PRA invoice sync; QR on receipt; offline queue | Blueprint | Core | Yes |
| Y15 | Monthly tax filing report | Blueprint | Phase 2 | Yes |
| Y16 | Expenses with categories, subcategories, payment method, receipt photo, petty cash from drawer, daily prompt at shift close | Both | Phase 2 | Yes |
| Y17 | Overheads setting for labor, gas and rent as cost per order or per month; payroll sync to expenses | Both | Phase 2 | Yes |
| Y18 | Customer khata: orders on account, balance, payments received, pay to customer, ledger, unpaid orders list | Both | Core | Yes |
| Y19 | Customer AR aging in 0-30, 31-60, 61-90 and 90+ days | ArfaPOS | Core | Yes |
| Y20 | Automatic WhatsApp balance message when a khata customer pays | Both | Core | Yes |
| Y21 | Advance payments and deposits adjusted in the final bill | Blueprint | Phase 2 | Yes |
| Y22 | Combined ledger by business day with reconciliation against paid orders and an integrity check | ArfaPOS | Phase 3 | Yes |
| Y23 | Supplier payables, customer receivables, profit and loss | Blueprint | Phase 3 | Yes |
| Y24 | Accounting export to QuickBooks and Xero | Blueprint | Phase 3 | Yes |
| Y25 | Journal voucher, chart of accounts, trial balance, balance sheet, fixed assets, liabilities, equity | ArfaPOS | Phase 3 | Yes |
| Y26 | Vouchers (Yes, in SPEC); gift cards (Later) | Blueprint | Phase 3 | Yes |
| Y27 | Corporate accounts with one monthly bill | Blueprint | Phase 3 | Later |

## 6. Stock

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| K1 | Stock items with SKU, category, base unit, minimum and a level per section | Both | Phase 2 | Yes |
| K2 | Sections such as Kitchen and Warehouse, with transfers between them | Both | Phase 2 | Yes |
| K3 | Numbered stock documents with status: receive, transfer, waste with reason, adjust, count, production, supplier return | Both | Phase 2 | Yes |
| K4 | One ledger row per deduction: item, section, before, after, cost, document, user | Blueprint | Phase 2 | Yes |
| K5 | Day lock for stock documents; sales still deduct | Both | Phase 2 | Yes |
| K6 | Counting switch that opens and closes stocktakes | ArfaPOS | Phase 2 | Yes |
| K7 | Below-zero rule: manual moves blocked, sales and waste allowed, alert and manager task when negative | Both | Phase 2 | Yes |
| K8 | Return stock on cancel, or record it as waste | Both | Phase 2 | Yes |
| K9 | Safety net that re-deducts completed orders whose deduction was lost | ArfaPOS | Phase 2 | Yes |
| K10 | Recipe per menu item; sub-recipes with yield and cost per kg; production batches | Both | Phase 2 | Yes |
| K11 | Recipe coverage meter; optional rule that a product cannot go live without a recipe | Blueprint | Phase 2 | Yes |
| K12 | Food cost percent per item, red above target | Blueprint | Phase 2 | Yes |
| K13 | Weighted average cost updated on each goods receipt | Both | Phase 2 | Yes |
| K14 | Packaging deducted per order type | Both | Phase 2 | Yes |
| K15 | Units with conversions stored in both directions (SPEC), shown as fractions or decimals | Both | Phase 2 | Yes |
| K16 | Display units automatic, grams to kilograms, stored to the gram | ArfaPOS | Phase 2 | Yes |
| K17 | Daily stock sheet: opening, in, out, waste, sale, adjusted, closing per section | ArfaPOS | Phase 2 | Yes |
| K18 | Stock ledger with type filters and punched by, completed by | Both | Phase 2 | Yes |
| K19 | Consumption by ingredient, dish, section and day, with the 10 times flag | Both | Phase 2 | Yes |
| K20 | Waste and adjustments by entry, reason and item | ArfaPOS | Phase 2 | Yes |
| K21 | Actual vs theoretical from two counts | ArfaPOS | Phase 2 | Yes |
| K22 | Valuation and COGS by section, category and item; short items listed, not subtracted | ArfaPOS | Phase 2 | Yes |
| K23 | Deduction check for one order number | ArfaPOS | Phase 2 | Yes |
| K24 | Demand and reorder suggestions with rules; usage forecast with a budget cap | Both | Phase 2 | Yes |
| K25 | Purchase orders from draft to received; goods received; supplier price history | Both | Phase 2 | Yes |
| K26 | Purchase returns settled as credit note or cash refund | ArfaPOS | Phase 2 | Yes |
| K27 | Suppliers with contact, balance to pay or receive, ledger, aging, insights and numbered payments by method | Both | Phase 2 | Yes |
| K28 | Supplier bill photo scan with AI | Blueprint | Phase 2 | Later |
| K29 | Items sold by weight with a scale | Blueprint | Phase 2 | Yes |
| K30 | Batch and expiry dates with alerts | Blueprint | Phase 2 | Yes |
| K31 | Stock count on a phone | Blueprint | Phase 2 | Yes |
| K32 | Import stock items with units and opening quantities from the ArfaPOS Items export | Blueprint | Phase 2 | Yes |
| K33 | AI stock forecast | Blueprint | Phase 4 | Yes |

## 7. People

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| P1 | Customer profile from phone number, with order history and addresses | Both | Core | Yes |
| P2 | Customer groups | ArfaPOS | Core | Yes |
| P3 | Customer approval status and source for online signups | ArfaPOS | Phase 2 | Yes |
| P4 | Customer insights: orders, net spent, average, last order, repeat and credit accounts | Both | Core | Yes |
| P5 | One built-in walk-in customer that cannot be duplicated | ArfaPOS | Core | Yes |
| P6 | Loyalty points, birthday offers, campaigns with opt-in and STOP | Blueprint | Phase 3 | Yes |
| P7 | Users with seven default roles, custom roles and PIN login on registered devices | Blueprint | Core | Yes |
| P8 | Per-user permissions through Manage Access | Both | Core | Yes |
| P9 | WhatsApp invite when staff are added; deactivate removes access on every app | Blueprint | Core | Yes |
| P10 | Session log per user with login, logout, duration and settlement status | ArfaPOS | Core | Yes |
| P11 | Manager approval on the spot with both names saved | Blueprint | Core | Yes |
| P12 | Waiter and order-taker sales, commission rules and a daily report | Both | Phase 2 | Yes |
| P13 | Opening and closing checklists | Blueprint | Phase 2 | Yes |
| P14 | Attendance by fingerprint device or selfie, with a shift schedule | Both | Phase 3 | Yes |
| P15 | Leave, holidays, per-employee shift rules and fines | ArfaPOS | Phase 3 | Yes |
| P16 | Fingerprint required to close a shift | ArfaPOS | Phase 3 | Yes |
| P17 | Employees with department, designation, CNIC and salary components | Both | Phase 3 | Yes |
| P18 | Advances: request, approve, repay from the next payroll | Both | Phase 3 | Yes |
| P19 | Payroll run with bonuses, tips and commissions; payslips; ledger; reports | Both | Phase 3 | Yes |
| P20 | Absence deduction by calendar days or a fixed 26 | ArfaPOS | Phase 3 | Yes |
| P21 | Import customers, suppliers and employees from CSV | Both | Core | Yes |

## 8. Insight

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| I1 | Dashboard with summary cards, today vs same day last week, open orders shown separately, recipe coverage, negative stock and tax queue | Blueprint | Core | Yes |
| I2 | Business overview with yesterday, last week and last month comparisons | ArfaPOS | Core | Yes |
| I3 | Reports: sales, items, hours, cashiers, voids, discounts | Blueprint | Core | Yes |
| I4 | Cashier till report per shift | ArfaPOS | Core | Yes |
| I5 | Cancelled and modified orders report with who did it | ArfaPOS | Core | Yes |
| I6 | Sales calendar, category report, products and deals report, order taker report | ArfaPOS | Core | Yes |
| I7 | Menu profitability | Blueprint | Phase 2 | Yes |
| I8 | Scheduled reports by WhatsApp or email | Blueprint | Phase 2 | Yes |
| I9 | Multi-branch dashboard, branch comparison, central menu with branch prices, stock transfers, franchise mode | Blueprint | Phase 3 | Yes |
| I10 | Sales insights in Urdu with AI | Blueprint | Phase 4 | Later |

## 9. Platform

| # | Feature | Source | Phase | Include |
|---|---|---|---|---|
| F1 | Signup with WhatsApp OTP or email; business, country, currency, time zone; sample menu or import; setup checklist with progress | Blueprint | Core | Yes |
| F2 | Setup checklist flags features on the plan that are switched off | ArfaPOS | Core | Yes |
| F3 | Business, branches, users, memberships and registered devices | Blueprint | Core | Yes |
| F4 | Plans, 40-day trial, invoices, grace period, read-only mode, plan limits; Pakistan by JazzCash, EasyPaisa and bank; international by Paddle | Blueprint | Core | Yes |
| F5 | WhatsApp through the Meta Cloud API: OTP, receipts, order status, daily summary, alerts, reminders; templates; opt-in; SMS and email fallback | Blueprint | Core | Yes |
| F6 | Super admin with support login on owner approval, every action logged | Blueprint | Core | Yes |
| F7 | Settings: business info, business-day start and end (SPEC), tax, payment methods, printers and stations, receipt designer for 58 and 80 mm with Urdu, languages | Blueprint | Core | Yes |
| F8 | One formatter for money, dates and phone numbers | ArfaPOS | Core | Yes |
| F9 | In-app setup tour and notification center | Blueprint | Core | Yes |
| F10 | Localization: English and Urdu with RTL, currency per business, tax engine per country | Blueprint | Core | Yes |
| F11 | Hardware: ESC/POS printers, cash drawer, barcode scanner, print server for tablets (SPEC) | Blueprint | Core | Yes |
| F12 | Tenant isolation: business_id on every table, Row-Level Security, UUID ids, signed file links, isolation test suite | Blueprint | Core | Yes |
| F13 | Audit log for every money, stock and permission change | Blueprint | Core | Yes |
| F14 | Open API and webhooks | Blueprint | Phase 3 | Later |
| F15 | Reseller program | Blueprint | Phase 3 | Later |
| F16 | Branded customer app (SPEC lists a customer mobile app) | Blueprint | Phase 3 | Yes |
| F17 | WhatsApp order bot | Blueprint | Phase 4 | Later |

Totals: 160 features. 35 come from ArfaPOS or fix an ArfaPOS problem. On 10 Oct 2026 `SPEC.md` settled the 6 Decide rows and the No row as Yes, and moved Quick add, vouchers, the AI stock forecast and the customer app from Later to Yes; 11 rows stay Later, plus gift cards. The SPEC features these tables miss or cover only partly are listed in `PDF-ALIGNMENT.md` section 6.

---

## 10. Roles and permissions

**SPEC.md replaces this section's model:** permissions are granted per user from 58 codes in 12 modules, with Cashier, Supervisor and Manager presets and Select all, a Software, App or Both surface on each code, RESTRICTION codes that add a step, and changes applied at the user's next sign-in. The full list is in `SPEC.md`. The seven roles below stay as extra presets.

Seven default roles: Owner, Manager, Cashier, Waiter, Kitchen, Rider, Accountant. Each can be copied into a custom role. Every check runs on the server.

| Action | Owner | Manager | Cashier | Waiter | Kitchen | Rider |
|---|---|---|---|---|---|---|
| Take orders | Yes | Yes | Yes | Yes | No | No |
| Take payment | Yes | Yes | Yes | No | No | Cash on delivery only |
| Discount up to 10% | Yes | Yes | Yes | No | No | No |
| Discount above 10% | Yes | Yes | Manager PIN | No | No | No |
| Void order | Yes | Yes | Manager PIN | No | No | No |
| Refund | Yes | Yes | No | No | No | No |
| Open and close shift | Yes | Yes | Own shift | No | No | No |
| Kitchen display | View | Yes | View | View | Yes | No |
| Edit menu and prices | Yes | Optional | No | No | No | No |
| Stock actions | Yes | Yes | No | No | Waste only | No |
| Reports | All | Branch | Own shift | No | No | Own deliveries |
| Payroll and settings | Yes | No | No | No | No | No |

Permission codes: `app.admin`, `app.pos`, `app.rider`, `orders.create`, `orders.void`, `orders.refund`, `discounts.above_limit`, `menu.edit`, `staff.manage`, `reports.view_all`, `reports.view_own`, `stock.count`, `stock.waste`, `prices.override`, `items.open`.

---

## 11. Business rules

| Area | Rule |
|---|---|
| Orders | Statuses (SPEC): Pending, Preparing, Ready, Dispatched, Completed, Cancelled; Open means the first four. Payment status runs separately: Paid, Pending, Unpaid, Account, Complimentary. Held, served and refunded stay as EasAlpha extras. |
| Orders | Stock is deducted once, when the order is completed (SPEC). A safety-net job finds completed orders whose stock never moved and deducts them dated to the sale day, never twice. Cancelling a deducted order returns stock when Return stock on cancellation is on; otherwise staff record waste. |
| Orders | A completed order can be reopened (SPEC): REOPEN_ORDER, an optional order-update PIN, and separate permissions to delete a line or lower a quantity. Every punch, reopen, edit and completion is stored with user, role, time and the item and money change. Refunds stay as an extra. |
| Orders | Revenue counts only at Completed (SPEC). Open orders are shown separately. |
| Orders | Short daily serial per branch for people, UUID for the system. Offline tills prefix the serial with the till code (T1-059). |
| Orders | Nothing financial is deleted. Orders, payments, ledger rows and shifts are voided or reversed. Menu items and staff are archived. |
| Orders | Order items snapshot name, price, tax and recipe cost at the time of sale. |
| Orders | A rider marking an order delivered does not close it. The cashier closes it at the till. |
| Orders | A QR order waits for a cashier to tap Accept, then goes to the kitchen like a punched order. Cards stay printable while QR ordering is off. |
| Orders | Exactly one walk-in customer record per business. |
| Money | A cashier opens a shift with opening cash; every cash payment, refund, cash in and cash out with reason updates expected cash. |
| Money | Blind count at close; over or short shown; manager approves; Z report prints. |
| Money | One open shift per cashier. A shift still open at day end is force-closed and flagged. |
| Money | Every payment posts to the account linked to its method, in the same transaction as the order (decision 2). |
| Money | An account cannot be disabled while its balance is not zero. |
| Money | Discount limits per role; above the limit a manager types their PIN on the cashier's screen and both names are saved. |
| Money | Applying a voucher does not count against the cashier's discount limit, and a personal voucher works only for its customer (SPEC). |
| Money | Price override, open item, void, refund and reprint are permission-gated and logged with user, device, before and after. |
| Money | Cash rounding is shown as a line on the receipt. |
| Money | On payment the invoice goes to FBR or PRA; number and QR print on the receipt; offline invoices queue; the queue is visible on the dashboard. |
| Money | Day close order: all shifts closed, pending orders resolved, optional count, day locked. Manager with reason can reopen. |
| Money | The business day is a start and end window, default 6:01 am to 2:01 am (SPEC). An order at 1:30 am belongs to the previous day everywhere. |
| Money | A khata order posts to the customer balance; a WhatsApp balance message is sent when the customer pays. |
| Money | Money is stored as integers in the smallest unit with a currency. Quantities are stored in the base unit at full decimal precision and converted only at the edges (SPEC). Time is UTC. |
| Stock | Every stock change writes a ledger row: item, section, before, after, cost, document, user. Rows are reversed, never edited. |
| Stock | Sales and waste may go below zero; a sale is never blocked over a stock figure. Manual moves below zero are refused unless the setting allows. |
| Stock | A negative level raises an alert and a daily manager task. |
| Stock | Day lock refuses stock documents on or before the lock date; sales still deduct. |
| Stock | Counts open only during a stocktake, by a switch that overrides permissions. |
| Stock | Weighted average cost, updated on each goods receipt. Food cost percent = recipe cost over selling price before tax, red above target. |
| Stock | Labor, gas and rent are overheads, never stock items. |
| Stock | Order-type consumables are set per order type and per variant, with copy (SPEC). Sub-recipes are produced in batches, then deducted like items. |
| Stock | Each conversion direction is stored (SPEC). Display units are a view setting. |
| Stock | An ingredient using more than 10x its typical amount per order is flagged as a probable wrong-unit recipe. |
| Staff | 4-digit PIN on devices paired to the branch. Deactivation removes access on every app at once; offline devices on next sync. |
| Staff | Approved advances repay from the next payroll run. Absence deductions use calendar days or a fixed 26. |
| Platform | business_id on every business-owned row; queries scoped on the server; Row-Level Security as the second wall; plan limits checked on the server. |

---

## 12. Data model additions beyond the blueprint's 70 tables

| Table or field | Purpose |
|---|---|
| customer_groups, customers.group_id | Group customers such as hostel blocks or offices |
| customers.status, customers.source, customers.is_walk_in | Active, pending approval, deactivated; in-store, online, QR, phone; the single walk-in record |
| customer_payments | Money received from or paid to a khata customer with number, method, account, reference, collected_by |
| purchase_returns, purchase_return_lines | Return against a goods receipt, settled as credit note or cash refund |
| supplier_payments | Numbered payment to a supplier with method, account, reference |
| payment_accounts | Cash, wallet, bank and per-cashier drawer accounts; default or custom; active; linked method (decision 2) |
| account_entries | One posting per payment, refund, expense, supplier payment, transfer, deposit, withdrawal, with business_day (decision 2) |
| shifts.settlement_status, shifts.force_closed_at | Settlement pending or done; forced close at the end of the business day |
| inventory_settings | day_lock_date, counting_open, allow_manual_below_zero, return_on_cancel, display units |
| demand_rules | Reorder rules and forecast window |
| deduction_audits | Per-order record of stock movements, for the one-order check |
| promotions.unit_limit, promotions.units_sold | Sold Out state |
| product_prices with order_type | Different price for dine-in, takeaway and delivery |
| categories.sort_order, products.is_favourite | Drag ordering and favourites |
| orders.source | till, qr, online, phone, foodpanda |
| qr_settings per branch | enabled, cashier_accept, call_waiter, ask_bill, running_bill, guest_name, branding |
| table_requests | Call waiter and ask for bill events |
| rider_cash_movements | Issue, return, spend, adjust against a rider |
| delivery_status_events | picked_up, on_the_way, arrived, delivered, failed with time and location |
| departments, salary_components, employee_salary_components; employees.designation, employees.cnic | Payroll employee record |
| leave_requests, holidays, attendance_rules | Leave, closures, per-employee shift and fine rules |
| setup_checklist_items | Per-business checklist with a flag for plan features that are off |
