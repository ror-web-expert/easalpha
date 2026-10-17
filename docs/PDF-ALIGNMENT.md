# PDF Alignment: SPEC.md vs the EasAlpha docs

Date: 10 Oct 2026. Live copy: [EasAlpha: PDF Spec vs EasAlpha Docs](https://claude.ai/code/artifact/5830de61-ca3f-49eb-9998-f837c6596a09).

`SPEC.md` (the PDF "ARFAPOS Clone — Functional Spec & Build Plan", 38 pages) is EasAlpha's requirement. Every feature, screen, menu item and behaviour in it must exist in EasAlpha and work the same way. This file lists, for each PDF feature, whether the EasAlpha docs and the app already have it, where the docs said something different, and the EasAlpha extras that stay.

Order of authority: `SPEC.md` first, then this file, then `01` to `08`. Where `SPEC.md` is silent, `01` to `08` fill the gap. Where both are silent, ask the owner.

---

## 1. Rules

1. **PDF wins.** Where `01` to `08` say something different, EasAlpha follows `SPEC.md`.
2. **Same menu.** The admin sidebar copies the PDF's 4 standalone screens and 12 groups, with their screens.
3. **Same devices.** The POS is an installable web app at `/pos` with an offline queue, as the PDF's frontend plan proposes (its open question 3 leaves installed software as an option for printer access). Tools that already do the same job stay (owner's answer: "best thing and fast, just the features and functionality of this PDF"); see section 5.
4. **Nothing is removed.** Features in the EasAlpha docs that the PDF does not have stay. They are listed in section 7 with the reason each was added.
5. **Everything is tested** the way the PDF says: a request spec per endpoint for the happy path, a permission denial and one edge case, and a gate at the end of each phase.
6. **Own name and look.** The PDF itself says the clone keeps its own name, visual design and wording. EasAlpha keeps its name and its Material Design 3 look; behaviour and menu structure follow the PDF.

Column values used below. **The Docs column scores `01` to `08` as they stood before the 10 Oct 2026 edits** (the archived text), so it shows what those docs had to change; after the edits every Differs, Later and Missing row is covered the SPEC way.

Column values used below:

| Docs | Meaning |
|---|---|
| Same | `01` to `08` describe it the way the PDF does |
| Partly | They cover part of it |
| Differs | They describe a different behaviour; the PDF version replaces it |
| Later | Parked as Later or Decide |
| Missing | Not in the docs; must be added |

| App | Meaning |
|---|---|
| Built | Works in the API and has its screen |
| API only | Works in the API, no screen yet |
| Partly | Part of the behaviour is built |
| Differs | Built, but behaves differently from the PDF |
| Missing | Not built |

App values come from the code check on 10 Oct 2026.

---

## 2. Summary

The PDF describes 218 features.

| Status | EasAlpha docs | App on 10 Oct 2026 |
|---|---|---|
| Matches the PDF (Same or Built) | 86 | 55 |
| Partly | 65 | 90 |
| Differs from the PDF | 19 | 11 |
| Parked as Later or Decide | 7 | 0 |
| API only, no screen | 0 | 15 |
| Missing | 41 | 47 |
| **Total** | **218** | **218** |

Biggest gaps, missing from both the docs and the app: per-user permissions with the 58 codes; double-entry finance; the reopen flow and an order story with item and money changes; stock deducted at completion with the safety-net job; the attendance rules engine; regular discounts, voucher batches and reviews; POS settings (customer required, order behaviour, print server, pending-order reminder); Website Config; PDF export.

The EasAlpha docs also hold 88 features the PDF does not have. All stay (section 7).

---

## 3. Menu

The PDF sidebar has 4 standalone screens and 12 groups, 94 screens in all. The app sidebar on 10 Oct 2026 had 10 groups and 70 items, 10 marked Soon.

| PDF group | PDF screens, in order | In EasAlpha docs | In the app sidebar on 10 Oct |
|---|---|---|---|
| Standalone | Dashboard · Orders · Expenses · Tables | All 4 | All 4, spread over Sell and Money |
| Products | Menus · Catalog · Deals · Promotions · Quick Add Menu | 4; Quick Add was Later | Menus, Categories, Products, Deals, Promotions; no Quick Add |
| Inventory | Stock in Hand · Stock Actions · Demand · Items · Recipes · Order Inventory · Units · Inventory Settings | All 8; Demand was Decide | 7; Demand under Purchasing; Order Inventory called Packaging |
| Inventory Reports | Daily Stock Sheet · Stock Ledger · Consumption · Waste & Adjustments · Actual vs Theoretical · Valuation & COGS · AI Stock Forecast · Deduction Health | All 8; AI forecast was Later | 4 in the Stock group |
| Purchasing | Purchase Orders · Purchase Returns · Purchase Price History | All 3 | 2; no Price History screen |
| Suppliers | Suppliers · Supplier Ledger · Supplier Insights · Supplier Payments | All 4 | Suppliers only; the rest are tabs on one supplier |
| Customers | Customers · Customer Ledger · Customer Insights · Customer Payments · Customer Account · AR Aging | All 6 | Customers and Khata aging; the rest are tabs on one customer |
| Staff | Cashiers · User Sessions · Order Takers · Admin Staff | Session log only; one staff list | One Staff screen |
| Finance | Dashboard · Payment Accounts · Combined Ledger · Journal Voucher · Chart of Accounts · Fixed Assets · Liabilities · Equity · Balance Sheet · Trial Balance | 2; 8 were marked No | Payment accounts only; Finance was Soon |
| Payroll | Overview · Employees · Advances · Run Payroll · Ledger · Fingerprint · Reports · Settings | 7; no Overview | 5 items, all Soon |
| Reports | Business Overview · Grand Report · Sales · Sales Calendar · Financial · Products & Deals · Category Report · Order Takers · Cashiers · Cashier Till · Customers · Customer Ledger · Operations · Cancelled & Modified Orders · Delivery Riders · Vouchers · Loyalty Points · Regular Discounts · AI Pricing | 14 | One Reports screen with 10 tabs |
| Riders | Manage Riders · Rider Vault · Rider Reports · Rider App | All 4 | Riders; vault is a tab; no Rider App |
| Settings | Store · Payment Methods · Plan · WhatsApp · Website Config · Notifications · Loyalty Points · Regular Discounts · Vouchers · Reviews · Audit Logs | 9; Regular Discounts and Reviews missing | Business, Payment methods |

