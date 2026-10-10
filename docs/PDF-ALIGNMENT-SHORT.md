# PDF Alignment, Short

Date: 10 Oct 2026. Live copy: https://claude.ai/code/artifact/7e42cc18-71b7-4a3a-a979-7d9bd8fb2b4a. Detail: `PDF-ALIGNMENT.md`.

## Rules and numbers

`SPEC.md` (the PDF) is the requirement. Every PDF feature, screen, menu item and behaviour must exist in Servio and work the same way. Where the Servio docs or the app differ, the PDF wins. Servio extras stay. Name and Material Design 3 look stay Servio's own. Tools that already do the same job stay (Solid Queue, own JWT login, two folders); Zod and Vitest are added for forms and tests.

| PDF features: 218 | Servio docs before 10 Oct | App today |
|---|---|---|
| Match | 86 | 55 |
| Partly | 65 | 90 |
| Differ | 19 | 11 |
| Parked as Later | 7 | 0 |
| API only, no screen | 0 | 15 |
| Missing | 41 | 47 |

Done on 10 Oct 2026: `01` to `08` now follow the PDF; old text in `archive/before-spec-2026-10-10/`.

## Conflicts: Servio changes to the PDF way

| Topic | PDF (adopted) | Servio before |
|---|---|---|
| Stock deduction | When the order is completed | At Placed |
| Lost deductions | Safety-net job every 10 to 15 min, unique index, Deduction Health with Retry | None |
| Accounting | Chart of accounts, journal voucher, fixed assets, liabilities, equity, trial balance, balance sheet | P&L and export only |
| Permissions | 58 codes per user, 3 presets, Software/App/Both badge, in the token, apply at next sign-in | 15 codes per role, apply at once |
| Business day | Start and end, default 06:01 to 02:01 | End only, 04:00 |
| Order statuses | Pending, Preparing, Ready, Dispatched, Completed, Cancelled | 11 states |
| Payment status | Paid, Pending, Unpaid, Account, Complimentary | unpaid, partial, paid |
| Reopen | Completed order reopened with REOPEN_ORDER, PIN, separate delete-line and lower-qty permissions; story shows item and money change | Edit before payment, refund after |
| Kitchen display | Staff login with only the KDS permission | Paired device |
| Staff types | Admin Staff, Cashiers, Order Takers, Riders, Employees, each its own screen | One staff list |
| Order consumables | Per order type and per variant, with copy | Per order type |
| Delivery charge | % or fixed, removable per order | Fixed per zone |
| Unit conversions | Both directions stored | One way |
| Settings | Key-value table per outlet with version | One JSON field |
| POS | Installable web app at /pos; tablets print via the desktop's IP | Tauri desktop app, print bridge |
| Build order | 7 PDF phases | 4 phases |

## What to build, by PDF phase

Status 11 Oct 2026: all seven phases were built and their gates passed; see `docs/BUILD-LOG.md` and `docs/PRODUCT-READY.md`.

Only what is not built yet. Each phase ends with its PDF gate and the PDF test rule (per endpoint: happy path, permission denial, one edge case).

| Phase | Build | Gate |
|---|---|---|
| 1 Foundation | 58 per-user permissions, 3 presets, Select all, surface badges, permission editor, permissions in the token; separate staff screens and User Sessions; business-day start and end; settings table with version; sidebar in the PDF layout (4 standalone + 12 groups); audit log of every create, update, delete | Login and permissions |
| 2 Catalog | Image upload; product discount % or Rs; PCT code; category subtitle; drag-and-drop Arrange; deal favourite; Quick Add Menu; consumables per variant with copy; Download Menu, Import JSON, Display Settings, Product Codes screens | Menu renders in POS |
| 3 Orders and POS | PDF statuses and payment statuses; permission per order type; customer required per type; reopen flow; order story with diffs; 3-tab order drawer (Details, Cost Analysis, Payments); date-range filter and sorts; Mark All Completed, Sync Complimentary; Pending Orders screen and reminder; table Maintenance status; settle to Unpaid; part payment on POS; order behaviour settings; printers screen and print server; KDS timeout setting and red-card sound; receipt footer QR and second phone; OFFLINE_ORDERS permission; catalog ETag | First order paid |
| 4 Inventory | Deduct at completion; safety-net job, unique index, rebuild task; Deduction Health run-now, one-order check, Retry; Warehouse system section, COGS Primary, slugs; auto SKU, active flag, purchase category; both-way conversions; count display unit; PO Receipt and Opening Balance types; Awaiting approval, In transit, Voided; GRN-000023 numbers; Demand buckets and transfer-vs-buy; Stock Alerts, Reset Stock; full-precision quantities; Stock Ledger, Actual vs Theoretical, Valuation and COGS screens | Stock deducts on sale |
| 5 Purchasing and money | Supplier counts and To Pay / To Receive label; PO tiles and PDF; 9 PO permissions; inline supplier and item create; Dr/Cr ledger linked to PO with manual adjustments; Supplier Insights ranking; Price History screen with verdicts; expenses export and average; wallet and bank catalogue; method creates its account; tax rate per account; Finance Dashboard; Combined Ledger screen; chart of accounts, journal voucher, fixed assets, liabilities, equity, trial balance, balance sheet; service charge fixed option; delivery charge % or fixed | Supplier ledger ties out |
| 6 People and time | Cashier Till report with In tills now; My Till; order-taker tablet; temporary riders with permissions; rider counts and Rider Reports; rider app; attendance screens (Today, Sessions, Scan Log, Ledger, Enrolled, Reports, Leave, Holidays, Rules, Defaults); fingerprint scan intake and enrolment; rules engine (master switch, thresholds, overtime, weekly offs, no-scan, allowances, penalties, fine cap, checkout gap, auto-close, snapshot); payroll overview, ledger, reports, settings screens | Payroll run matches |
| 7 Reports, customers, AI | Grand Report shares, Sales table, Sales Calendar grid, Financial, Operations, Delivery Riders, Vouchers, Loyalty Points, Regular Discounts, AI Pricing, AI Stock Forecast; CSV and PDF export on every report; loyalty redemption; regular discount tiers; voucher batches; reviews; WhatsApp templates, manual and bulk send; Customer Account send bill; Website Config and storefront; WhatsApp, Notifications, Plan screens; audit log date and actor filters, Search Insights, export | Grand Report ties out |

## Extras kept, open questions

88 Servio features not in the PDF stay: till controls (modifiers, split bill, hold, void and refund with PIN, open item, price override, shortcuts); kitchen stations and token screen; floor plan, reservations, catering, course firing; delivery zones, rider status, phone and Foodpanda orders; time menus, prices per order type, allergen tags, combos with choices, menu import; shifts with blind close, Z report, day close and lock; cash rounding, Raast, tips, FBR/SRB/KPRA tax, monthly tax report; food cost %, recipe coverage, 10x flag, expiry, sold by weight, phone stock count; walk-in customer, birthday offers, campaigns, commissions, checklists, selfie attendance; scheduled reports, branch comparison, menu profitability; signup, trial and billing, super admin, WhatsApp alerts, Urdu, device pairing, offline hub, isolation tests. Reasons per item: `PDF-ALIGNMENT.md` section 7.

Open questions:

1. Keep the name branch for the PDF's outlet? Recommended: yes.
2. Rider app and order-taker tablet as installable web pages like the POS? Recommended: yes.
3. Make the project a git repository so each change is committed, as the PDF asks?
