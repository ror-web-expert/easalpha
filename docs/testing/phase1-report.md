# Phase 1 test report

Updated as each sprint completes. Automated tests are RSpec request and model specs in `easalpha-api/spec`. The manual-style check is `scripts/smoke/phase1.sh`, which drives the live API with curl the way a tester would click through the app.

| Date | Sprint | Automated | Smoke script | Notes |
|---|---|---|---|---|
| 9 Oct 2026 | 1 Tenancy and login | 34 passed, 0 failed | 13 of 13 | Tenant isolation shared example on staff, roles, branches, devices; Row-Level Security proven with a raw connection as the app role |
| 9 Oct 2026 | 2 Menu | 46 passed, 0 failed | 11 of 11 | Import preview rejects bad rows and reports them; ArfaPOS JSON import updates by SKU |
| 9 Oct 2026 | 3 Orders and kitchen | 59 passed, 0 failed | 19 of 19 | Totals checked by hand: 2 x (45,000 + 2,000) + 8,000 = 102,000 subtotal, 16,320 tax, 118,320 total |
| 9 Oct 2026 | 4 Customers and tables | 68 passed, 0 failed | 12 of 12 | Walk-in record is unique per business; occupied table cannot be deleted |
| 9 Oct 2026 | 5 Payments and receipts | 78 passed, 0 failed | 12 of 12 | Rounding, change, split, khata limit, refund approval and insert-only ledger all covered |
| 9 Oct 2026 | 6 Shifts and day close | 83 passed, 0 failed | 9 of 9 | Blind close hides the expected figure from the cashier; drawer settles to company cash |
| 9 Oct 2026 | 7 Tax, sync, ledger | 91 passed, 0 failed | 14 of 14 | Offline batch of shift, order with payment, bad product, cash out and close: 4 accepted, 1 rejected into needs attention, re-push all duplicates |
| 9 Oct 2026 | 8 Reports | 95 passed, 0 failed | - | Dashboard and 13 report endpoints checked against hand-computed totals |
| 9 Oct 2026 | 9 Billing and platform | 101 passed, 0 failed | - | Trial lifecycle, Paddle webhook, support access approval, big-void alert |
| 9 Oct 2026 | 10 Hardening | 105 passed, 0 failed | 87 of 87 | Exports produce CSV with a UTF-8 BOM; Brakeman clean apart from the Rails 8.0 end-of-support notice; feature flags global and per business; test database truncated after leftover rows from an interrupted run skewed a count |
| 9 Oct 2026 | 11 Stock foundation (Phase 2) | 111 passed, 0 failed | phase2 54 of 54 | Weighted average checked by hand: 10 kg at Rs 500 then 10 kg at Rs 700 gives Rs 600 per kg (60 minor per gram); count of 92 against 100 posts -8; cancelled receipt reverses to zero; the ledger trigger rejects UPDATE and DELETE; the trigger is applied by a helper because schema.rb cannot carry it and the local pg_dump (12) cannot dump a PostgreSQL 16 structure |
| 9 Oct 2026 | 12 Recipes and deduction | 115 passed, 0 failed | phase2 78 of 78 | Checked by hand: marinade 1 kg chicken at Rs 500 plus 110 ml oil at Rs 0.40 costs Rs 544; a 5 kg batch moves 5 kg chicken and 550 ml oil out and 5 kg marinade in at Rs 54.40 per 100 g; a burger of 150 g marinade and one bun costs Rs 106.60, 23.7 percent of Rs 450; two burgers deduct 300 g chicken, 2 buns and 1 box and the void returns all three |
| 9 Oct 2026 | 13 Suppliers and purchasing | 119 passed, 0 failed | phase2 104 of 104 | Checked by hand: PO of 10 kg chicken at Rs 520 and 200 buns at Rs 22 totals Rs 9,600; receiving 6 kg at Rs 530 makes the order partial, the balance Rs 3,180 and the average Rs 530 per kg; receiving the rest brings the balance to Rs 9,660; a Rs 5,000 cash payment leaves Rs 4,660 owed and posts -5,000 to the cash account; a 10-bun credit note lowers the balance, a 5-bun cash refund posts +Rs 100 to cash; a cancelled receipt reverses stock and balance |
| 9 Oct 2026 | 14a Expenses and delivery | 122 passed, 0 failed | phase2 130 of 130 | Checked by hand: Rs 3,500 gas bill posts -3,500 to cash and a void reverses it; rent Rs 30,000 per month allocates Rs 1,000 to one day and labour Rs 50 per order; a Phase 5 DHA address quotes Rs 150; a rider picking up moves the order to dispatched and delivering leaves it open; float 2,000 minus 300 petrol minus 200 returned leaves 1,500, settlement expects 1,500 plus the COD cash and a Rs 10 shortfall raises an alert |
| 9 Oct 2026 | 14b QR ordering and scheduled reports | 125 passed, 0 failed | phase2 152 of 152 | A card for a disabled branch shows no menu; a guest order of a burger with extra hot and two chai totals Rs 730.80 and creates no kitchen ticket until the cashier accepts; adding to a running order marks it pending again and only the new line is sent; reject voids and frees the table; the weekly schedule lands on a Monday in Asia/Karachi; the sweep enqueues one job per due schedule |
| 9 Oct 2026 | 15 Loyalty, campaigns, reservations, commissions, checklists | 129 passed, 0 failed | phase2 173 of 173 | Rs 1,044 paid earns 10 points at Rs 100 per point; redeeming 100 points on a Rs 160 bill is refused by the 50 percent cap, 60 points give Rs 60 off and come back on void; a campaign to two customers sends one and skips the one not opted in; a second booking on the same table at an overlapping time is refused; waiter 2 percent and order taker Rs 5 per order add up |
| 9 Oct 2026 | 16 Finance, Foodpanda, branches | 132 passed, 0 failed | phase2 186 of 186 | Two sales and a Rs 100 expense: ledger shows the postings, the day reconciles, integrity passes until a posting is lost and then names the payment; P&L nets Rs 980 sales, Rs 40 cost of goods and Rs 100 expenses to Rs 840; a signed Foodpanda order of a burger plus an unknown combo lands as a placed delivery order with 25 percent commission, a replay creates nothing, a bad signature is refused, a cancellation voids |
| 9 Oct 2026 | 17 Payroll and attendance | 135 passed, 0 failed | phase2 205 of 205 | Checked by hand: 10:50 check-in against a 10:00 shift with 15 minutes grace is 35 minutes late and fined Rs 200; filling 1 to 8 September gives present, present, leave, leave, absent, absent, absent with Sunday skipped; Rs 26,000 base with 2 absences on the fixed-26 rule deducts Rs 2,000; a Rs 3,000 advance with Rs 1,000 instalments leaves Rs 2,000 after one payroll; a mid-month joiner gets half the base |
| 9 Oct 2026 | 18 Catering pre-orders | 136 passed, 0 failed | phase2 210 of 210 | 20 burgers for a date three days out: placed, absent from the kitchen list, visible under pre-orders, a Rs 3,000 advance leaves it partial, moving it to 90 minutes out puts it on the kitchen screen and the due job alerts once |