Settings areas, 24 screens:

- **Store:** Store Profile, Store Management, Business Hours
- **Point of Sale:** Order Taker, Customer Required, Customer Fields, Order Behavior, POS Notifications, KDS Alerts, Barcode Scanning, Pending Order Reminder, Receipt Branding, Print Server
- **Charges & Tax:** Service Charge, Delivery Charge, PRA e-IMS
- **Inventory:** Sections, Stock Alerts, Reset Stock
- **Security & Cash:** Change Password, Signed-In Devices, Expense & Report PIN, Cashier PIN, Cashier Drawer

EasAlpha screens with no PDF screen stay, moved into the nearest PDF group: Reservations, QR orders, Modifier groups, Tax rates, Stations, Shifts, Day close, Tax invoices, Overheads, Food cost, Production, Goods received, Payables aging, Purchases report, Delivery board, Zones, Campaigns, Roles, Commissions, Devices, Scheduled reports, Branch comparison, Foodpanda, Needs attention, Branches, QR ordering, Setup checklist, Opening and closing, Integrations.

---

## 4. Conflicts: the PDF version is adopted

| Topic | PDF, adopted | What `01` to `08` said | Change in the app |
|---|---|---|---|
| Stock deduction | Once, when the order is completed | At Placed (decision 1) | Move deduction to completion; cancellation returns stock if the setting is on |
| Lost deductions | Safety-net job every 10 to 15 minutes, dated to the sale day, plus Deduction Health | "No safety net needed" (04); K9 = Decide | Add the job, the unique index and the Retry screen |
| Accounting | Double entry: chart of accounts, journal voucher, fixed assets, liabilities, equity, trial balance, balance sheet | Y25 = No (decision 6) | Build all seven; payments post journal lines |
| Permissions | 58 codes granted per user; presets are shortcuts; set cached in the token | 15 codes on roles; checked on every request | Per-user grants, the full code list, surface badges, the editor |
| When a permission change applies | At the user's next sign-in | Immediately | Read permissions from the token |
| Business day | Start and end time, default 6:01 am to 2:01 am | One day-end time, default 04:00 | Add the start time and the default |
| Order statuses | Pending, Preparing, Ready, Dispatched, Completed, Cancelled | 11 states from draft to refunded | Show the PDF's six; hold and refund stay as extras |
| Reopen | A completed order can be reopened with its own permissions and a PIN | No reopen; edit before payment, refund after | Build the reopen flow; keep refunds |
| Kitchen display access | A staff login with only the KDS permission | A paired device, no login (decision 5) | Kitchen login already exists; make it the main route |
| Staff types | Admin Staff, Cashiers, Order Takers, Riders, Employees, each with its own screen | One staff list with roles | Separate screens and record types |
| Order consumables | Per order type and per variant, with copy | Per order type only (K14) | Add product and variant level with copy |
| Delivery charge | Percentage or fixed, pre-filled, removable per order | Fixed amount per zone | Add % or fixed; zones stay as an extra |
| Unit conversions | Each direction stored | Stored one way, reverse worked out | Store both directions |
| Settings | Typed key-value store per outlet with a version number | One JSON field per business | New settings table and a version endpoint |
| POS and tablet | Installable web app at /pos; tablets print through the desktop's IP | Tauri desktop app and an Android print bridge | Docs only: the app is already a web app |
| Build order | 7 phases, Foundation to Reports | 4 phases, Core to AI | Docs only: plan the work in the PDF's phases |

---

## 5. Technology, devices and apps

Features and behaviour follow the PDF exactly. For tools, the owner chose "best thing and fast, just the features and functionality of this PDF", so a tool that already does the same job stays and only tools the features or the testing need are added. Switching to the PDF's exact tools stays available on request.

| Layer | PDF | `01` to `08` | App on 10 Oct | Plan |
|---|---|---|---|---|
| Backend | Rails 8, API only | Same | Rails 8.0 API | Keep |
| Database | PostgreSQL 16 | Same | PostgreSQL 16 | Keep |
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind | Next.js, Tailwind, shadcn/ui | Next.js 15.5, React 19.1, TypeScript, Tailwind 4 | Keep |
| Background jobs | Sidekiq + Redis | Solid Queue; Sidekiq later | Solid Queue | Keep Solid Queue |
| Realtime | ActionCable | Action Cable | Action Cable | Keep |
| Sign-in | Devise + devise-jwt, refresh token | Own tokens with refresh | Own JWT with refresh tokens | Keep; add granted permissions to the token |
| Authorization | Pundit, one policy per action | Pundit | Pundit | Keep |
| Server data in the UI | TanStack Query | Not stated | TanStack Query 5 | Keep |
| POS cart | Zustand | Not stated | Zustand 5 | Keep |
| Validation | Zod | Not stated | None | Add Zod for forms |
| Backend tests | RSpec + FactoryBot | RSpec | RSpec + FactoryBot | Add the three-case spec per endpoint |
| Frontend tests | Vitest + Testing Library | Playwright | Playwright script | Add Vitest and Testing Library; keep Playwright |
| Charts | One library, one palette | One palette | Recharts | Keep |
| Repository | /api, /web, /docs | Five repositories | easalpha-api, easalpha-web, docs | Keep the folders |
| Admin routes | /admin/products, /inventory, /purchasing, /suppliers, /customers, /staff, /finance, /payroll, /reports, /riders, /settings | Not stated | /admin/menu, /stock, /delivery and others | Rename when the sidebar is regrouped |
| POS | Installable web app at /pos, IndexedDB catalog with ETag, offline queue | Tauri 2 desktop app with SQLite | Web app at /pos, IndexedDB, cursor sync | Keep; add the ETag check |
| Storefront | Public site at /, server-rendered | Ordering site per subdomain | None | Build it |
| Kitchen display | Websocket channel | Same | Built | Keep |
| Money | Integer cents | Same | Integer paisa | Keep |
| Tenancy | outlet_id from the token | business_id, branch_id, Row-Level Security | Same as docs | Branch plays the outlet (open question 1) |

