# Servio: product ready (11 Oct 2026)

Every feature, screen and behaviour in `docs/SPEC.md` (the ARFAPOS Clone spec, the top-priority requirement) is built, tested and committed, phase by phase, with the SPEC's sidebar menu. Nothing that existed before was removed; the Servio extras stay and are listed with their reasons in `docs/PDF-ALIGNMENT.md` section 7.

## What is here

| Part | Where | What it is |
|---|---|---|
| API | `servio-api/` | Rails 8, PostgreSQL 16, row-level security, Solid Queue jobs, own JWT login with per-user permissions |
| Admin panel, POS, kitchen display, order-taker tablet, rider app, storefront | `servio-web/` | Next.js 15. The POS, tablet and rider app are installable web pages; the storefront is `/store/<slug>` |
| Desktop POS | `servio-desktop/` | Electron wrapper with ESC/POS printing and the print server tablets print through |
| WhatsApp gateway | `servio-whatsapp/` | Links any WhatsApp number by QR code and sends notifications from it |

## The seven SPEC phases

| Phase | Gate | Result |
|---|---|---|
| 1 Foundation | Login and permissions | 58 SPEC permission codes, presets, surface rule, staff types, user sessions, business-day window, settings store with version, audit of every change |
| 2 Catalog | Menu renders in the POS | Images, product discounts, PCT codes, Arrange, Quick Add Menu, consumables per order type, Display Settings, Product Codes, Download and Import |
| 3 Orders and POS | First order paid | SPEC statuses, order story with diffs, reopen flow with its permissions and PIN, Pending Orders, Direct Unpaid, part payment, confirmation popup, dashboard cards and pills, KDS alerts |
| 4 Inventory | Stock deducts on sale | Deduction at completion, never twice, safety-net job, Deduction Health with Retry, document register with nine types and five statuses, Demand buckets, Reset Stock, system sections, auto SKU, conversions, stock reports |
| 5 Purchasing and money | Supplier ledger ties out | Supplier Dr/Cr ledger with adjustments and ranking, PO tiles, payments and the nine PO permissions, Price History verdicts, expenses export, wallet catalogue, tax per account, charges as % or fixed, Finance Dashboard, double entry (chart of accounts, journal vouchers, trial balance, balance sheet, fixed assets, liabilities, equity) |
| 6 People and time | Payroll run matches | Attendance rules engine with every SPEC rule, scan log and fingerprint enrolment, payroll with snapshot and all eight screens, temporary riders with lifetimes and permissions, Rider Reports and the rider app, Cashier Till with Day-End Settlement, My Till |
| 7 Reports, customers and AI | Grand Report ties out | All 27 report screens with CSV and PDF, regular discount tiers, vouchers, loyalty redemption options, reviews, WhatsApp account notifications, customer screens, Website Config with the storefront, AI Pricing and AI Stock Forecast |

## Tests

| Suite | Count |
|---|---|
| API request specs (`bundle exec rspec`) | 211 examples, 0 failures |
| Web unit tests (`pnpm test`, Vitest) | 272 tests, 0 failures |
| Browser gate (`node scripts/e2e-web.mjs`, Playwright against the production build) | 177 steps, 0 failures, all seven phase gates |
| Type check and lint (`pnpm exec tsc`, `pnpm lint`, `rubocop`) | clean |
| Security scan (`brakeman`) | only the Rails 8.0 end-of-support notice |

## How to run

```bash
docker start servio-pg                                   # PostgreSQL 16 on port 5434
cd servio-api && bin/dev                                 # API on 3001 with the job worker
cd servio-web && pnpm build && pnpm start -p 3000        # admin, POS, kitchen, rider app, storefront
cd servio-desktop && npm run dist                        # Windows and Linux installers for the desktop POS
```

Demo login: demo@servio.pk / password123. Manager PIN 9999, cashier PIN 1111. Pair a till, a tablet, a kitchen display or a rider phone from Settings, Devices.

## Where to read more

- `docs/SPEC.md`: the requirement. `docs/PDF-ALIGNMENT.md`: every SPEC line against what is built, and the 88 extras with reasons.
- `docs/BUILD-LOG.md`: the phase table with test counts. `docs/DECISIONS.md`: every choice made where the SPEC left room.
- `docs/api-reference.md`: endpoints by phase. `docs/RUNBOOK.md`: operations.

## Left for later (not in the SPEC, or needing outside services)

- A real LLM behind the AI reports: the rules engine fills the same payload today.
- WhatsApp sends either from a phone linked by QR (run `servio-whatsapp/`, then scan in Settings, WhatsApp) or through the Meta Cloud API with credentials; with neither, messages are logged, not sent.
- PRA e-IMS filing uses the configured sandbox; production needs the PRA registration.
- The opening and closing checklist screen under Settings is a Servio extra still marked Soon.
