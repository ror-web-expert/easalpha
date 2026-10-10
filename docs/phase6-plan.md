# Phase 6: People and time (started 11 Oct 2026)

Gate (SPEC): the payroll run matches the attendance it priced.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | Cashier Till | Orders taken against money collected per cashier, In tills now (all-time until a Day-End Settlement), Day-End Settlement record that clears the tills; My Till for the cashier (MY_TILL) | spec |
| 2 | Order takers | Tablet surface for the POS (device kind tablet, app codes); Order Taker settings screen; Order Takers report | spec |
| 3 | Riders | Permanent riders with assigned and completed counts; temporary riders with a lifetime (one order, N orders, rest of today, N hours) and their own permissions; the nine rider permissions; Rider Reports; rider app as an installable page with a rider device | spec |
| 4 | Attendance intake | Fingerprint kiosk scan endpoint with enrol and revoke, every tap in a scan log, Today counters, Sessions, Ledger per employee per month | spec |
| 5 | Rules engine | Master switch (off: every scan is Present), business hours as the fallback shift start, per-employee overrides, Late / Half day / Absent after N minutes judged on the first scan, status decided at check-in only, overtime only on a real clock-out and missing punch flagged, weekly offs, no-scan day, free allowances, penalties per status (Fine only, Lose the day, Both, Not charged), monthly fine cap, checkout gap with Already Marked, manual checkout, auto-close at the end of the business day; saved rows keep their status when rules change | spec |
| 6 | Payroll | Overview (employees, pending advances, month generated, outstanding advances); run snapshots the divisor, fines and allowances it used; Ledger; Reports; Settings (Actual Calendar Days or Fixed Divisor with the worked example, Require fingerprint to close shift); Sync to Expenses | spec |
| 7 | Web | Cashier Till report with settlement; My Till on the POS; Order Taker settings; Manage Riders with temporary riders, Rider Reports, rider app page; Payroll group: Overview, Employees, Advances, Run Payroll, Ledger, Fingerprint (Today, Sessions, Scan Log, Ledger, Enrolled, Reports, Leave, Holidays, Employee Rules, Defaults), Reports, Settings | Vitest; Playwright |
| 8 | Gate | Scan an employee in late and out, run payroll for the month, and the payslip's lost days and fines equal what the rules say; Playwright; suites | |