| Surface | Who uses it | `01` to `08` | App on 10 Oct |
|---|---|---|---|
| Admin panel | Owner, managers | Same | Built, regrouping needed |
| Desktop POS | Cashiers, supervisors | Tauri app | Web app at /pos |
| Tablet app | Order takers; prints through the desktop | Tauri mobile and a print bridge | Missing |
| Kitchen display | Kitchen staff login | Paired device | Built |
| Rider app | Riders | React Native | API only |
| Website and mobile app | Customers | Ordering site; branded app Later | QR ordering API only |

---

## 6. Feature by feature

Every PDF behaviour, module by module: 218 rows across 13 modules. Each row must end as Built.

### Roles, permissions and staff

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Permissions granted per user; role presets are only a shortcut | Differs | Differs | Docs P8 says per user, but docs section 10 and the schema are per role |
| 58 permission codes in 12 modules, each with a code and a plain description | Differs | Differs | Docs list 15 codes; app has 46, about 20 PDF codes missing |
| Presets Cashier, Supervisor, Manager, plus Select all | Partly | Partly | Docs and app have 7 role templates, no Supervisor, no Select all |
| Surface badge on each permission: Software, App or Both | Missing | Missing | EasAlpha uses app.pos, app.kitchen, app.rider codes instead |
| RESTRICTION permissions that add a step, such as REQUIRE_PIN_FOR_ORDER_UPDATE | Missing | Missing | EasAlpha asks for a manager PIN when a permission is missing, which is the reverse |
| Full-screen permission editor: module list with granted-of-total badge, permissions on the right | Missing | Partly | App has a role editor with checkboxes, no badge per module |
| Changes take effect at the user's next sign-in; granted set cached in the JWT | Differs | Differs | Docs and app read permissions on every request, so changes apply at once |
| Checked in the API by policy and hidden in the UI by a Can wrapper | Same | Built | |
| Separate staff types, each with its own screen and login: Admin Staff, Cashiers, Order Takers, Riders, Employees | Differs | Partly | Docs and app have one staff list with roles; riders and employees are separate records |
| Cashiers carry sessions and tills | Same | Built | Shifts and a drawer account per cashier |
| My Till view for the cashier (MY_TILL) | Partly | Partly | Shift screen on the POS; no MY_TILL code |
| Order takers tracked for daily performance | Same | Built | Docs P12; order takers report |
| User Sessions screen | Same | Missing | Docs P10 session log; app stores sign-ins but has no screen |
| Deleting a rider who is on past orders deactivates them instead | Same | Built | |
| Anything referenced by history is soft-deleted, never destroyed | Same | Built | archived_at on menu, staff, customers, suppliers, items |
| PLACE_UNPAID_DIRECT works only when Direct Unpaid Orders is on; reopened orders always use the payment screen | Missing | Missing | |
| APPLY_VOUCHER does not count against the cashier's discount limit; a voucher works only for its customer | Missing | Partly | App coupons skip the limit but are not tied to a customer |
| Create suppliers and items inline while building a purchase order, with permission | Missing | Missing | |

### Dashboard and business day

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Business day is a configurable start and end window, default 6:01 am to 2:01 am | Differs | Differs | Docs and app use one day-end time per branch, default 04:00 |
| orders.business_date computed when the order is inserted | Same | Built | |
| Top bar: date and live clock, business-day window, plan badge, theme switch | Partly | Partly | Docs have dark mode only; app has the theme switch only |
| Low-stock pill linking to items at or below minimum | Partly | Missing | Docs I1 shows negative stock on the dashboard |
| Open-orders pill: open today and from previous days | Partly | Partly | Open orders shown, not split by day |
| Notifications bell and account menu with user and outlet | Same | Partly | API has the unread count; no bell |
| KPI cards: Total Products, Total Revenue (completed only), Incl. Open Orders, Total Orders with cancelled shown, Total Customers, Expenses | Partly | Partly | Products, customers and expenses cards missing |
| Charts: sales by hour, orders by hour, products by category, order status, expenses by category with an empty state | Partly | Partly | App dashboard shows a 7-day trend; hourly charts only on Reports |
| Top selling products with units and revenue | Partly | Built | |
| Period selector and Refresh button | Partly | Missing | App refreshes every 60 seconds |

### Menu and catalog

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Menu, Category, Product, Variant, with a recipe per variant | Same | Built | |
| Menus with category count and a Show on website and app toggle; hidden menus still sellable by staff | Same | Partly | App QR menu checks only the product flag |
| Categories with name, subtitle and product count | Partly | Partly | No subtitle |
| Arrange mode: drag-and-drop order of categories and products, used by POS and website | Same | Partly | App has up and down arrows for categories only |
| Favorites pinned to the front of the POS | Same | Built | |
| Product Basic Info: image (PNG, JPG, WEBP, max 5 MB), name, description, base price, variant rows | Same | Partly | No image upload in the app |
| Product discount with a % or Rs switch | Missing | Missing | |
| PCT code on the product for PRA e-IMS | Missing | Missing | |
| Ingredients tab: recipe per variant, picker offers only compatible units | Same | Built | |
| Order Inventory tab: consumables per order type and per variant, Copy all order types | Differs | Differs | Docs K14 and app deduct packaging per order type only |
| Active or Inactive state on each product card | Same | Built | |
| Download Menu and Import JSON | Same | API only | No buttons in the app |
| Display Settings and Product Codes panels | Missing | Missing | |
| Deals: name, price, description, products with quantities; favourite, view, edit, delete, add to order | Same | Partly | No favourite flag per deal |
| Promotions: units sold, unit cap, Sold Out, date window | Same | Built | |
| Quick Add Menu: fast movers added to a running order in one tap | Later | Missing | Docs M12 = Later |

