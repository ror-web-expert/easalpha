# Phase 4: Inventory (started 10 Oct 2026)

Gate (SPEC): stock deducts on sale.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | Deduct at completion | The till deducts once, when the order is completed; edits after completion re-deduct the difference; a refund returns stock or records waste by the Return stock on cancellation setting | recipes and safety-net specs |
| 2 | Never twice | Unique index on sale movements per order line, item and section; movements merged per item; the deduction skips what already moved | spec |
| 3 | Safety net | `StockSafetyNetJob` every 10 minutes finds completed orders whose stock never moved and deducts them dated to the sale day; run on demand; `safety_net_runs` for the status | spec |
| 4 | Deduction Health | Safety-net status, buckets, one-order check with its movements, Retry | spec |
| 5 | Rebuild | `RecalculateBalancesJob` and `POST /stock/rebuild_balances` rebuild stock levels, account, customer and supplier balances from the ledgers | spec |
| 6 | Sections | Kitchen and Warehouse system sections, Warehouse COGS Primary, slugs, custom sections | spec |
| 7 | Items and units | Auto SKU (ADR-GE-9350), active flag, purchase category; conversions stored in each direction, custom pairs | spec |
| 8 | Document register | Nine types incl. PO Receipt and Opening Balance; statuses Draft, Awaiting approval, In transit, Posted, Voided; numbers per type like GRN-000023; posting date behind the day lock; submit, approve, dispatch, receive | spec |
| 9 | Demand | Buckets Low, Critical, Out of stock; minus what is on order; transfer vs buy | spec |
| 10 | Reset, alerts, precision, reports | Reset Stock through an adjustment with a PIN; low-stock alert; quantities at full precision (numeric 20,9); Actual vs Theoretical; Valuation & COGS | spec |
| 11 | Web | Stock Actions register with the new types, statuses and posting date; Items; Sections; Units with conversions; Inventory Settings with Stock Alerts, Reset Stock and Rebuild; Demand buckets; Deduction Health with run-now, order check and retry; Stock Ledger, Actual vs Theoretical and Valuation & COGS screens; "short" for negative stock | Vitest; Playwright |
| 12 | Gate | A paid order deducts stock; Playwright; suites; build log | |
