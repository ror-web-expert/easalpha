# Phase 7: Reports, customers and AI (started 11 Oct 2026)

Gate (SPEC): the Grand Report ties out.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | Grand Report | Every payment method with count and share, Unpaid and Complimentary as a share of sales, payments received against customer accounts | spec |
| 2 | Reports | Sales detail table, Sales Calendar grid, Financial, Operations, Vouchers, Loyalty Points, Regular Discounts; AI Pricing Analysis and AI Stock Forecast as stored advisory insights; CSV and PDF on every report (built in the browser from the same rows) | spec |
| 3 | Customers | Active, Pending approval, Deactivated; Customer Ledger, Customer Payments, Customer Insights and Customer Account screens; Send account bill (SEND_ACCOUNT_BILL) | spec |
| 4 | Loyalty | Redemption options that convert points back; points issued and redeemed report | spec |
| 5 | Regular discounts | Recency tiers (last order within N days takes X off), smallest window wins, never-ordered customers get nothing, exclusions per tier and a global blocked list; applied automatically at the till | spec |
| 6 | Vouchers | Code batches with value, minimum spend, expiry and usage limit; personal codes per customer sent from the POS campaign screen; public codes; redeeming a voucher never counts against the cashier's own discount limit | spec |
| 7 | Reviews | From the tablet and the website, tied to an order, 1 to 5 shown as a word, filters by rating, source, type and Pending | spec |
| 8 | WhatsApp | Master toggle, auto-send on account payment, receipt image and logo options, Templates with the SPEC variables, Manual Send, Bulk Send, Send Logs | spec |
| 9 | Website Config | Store Identity, Pages, Menu Slider, Documents, Footer, Availability, Customer Sign-ups, Location, Branches, Delivery, Pricing, Contact, Social Media, WhatsApp, Instagram, SEO, Mobile App, System; a public storefront page | spec |
| 10 | Settings | WhatsApp, Notifications and Plan screens | spec |
| 11 | Web | The nineteen Reports screens with CSV and PDF, the Customers group screens, Settings screens for Regular Discounts, Vouchers, Reviews, WhatsApp, Notifications, Website Config, Plan; POS voucher and regular discount, review capture on the tablet | Vitest; Playwright |
| 12 | Gate | Grand Report shares sum to the period's sales and account receipts match the customer payments; Playwright; suites | |