### Orders and tables

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Serial number and a separate order code | Same | Built | |
| Walk-in, Takeaway and Delivery, each gated by its own permission | Partly | Partly | Types exist (plus dine-in); no permission per type |
| Customer required, set per order type | Missing | Missing | |
| Sources: Counter, Website, Mobile App, QR Table, Online Orders | Partly | Partly | Docs and app have till, qr, online, phone, foodpanda; no mobile app source |
| Statuses Pending, Preparing, Ready, Dispatched, Completed, Cancelled; Open filter over the first four | Differs | Differs | Docs and app: draft, placed, preparing, ready, served, dispatched, paid, closed, held, voided, refunded |
| Payment status Paid, Pending, Unpaid, Account, Complimentary, derived from payments | Partly | Partly | Docs and app: unpaid, partial, paid |
| Orders list cards: serial, code, type, status, customer, rider, time, method, payment status, total | Same | Built | |
| Filters: type, status, payment method, source, rider, date range | Partly | Partly | No date range; app has no method filter |
| Sorts: newest, oldest, serial up and down, amount | Missing | Missing | |
| Totals: orders, revenue, average order value, completed count | Partly | Built | |
| Bulk actions: Mark All Completed, Export CSV, Sync Complimentary | Partly | Partly | CSV export only, API only |
| Order detail drawer, Order Details tab with the order story | Partly | Partly | One view, no tabs |
| Cost Analysis tab: revenue, COGS, profit and margin per order, by ingredient, plus labour lines | Partly | Missing | Recipe cost is saved on each item |
| Payments tab: status, total, method and every payment record | Partly | Missing | |
| Order story: punched, reopened, edited, completed, each with user, role and time; item and money diff; reopen-and-edit count | Partly | Partly | Status events only, no item or money diff |
| Reopen as its own flow: REOPEN_ORDER, optional PIN, separate permissions to delete a line and lower a quantity | Differs | Differs | Docs and app: edit before payment, refund after |
| Complimentary order with its own permission | Later | Built | Docs S12 = Decide; app calls it staff meal |
| Place and complete in one step (PLACE_AND_COMPLETE_ORDER) | Missing | Missing | |
| Pending Orders screen: calendar and list, tiles for today, yesterday, 30 days, all time | Partly | API only | |
| Pending order reminder: badge in headers, red near closing, warning at logout | Missing | Missing | |
| Client-generated idempotency key on order create | Same | Built | |
| Tables: name, zone, capacity, status Available, Occupied, Reserved, Maintenance; four tiles | Partly | Partly | No Maintenance status |
| QR Table orders placed against a table | Same | Partly | No guest-facing page |

### Riders

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Permanent riders: contact, vehicle, charge per delivery, assigned vs completed counts | Same | Partly | No assigned vs completed counts |
| Temporary riders with a lifetime: one order, N orders, rest of today, N hours | Missing | Missing | |
| Temporary riders carry their own permissions (DUMMY_RIDER_VIEW, CREATE, EDIT, DELETE) | Missing | Missing | |
| Rider Vault: Issue, Return, Spend, Adjust, statement per rider | Same | Built | |
| Rider Reports | Same | Partly | Per-rider statement only |
| Rider App: assignments and delivery status | Same | API only | |

### Kitchen display, printing and devices

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Kitchen display reached by its own permission; can be a user's only access | Differs | Built | Docs decision 5: paired device, no login |
| Store-wide sound on a new Pending order, off by default | Same | Partly | App has a per-device toggle |
| Order timeout in minutes after which a Pending card turns red | Partly | Partly | App fixed at 8 and 15 minutes |
| One-shot sound when a card first turns red | Missing | Missing | |
| Kitchen display on a websocket; timeout colour worked out on the screen | Same | Built | |
| Printers set up on the desktop POS behind the PRINTERS permission | Partly | Missing | App prints with the browser only |
| Print server: admin stores the desktop's IP; tablets print through it | Differs | Missing | Docs use a print-bridge app on Android |
| Receipt branding: logo, footer QR for review or menu link, primary and secondary phone, paper width | Partly | Partly | No footer QR or second phone; app does not print the logo |
| Offline Orders queue on the POS with its own view permission | Partly | Partly | Queue exists; no permission |
| POS settings sync on next connection and are cached offline | Same | Built | |
| catalog/sync returns the whole menu with an ETag for POS caching | Partly | Partly | Cursor-based change pull instead of an ETag |
| Each surface gets a token with its own permission set | Same | Built | |
| Surfaces: admin, desktop POS, tablet app, kitchen display, rider app, website and mobile app | Same | Partly | Admin, POS and kitchen display built |

### Payments, charges, tax and finance

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Every payment method is also a finance account with a running balance | Same | Built | |
| Four defaults: Cash, EasyPaisa, JazzCash, Bank | Same | Built | |
| Add-on catalogue: uPaisa, SadaPay, NayaPay, HBL Pay, UBL Omni, MCB, Allied, NBP, Bank AL Habib, Soneri, Dubai Islamic | Missing | Missing | |
| Adding a method creates its account and syncs it to every active cashier | Same | Partly | App asks you to pick an account |
| An account with transaction history cannot be deleted | Same | Built | |
| Settle an order to Account, Complimentary or Unpaid | Partly | Partly | No Unpaid option |
| Part-paid orders; payment status derived from payments | Same | Partly | POS takes the full amount only |
| Finance Dashboard: total balance, Today In, Today Out, counts by source, recent activity with balance after | Missing | Missing | |
| Service charge as % or fixed, pre-filled, removable per order, zero disables | Partly | Partly | % per order type only |
| Delivery charge as % or fixed, pre-filled on the delivery order | Differs | Differs | Docs and app: fixed charge per zone |
| PRA e-IMS: sandbox or production, POS ID, access code, server-side token, counter and branch name | Partly | Partly | No access code or counter name |
| Tax rate linked to a finance account (16% cash, lower card rate); No Tax or 16% choice | Missing | Missing | |
| Order confirmation popup after each order, on by default | Missing | Missing | |
| Direct Unpaid Orders that skip the payment screen | Missing | Missing | |
| Pre-selected payment method; reopened orders open on their original method | Missing | Missing | |
| Cashier Drawer switch: own till account or admin accounts | Later | Partly | Docs Y3 = Decide; app always uses the drawer |
| Seeded chart of accounts with codes, types, normal side, opening balance; system rows protected | Differs | Missing | Docs Y25 = No |
| Journal Voucher | Differs | Missing | Docs Y25 = No |
| Combined Ledger | Same | API only | |
| Fixed Assets, Liabilities, Equity | Differs | Missing | Docs Y25 = No |
| Trial Balance and Balance Sheet | Differs | Missing | Docs Y25 = No |
| Transfers between accounts | Same | Built | |

