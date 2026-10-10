# Phase 5: Purchasing and money (started 10 Oct 2026)

Gate (SPEC): the supplier ledger ties out.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | Suppliers | Balance label To Pay, To Receive or Settled; count of distinct items supplied and of purchases; inline create with PO_ADD_SUPPLIER | spec |
| 2 | Purchase orders | KPI tiles (total, drafts, received, total value); Payment column from payments against the PO; pay a PO; the nine permissions, one per action; inline item create with PO_ADD_ITEM | spec |
| 3 | Supplier Ledger | Dr and Cr lines typed Purchase, Payment, Adjustment, Return or Opening with a running balance and the PO link; headline tiles; manual adjustments; Aging tab | spec |
| 4 | Supplier Insights | Rank suppliers by purchased, paid, outstanding or name with PO count and last purchase date | spec |
| 5 | Purchase Price History | Bought, Spent, Paid on average, Last price, Average cost, Difference and a verdict per item over a window | spec |
| 6 | Expenses | Total, average, count and category count; filters by category, subcategory, method and source; CSV from the API, PDF in the browser | spec |
| 7 | Payment methods | Catalogue of Pakistani wallets and banks; adding a method creates its account and bumps the settings version so tills resync | spec |
| 8 | Tax per account | A tax rate linked to a finance account; the order carries a No Tax or rate choice while the payment method's account is linked | spec |
| 9 | Charges | Service charge and delivery charge as percent or fixed, pre-filled, changeable or removable per order | spec |
| 10 | Finance Dashboard | Total balance, Today In and Today Out, counts by source, recent activity with the balance after | spec |
| 11 | Double entry | Seeded chart of accounts with system rows; journal vouchers; automatic journal lines for payments, expenses, supplier payments, transfers, receipts, deductions and waste; Combined Ledger; Fixed Assets with depreciation; Liabilities; Equity; Trial Balance; Balance Sheet | spec |
| 12 | Web | Suppliers, Supplier Ledger, Supplier Insights, Supplier Payments screens; PO tiles, PDF and inline create; Purchase Price History; Expenses with export and categories; Finance Dashboard, Combined Ledger, Journal Voucher, Chart of Accounts, Fixed Assets, Liabilities, Equity, Balance Sheet, Trial Balance; Payment Methods catalogue; Charges & Tax | Vitest; Playwright |
| 13 | Gate | Receive a PO, pay part of it, adjust, and the supplier's ledger balance equals purchases minus payments plus adjustments; Playwright; suites | |
