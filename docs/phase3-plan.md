# Phase 3: Orders and POS (started 10 Oct 2026)

Gate (SPEC): take a walk-in order on the POS, pay it by cash, see it on the kitchen display, reopen it, add an item, and the order story shows the diff and the amount change.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | SPEC statuses | Pending, Preparing, Ready, Dispatched, Completed, Cancelled over the internal states; Open filter; SPEC payment statuses Paid, Pending, Unpaid, Account, Complimentary; Mobile App source; Maintenance table status | Request spec |
| 2 | Order story | `order_events`: punched, reopened, edited (item and money diff), completed, cancelled with user, role and time; reopen and edit counts | Spec |
| 3 | Reopen flow | `POST /orders/:id/reopen` behind REOPEN_ORDER; DELETE_ORDER_ITEM and MODIFY_REOPEN_DECREASE_QTY on a reopened order; REQUIRE_PIN_FOR_ORDER_UPDATE demands the order-update PIN; a reopened order always goes back through the payment screen | Spec |
| 4 | Complete | `POST /orders/:id/complete`, place-and-complete, Direct Unpaid Orders with PLACE_UNPAID_DIRECT (admins always qualify) | Spec |
| 5 | Lists and bulk | Filters by SPEC status, payment status, payment method, source, rider, date range; sorts; Mark All Completed; Sync Complimentary; Pending Orders across days with tiles and calendar; Cost Analysis per order | Spec |
| 6 | Customer required | Per order type from the settings store, enforced at placing | Spec |
| 7 | Dashboard | SPEC cards, charts, top selling, period selector; top-bar pills on /me | Spec |
| 8 | Web admin | Orders Management with the filters, sorts, totals and bulk actions; 3-tab order drawer with the story; Pending Orders screen; Maintenance tables; SPEC dashboard; pills | Vitest; Playwright |
| 9 | Web POS and KDS | Order-type permissions, customer required, default payment method, part payment, confirmation popup, Direct Unpaid, reopen flow with PIN, pending reminder, offline-orders permission, KDS alert settings | Vitest; Playwright |
| 10 | Gate | The SPEC acceptance run in Playwright; full suites; build log | |