### Inventory and recipes

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Kitchen and Warehouse system sections that cannot be removed; Warehouse is COGS Primary; custom sections with a slug | Partly | Partly | App creates Kitchen only |
| Items: name, auto SKU (like ADR-GE-9350), purchase category, base unit, minimum, active flag | Partly | Partly | SKU typed by hand; archive instead of active flag |
| Quantities read-only on the item screen | Same | Built | |
| Items CSV import and export | Same | Partly | Export is API only |
| Negative stock allowed and shown as short | Same | Built | App labels it negative |
| Units including custom ones (Pet12, Pet6); each conversion direction stored | Differs | Differs | Docs and app store one factor and work out the reverse |
| Recipe unit converted to the item unit automatically; picker offers compatible units | Same | Built | |
| Display units for weight, volume and counted items | Partly | Partly | No setting for counted items |
| Product recipes per variant deduct on sale | Same | Built | |
| Prep recipes with yield and cost per kg, feeding Production | Same | Built | |
| Stock Actions types: Goods Receipt, PO Receipt, Transfer, Waste, Adjustment, Stock Count, Opening Balance, Production | Partly | Partly | No PO Receipt or Opening Balance type |
| Statuses Draft, Awaiting approval, In transit, Posted, Voided | Partly | Partly | Docs and app: draft, posted, cancelled |
| Document number like GRN-000023, linked PO, line count, total value, created by | Partly | Partly | App numbers look like RCV-23 |
| Day lock; sales still deduct, cancellations still return stock | Same | Built | |
| Stock counting on or off | Same | Built | |
| Allow negative on manual movements; refusal shows the quantity on hand | Same | Built | |
| Return stock on cancellation, or record waste | Same | Built | |
| Stock deducted once, when the order is completed | Differs | Differs | Docs decision 1 and app deduct at Placed |
| Safety net job every 10 to 15 minutes, dated to the sale day, never twice | Differs | Missing | Docs say no safety net is needed |
| Unique index on (source_type, source_id, inventory_item_id) for sale deductions | Missing | Missing | |
| Stock is a movements ledger; current stock is a cache rebuilt from it | Partly | Partly | No rebuild task |
| Money is append-only too: account, customer and supplier ledgers with cached balances | Same | Partly | Ledgers are append-only; no rebuild task |
| RecalculateBalancesJob rebuilds cached balances for items, customers, suppliers and accounts | Missing | Missing | |
| Movements carry a posting date separate from created-at | Same | Built | |
| Demand: buckets Low, Critical, Out of stock; minus what is on order; split transfer vs buy | Later | Partly | Docs K24 = Decide |
| Deduction Health: safety-net status, run now, check one order, problem buckets, Retry | Partly | Partly | App shows a status list only |
| Stock Alerts and Reset Stock settings | Partly | Partly | Negative-stock alert only; no Reset Stock |
| Quantities in the base unit at full precision, converted only at the edges | Same | Built | |

### Purchasing, suppliers and expenses

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Suppliers: contact, phone, area, balance labelled To Pay, To Receive or Settled, items count, purchases count, CSV | Partly | Partly | No counts; label on detail page only |
| Purchase orders list with KPI tiles, filters and PDF export | Partly | Partly | No tiles, no PDF |
| Create, receive (writes a GRN), pay, each with its own permission | Partly | Partly | One purchasing permission instead of nine |
| Purchase Returns screen | Same | Built | |
| Supplier Ledger: Dr and Cr lines, running balance, linked to PO, Aging tab, manual adjustments | Partly | Partly | No manual adjustments |
| Supplier Insights: rank by purchased, paid, outstanding or name | Partly | Partly | Per supplier only |
| Supplier Payments | Same | Built | |
| Purchase Price History: bought, spent, paid on average, last price, average cost, difference, verdict | Partly | Partly | Raw price list only |
| Expenses: category, subcategory, method, source, filters, total, average, count, PDF and CSV | Partly | Partly | No export, no average |

### Attendance and payroll

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Attendance screens: Today, Sessions, Scan Log, Ledger, Enrolled, Reports, Leave, Holidays, Employee Rules, Defaults | Partly | API only | Leave, holidays and rules in docs P15 |
| Today counters: scans, currently in, checked out, not checked in, late | Missing | Partly | API has today's list |
| Fingerprint kiosk feeds payroll; enrol and revoke fingerprints | Partly | Partly | App has an enrolled flag only |
| Master switch: with rules off every scan is Present | Missing | Missing | |
| Business hours as the last fallback shift start; per-employee rules override defaults | Partly | Partly | |
| Late, Half day and Absent after N minutes, judged on the first scan | Partly | Partly | Docs and app: grace minutes and a late fine |
| Status decided at check-in only | Missing | Partly | |
| Overtime from shift end, only on a real clock-out; missing punch flagged | Missing | Missing | |
| Weekly offs never counted absent | Missing | API only | |
| No-scan day optionally absent; holidays, weekly offs and leave excluded | Missing | API only | App always counts it |
| Free allowances: first N lates, half days and absents forgiven | Missing | Missing | |
| Penalties per status: Fine only, Lose the day's pay, Both, Not charged | Partly | Partly | |
| Monthly fine cap on fines only | Missing | Missing | |
| Checkout gap with Already Marked; manual checkout; auto-close at business day end | Missing | Partly | Manual checkout only |
| Rule changes never rewrite saved days | Missing | Partly | |
| Payroll overview: employees, pending advances, month generated, outstanding advances | Missing | Missing | |
| Employees, Advances, Run Payroll, Ledger, Reports, Settings | Same | API only | No ledger or reports endpoint |
| Sync payroll to Expenses | Same | API only | |
| Salary by Actual Calendar Days or Fixed Divisor (26) | Same | API only | |
| Require fingerprint to close a shift | Same | API only | |
| Payroll run snapshots the divisor, fines and allowances | Partly | Partly | |