How to run:

```
cd easalpha-api && bundle exec rspec
cd easalpha-api && bin/rails s -p 3001 &
scripts/smoke/phase1.sh http://localhost:3001
scripts/smoke/phase2.sh http://localhost:3001
```

## Web app check, 9 Oct 2026

Browser run with Playwright (script `scripts/e2e-web.mjs`, run from a folder with `npm i playwright`, Chrome installed): 40 of 40 steps passed, 0 console errors, 0 failed API requests.

- Admin: login as the demo owner, then all 30 admin pages opened without errors (dashboard, orders, 8 menu pages, 4 customer pages, tables, staff, roles, devices, shifts, day close, tax invoices, accounts, sync, reports, 4 settings pages, audit, stock placeholder).
- Till: paired a fresh till with its 6-digit code, logged in with the cashier PIN, chose the Burgers category, added a Zinger Burger, pressed F5; the order appeared on the server as open.
- Kitchen: paired a kitchen screen, logged in with a kitchen PIN, was routed to the kitchen display and saw ticket #1 with the burger and Start and Bump buttons. Token screen rendered.
- Found and fixed on the way: the dev server served no CSS or JS after a production build ran beside it (clear `.next` and restart); the trial plan's limit of 3 tills blocks device creation once test devices pile up (the script now deletes its own devices first); the till opens on Favourites, which is empty until items are starred.

Not yet covered in the browser: payment and receipt, shift open and close, refunds, offline queue. Those are covered by the API specs and smoke scripts.