### Customers, loyalty and feedback

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Customer is a ledger account with a Khata No. and balance Settled or To Receive | Same | Built | |
| Fields, source, status Active, Pending approval or Deactivated, groups, CSV import | Same | Partly | No address form; source not shown |
| Credit: settle to Account; Customer Ledger, Payments, Insights, AR Aging | Same | Built | |
| Customer Account screen with CUSTOMER_ACCOUNT and SEND_ACCOUNT_BILL | Partly | Partly | Khata page exists; no send-bill action or permission |
| WhatsApp account messages: master toggle, auto-send, receipt image, logo, templates, manual, bulk, logs | Partly | Partly | Auto-send on payment only |
| Loyalty points: earn rules, redemption options, issued and redeemed | Same | Partly | One earn rule; no redeem button on POS |
| Regular discounts by recency tier; smallest window wins; exclusions and blocked list | Missing | Missing | |
| Vouchers: batches, personal codes per customer, public code with a usage limit | Later | Partly | Docs Y26 = Later; app has coupon promotions |
| Reviews: from tablet and website, tied to an order, 1 to 5 rating, filters incl. Pending | Missing | Missing | |
| Marketing: campaigns, campaign log, contacts, auto-send log | Same | Partly | No contacts or auto-send log screens |

### Settings, audit and storefront

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Store Profile: name, primary and secondary phone, address, printed on the receipt | Partly | Partly | One phone only |
| Store Management: link other stores and manage them from one dashboard | Partly | Partly | EasAlpha has branches inside one business |
| POS settings: Order Taker, Customer Fields, POS Notifications, Barcode Scanning | Partly | Missing | Docs mention a barcode scanner only |
| Settings as a typed key-value store per outlet with defaults and a version number | Differs | Differs | Docs and app: one JSON field per business |
| Security: Change Password, Signed-In Devices, Expense and Report PIN, Cashier PIN | Partly | Partly | No expense and report PIN |
| Website Config builder: identity, pages, slider, footer, delivery, SEO and 12 more screens | Partly | Missing | Docs S27 online ordering site |
| WhatsApp settings screen | Same | API only | |
| Notifications settings screen | Same | API only | |
| Plan screen | Same | API only | |
| Audit Logs: every create, update and delete, append-only, filters, entities, Search Insights, CSV | Same | Partly | App logs about 77 chosen actions |
| Every query scoped to the outlet from the token | Same | Built | Business from the token plus Row-Level Security |

### Reports

| PDF feature and behaviour | Docs | App | Note |
| --- | --- | --- | --- |
| Business Overview | Same | Built | |
| Grand Report: each payment method with count and share, Unpaid and Complimentary share, account receipts | Missing | Partly | Amounts only |
| Sales | Same | Partly | Charts, no detail table |
| Sales Calendar | Same | Partly | No calendar grid |
| Financial | Same | API only | Profit and loss |
| Products and Deals | Same | Built | |
| Category Report | Same | Built | |
| Order Takers | Same | Built | |
| Cashiers | Same | Built | |
| Cashier Till: orders taken vs money collected, In tills now until Day-End Settlement | Partly | Partly | Shift report only |
| Customers | Same | Built | |
| Customer Ledger | Same | Built | |
| AR Aging | Same | Built | |
| Operations | Missing | Missing | |
| Cancelled and Modified Orders | Same | Built | |
| Delivery Riders | Partly | Partly | Per rider only |
| Vouchers | Later | Missing | |
| Loyalty Points | Partly | Partly | Per customer only |
| Regular Discounts | Missing | Partly | App has a discounts report, not tiers |
| AI Pricing Analysis | Missing | Missing | Not in 01; the nearest is I10, sales insights with AI |
| Stock in Hand | Same | Built | |
| Daily Stock Sheet | Same | Built | |
| Stock Ledger | Same | Partly | Per item only |
| Consumption | Same | Built | |
| Waste and Adjustments | Same | Built | |
| Actual vs Theoretical | Same | Partly | Count lines only |
| Valuation and COGS | Same | Partly | |
| AI Stock Forecast | Later | Partly | Rule-based forecast |
| Deduction Health | Partly | Partly | |
| Purchase Price History | Partly | Partly | |
| Date range on every report; export to CSV and PDF | Partly | Partly | No PDF anywhere |

---

## 7. Extras: in the EasAlpha docs, not in the PDF

The EasAlpha docs hold 88 features the PDF does not have. None are removed. They came from two earlier sources: **Blueprint** is the first PDF, "Restaurant POS Product Overview and Build Blueprint" (7 Oct 2026); **ArfaPOS audit** is the review of 64 ArfaPOS screenshots (8 Oct 2026). Six rows (11 features in `01`) are parked as Later.

Where an extra conflicts with the PDF, the PDF behaviour comes first and the extra sits beside it. For example, refunds stay, but completed orders are reopened the PDF way.

### Selling and orders

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| Modifier groups for size, spice and extras | S3, M4 | Blueprint | Karahi and BBQ orders need options that variants alone cannot hold |
| Split bill by amount or by item | S4 | Blueprint | Tables of friends pay separately |
| Hold and recall an order | S5 | Blueprint | Park an order while the customer decides |
| Discount limit per role, manager PIN above it, both names saved | S6, P11 | Blueprint | Stops large discounts without a manager present |
| Void with reason and manager PIN; nothing is deleted | S7 | Blueprint | Theft control for cash counters |
| Refund after payment, manager only | S8 | Blueprint | A paid order is reversed, never edited |
| Open item, price override, reprint marked DUPLICATE, all logged | S9 to S11 | Blueprint | Real counters need them; logging keeps them honest |
| Repeat a customer's last order by phone number | S13 | Blueprint | Regulars order the same thing |
| Keyboard shortcuts F1 to F9 and high-contrast mode | S14, S15 | Blueprint | Fast counters and bright shops |
| Needs-attention list for records the server rejects | S16 | Blueprint | Offline sales are never lost silently |
| Kitchen stations with routing, KOT per station, CHANGED and CANCELLED tickets | S17 to S19 | Blueprint | BBQ, Karahi and Tandoor work as separate stations |
| Token and order-ready screen | S20 | Blueprint | Takeaway pickup without shouting numbers |
| Floor plan, merge and move tables, waiter assignment | S22 | Blueprint | Dine-in restaurants |
| Dine-in as a fourth order type | S2 | Blueprint | Tables, waiters and service charge |
| Delivery zones with charge and time | S23 | Both | Delivery fee by area |
| Rider status steps; Delivered never closes the order | S26 | ArfaPOS audit | Cash on delivery is confirmed at the till |
| Customer queue display on a second screen | S30 | Blueprint | Shows the order being built |
| Phone orders with caller ID | S31 | Blueprint | Phone is a big delivery channel in Pakistan |
| Catering pre-orders with advance payment | S32 | Blueprint | Bulk orders for events |
| Course firing for dine-in | S33 | Blueprint | Starters before mains |
| Foodpanda orders with commission | S34 | Blueprint | Most restaurants also sell on Foodpanda |
| Reservations with deposit and reminders | S35 | Blueprint | Weekend dinner bookings |
| Self-order kiosk, waitlist, cloud kitchen brands | S36 to S38 | Blueprint | Parked as Later |

### Menu

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| Time-based menus, such as breakfast hours | M1 | Blueprint | Different menus at different times |
| Prices by order type and by branch | M5 | Blueprint | Delivery often costs more than dine-in |
| Allergen and dietary tags | M6 | Blueprint | Needed for UK and Gulf customers |
| Combos with choices | M8 | Blueprint | "Any drink" inside a deal |
| Happy hours and time rules on promotions | M9 | Blueprint | Off-peak offers |
| Menu import from Excel and CSV, plus the ArfaPOS JSON export | M11 | Both | Fast switch-over from ArfaPOS |
| Menu change approval for chains; menu import from a photo with AI | M13, M14 | Blueprint | Parked as Later |

### Money and tax

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| Shift open with opening cash, cash in and out, blind close, over or short | Y1 | Blueprint | Cash control per cashier |
| Z report per shift | Y2 | Blueprint | End-of-shift print the owner checks |
| One open shift per cashier; forced close at day end | Y4 | ArfaPOS audit | ArfaPOS had 146 sessions never closed |
| Day close with a day lock and manager reopen | Y5 | Blueprint | A closed day cannot change |
| Cash rounding to Rs 5 or Rs 10 | Y9 | Blueprint | Small change is scarce |
| Raast QR and card terminal link | Y10, Y11 | Blueprint | Bank-app payments and card machines |
| Tips shared to staff in payroll | Y12 | Both | Common in sit-down restaurants |
| FBR, SRB and KPRA as well as PRA; tax per item, inclusive or exclusive | Y14 | Blueprint | Restaurants outside Punjab and FBR-registered ones |
| Monthly tax filing report | Y15 | Blueprint | Monthly sales tax return |
| Expense receipt photo, petty cash from the drawer, prompt at shift close | Y16 | Both | Petty cash is the usual leak |
| Overheads (labour, gas, rent) as cost per order | Y17 | ArfaPOS audit | True cost per order without making them stock items |
| Customer credit limit on khata | Y18 | Both | Stops unlimited credit |
| Advance payments and deposits in the final bill | Y21 | Blueprint | Catering and reservations |
| Daily reconciliation and integrity check of the money ledger | Y22 | ArfaPOS audit | Catches unposted or double-posted payments |
| QuickBooks and Xero export | Y24 | Blueprint | For the accountant |
| Gift cards and corporate monthly accounts | Y26, Y27 | Blueprint | Parked as Later |

### Stock and purchasing

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| Recipe coverage meter; a product cannot go live without a recipe | K11 | Blueprint | Stock is only right when every product has a recipe |
| Food cost percent per item against a target, with waste % per line | K12 | Blueprint | Shows which dishes lose money |
| Flag for a recipe line using 10 times its usual amount | K19 | ArfaPOS audit | Catches wrong-unit recipes |
| Rule-based usage forecast with a budget cap | K24 | Blueprint | Reorder help before the AI forecast |
| Purchase returns settled as credit note or cash refund | K26 | ArfaPOS audit | Matches how suppliers actually settle |
| Items sold by weight with a scale | K29 | Blueprint | Meat and sweets by the kg |
| Batch and expiry dates with alerts | K30 | Blueprint | Dairy and sauces expire |
| Stock count on a phone | K31 | Blueprint | Count while walking the store |
| Import stock items from the ArfaPOS Items export | K32 | Blueprint | Fast switch-over |
| Supplier bill photo scan with AI | K28 | Blueprint | Parked as Later |

### People

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| One built-in walk-in customer | P5 | ArfaPOS audit | ArfaPOS had duplicate walk-in records |
| Birthday offers; campaign opt-in and STOP | P6 | Blueprint | WhatsApp rules require opt-in |
| Seven roles (Owner, Manager, Cashier, Waiter, Kitchen, Rider, Accountant) and custom roles | P7 | Blueprint | Starting points for a new restaurant |
| PIN login on paired devices; deactivating a user signs them out everywhere | P7, P9 | Blueprint | Staff turnover is high |
| WhatsApp invite when staff are added | P9 | Blueprint | Staff join from their phone |
| Commission rules for waiters, order takers, cashiers and riders | P12 | Both | Common pay structure |
| Opening and closing checklists | P13 | Blueprint | Same routine every shift |
| Selfie attendance as a fingerprint alternative | P14 | Blueprint | Branches without a device |
| Departments, designation, CNIC and salary components | P17 | Both | Pakistani payroll records |
| Bonuses, tips and commissions in the payroll run; payslips | P19 | Both | One pay run for everything |

### Reports and insight

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| Dashboard compares today with the same day last week; shows recipe coverage and tax queue | I1 | Blueprint | The owner sees trend and problems at once |
| Business overview against yesterday, last week and last month | I2 | ArfaPOS audit | Seen in the ArfaPOS screenshots |
| Reports by hour, voids and discounts | I3 | Blueprint | Staffing and theft checks |
| Menu profitability | I7 | Blueprint | Which dishes earn the most |
| Scheduled reports by WhatsApp or email | I8 | Blueprint | Owners read reports on the phone |
| Branch comparison, central menu with branch prices, central kitchen, franchise mode | I9 | Blueprint | Chains with several branches |
| Sales insights in Urdu with AI | I10 | Blueprint | Parked as Later |

### Platform and devices

| Extra in EasAlpha docs | Docs ref | Source | Why it was added |
| --- | --- | --- | --- |
| Signup with WhatsApp OTP or email; setup checklist | F1, F2 | Both | Restaurants sign up without a salesperson |
| Plans, 40-day trial, invoices, grace period, read-only mode; Paddle, JazzCash, EasyPaisa | F4 | Blueprint | EasAlpha is sold by subscription |
| WhatsApp receipts, order status, daily summary, owner alerts; SMS and email fallback | F5 | Blueprint | WhatsApp is how owners and customers talk |
| Super admin with support login on owner approval | F6 | Blueprint | EasAlpha's own support team |
| One formatter for money, dates and phones | F8 | ArfaPOS audit | ArfaPOS showed the same values in different formats |
| Setup tour | F9 | Blueprint | Onboarding without training |
| English and Urdu with right-to-left; currency and tax per country | F10 | Blueprint | Pakistan first, then UK and Gulf |
| ESC/POS printing, cash drawer kick, barcode scanner | F11 | Blueprint | Standard restaurant hardware |
| Row-Level Security, UUID ids and an isolation test suite | F12 | Blueprint | One database for every restaurant must never leak |
| Device pairing with a one-time code; remote sign-out | 05 | Blueprint | Only known tills can sell |
| Encrypted till data, 7-day clearing, 48-hour offline warning, till serials like T1-059 | 04 | Blueprint | Safe offline selling |
| Local offline hub so tills and kitchen talk without internet | 04 | Blueprint | Load-shedding and internet cuts |
| Customer display on a second screen | 05 | Blueprint | Customer sees the total being built |
| Hosting in AWS Bahrain with Kamal, Sentry monitoring, daily backups | 02 | Blueprint | Closest region to Pakistan and the Gulf |
| Open API, webhooks, reseller program, WhatsApp order bot | F14, F15, F17 | Blueprint | Parked as Later |

---

## 8. Testing

No phase is called done until its tests pass and its gate is met. On 9 Oct 2026 the app had 135 RSpec examples in 25 spec files (137 on 10 Oct), far fewer than one request spec per endpoint.

Rules from the PDF:

1. Migrations and model specs first, then the API, then the screens.
2. Every endpoint gets a request spec for the happy path, the permission denial and one edge case.
3. Run the tests and the linter before a phase is reported done.
4. Screens get Vitest and Testing Library tests.
5. Choices the spec does not settle go in `docs/DECISIONS.md`.

| Phase | Scope | Gate that must pass |
|---|---|---|
| 1 Foundation | Outlets, users and staff types, the 58 permissions and 3 presets, token, settings store, business-day helper, admin shell | Login and permissions work end to end |
| 2 Catalog | Menus, categories, products, variants, favourites, deals, promotions, quick add, images, import and export | The menu renders in the POS |
| 3 Orders and POS | Idempotent orders, types and sources, status machine, charges, payments, order story, reopen, tables, kitchen display, offline POS | The first order is paid |
| 4 Inventory | Items, units, recipes, consumables, stock documents, movement ledger, deduction job, safety net, Deduction Health, day lock, Demand | Stock deducts on sale |
| 5 Purchasing and money | Suppliers, POs, ledgers, price history, customers and credit, payment accounts, expenses, chart of accounts, journals, trial balance, balance sheet | The supplier ledger ties out |
| 6 People and time | Cashier sessions and day-end settlement, order takers, riders and vault, employees, fingerprint, attendance rules, payroll | A payroll run matches the expected figures |
| 7 Reports, customers, AI | The 27 reports, loyalty, regular discounts, vouchers, reviews, WhatsApp, storefront, audit logs, AI pricing and forecast | The Grand Report ties out |

Phase 3 acceptance check, run in a real browser:

- [ ] Take a walk-in order on the POS
- [ ] Pay it by cash
- [ ] See it on the kitchen display
- [ ] Reopen it and add an item
- [ ] The order story shows the item change and the amount change

Run again later: the **audit** check (every endpoint that writes stock or money, called twice with the same payload and cut off halfway, stays correct) and the **parity** check (every screen against `SPEC.md`: missing, partial, extra).

Kept from the EasAlpha docs: the 8 offline scenarios in `04`, the tenant isolation suite, the Playwright browser run.

---

## 9. PDF gaps and open questions

What `SPEC.md` leaves unconfirmed, filled from `01` to `08` where they cover it:

- One of the 8 Orders permissions has no name; the 4th Suppliers permission (Record Supplier Payment) has no code
- Exact columns and filters for 22 of the 27 reports
- The finance screens below the dashboard, several settings screens, and the Marketing screens, which live in the POS
- Flows never run in the review: posting a stock count, Day-End Settlement, a payroll run, the purchase order cycle

The PDF's 5 questions, answered:

| Question | Answer |
|---|---|
| One outlet or several? | Several, from the start |
| PRA e-IMS filing or display only? | Filing, plus FBR and the other provinces as extras |
| Web app or installed POS? | Installable web app, as the PDF's frontend plan says |
| Fingerprint device? | ZKTeco |
| Double-entry accounting in version one? | Yes; decision 6 is replaced |

Open questions for the owner:

1. **Outlet or branch?** Recommendation: keep the branch name and treat a branch as the PDF's outlet; renaming every table changes nothing a user sees.
2. **Rider app and order-taker tablet technology.** Recommendation: installable pages inside the web app, like the POS.
3. **Commits.** The PDF asks for a commit per logical change; the project folder is not a git repository yet.
