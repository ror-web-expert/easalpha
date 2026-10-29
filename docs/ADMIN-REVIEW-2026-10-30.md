# Admin review, 30 Oct 2026

Every admin page (143 routes from the navigation) was opened on the local demo at 1440 x 900, screenshotted and
measured, then reviewed one by one against the design rules: one font family, one primary action colour, colour only
for status, compact density, the same header card everywhere, empty states that say what to do next.

## Measured (all 143 pages)

| Check | Result |
|---|---|
| Font families in use | Inter everywhere; Roboto Mono only for codes |
| Font sizes | 12, 13, 14, 16, 22, 24 px on the scale; 10 px on three pages (QR card URLs, a receipt preview, one calendar badge) |
| Console or API errors | none on any page |
| Pages with text overflowing their box | 2 (Point of Sale settings keys, Inventory Settings), both fixed below |
| Pages with a title (h1) | 143 of 143 |
| Pages showing an empty state on the demo | 18 |

## Fixed in this pass (commit after f8f2438)

Component-level, so every page gets them:

- **Header card.** Actions always sit at the right; a long description wraps instead of pushing the buttons under it. Before, about half the pages had the buttons top-right and half had them under the text.
- **Tables inside cards and the main column.** The content column and cards can now shrink, so a wide table scrolls inside its card with the edge shade, instead of clipping the last columns (Customers, Finance dashboard, Stock ledger, Waste and adjustments, Payroll wages and run, Cashiers).
- **"Need help?" button.** The page keeps room at the bottom, so the last rows and their action icons are never under the button.
- **Sidebar.** The selected item is scrolled into view and the list keeps room above the user footer.
- **Badges.** A plain lowercase chip ("open", "not counted", "online", "paired") now reads in sentence case; codes are left as they are. Mixed casing was flagged on 20 or more pages.
- **Toggle switches.** Two switches in a column no longer share a line (QR ordering had them colliding).
- **Setting keys.** The mono keys under every control on the settings pages are hidden; "Show setting keys" under the page header brings them back for support.
- **Page titles.** 22 titles now match their menu label (Stock in Hand, Order Inventory, Orders, Catalog, Balance Sheet, Trial Balance, and so on), so the sidebar, breadcrumb and title agree.
- **Dashboard.** One banner at a time: the "nothing sold yet today" note moved into the header line with a Show today button beside the periods; the second card row has no empty slot.
- **Open-orders pill.** Amber, not red, and "67 open from earlier days" when today has none.

Page-level:

- Deals and Promotions: empty states explain what a deal or promotion is and offer the New button.
- Tax invoices: a blank Last error is grey, not red.
- Plan: only a live subscription decides the current plan (a stale row marked Pro as current while the business was on a Business trial).
- Supplier ledger: the supplier list no longer opens by itself on page load.
- Items: SKUs never wrap. Stock status chip "ok" reads "OK".
- Catalog grid, product analysis and archive buttons (earlier today, f8f2438).

## Still open, in suggested order

High (a user would notice at once):

1. **Orders report**: 13 columns with two all-dash staff columns, "Paid by" shows the raw key (khata:9300), dates and names wrap. Drop the empty columns, label the method, keep dates on one line.
2. **Line charts with one data point** (Business Overview, Sales): two floating dots and no line. Fall back to bars or a single value when a series has fewer than two points.
3. **Riders, Manage**: Rider and Status columns too narrow; names and "Seen 12 days ago" wrap to three lines.
4. **Stock levels and Valuation**: Kitchen and Warehouse appear twice (second pair at zero). Check whether sections are duplicated per branch on this database or the query is not scoped.
5. **Payroll wages**: inputs crowd every row and the Status column was cut off. Now it scrolls; a narrower layout (rate under days) is the real fix.
6. **Payroll runs list**: run codes wrap mid-code ("PAY-2026-/10"). Nowrap the code and give the status its own column.

Medium:

7. Date and name cells that wrap on Expenses, Customers (Source), Staff (Last login), Employees (Joined). Nowrap those cells.
8. Columns that are "-" on every row (Daily stock sheet In/Out/Waste/Sale, Demand usage columns, Devices pairing code and last sync, Goods received invoice, Customers group). Hide a column when no visible row has a value, as the catalog already does.
9. Default period differs between reports (last 7 days, this month, today). Pick one default and show its name in the preset box.
10. Figures that differ for the same period (Rs 659 vs Rs 660; Branch comparison vs Financial). One rounding rule, and the tile sub-label says what is included.
11. Day charts skip days with no data (Foodpanda, Loyalty). Plot every day of the range.
12. Cashiers and Order takers reports show one "Unknown" row. Resolve to staff names or explain in a line.
13. Rider Reports and Delivery Riders are the same report under two names. Keep one.
14. Finance: Shifts shows two date formats in one table and three chips per row; Day close has an empty "Shifts" heading; Payment accounts right pane is bare text instead of the standard empty state.
15. Settings: Charges and Tax labels run to three lines; Audit logs show table names and ids; Sessions show a raw user agent; Devices list 11 revoked test devices with no filter.
16. Staff: Cashiers has two live selects per row; show the role as text and edit in a drawer.
17. Delivery board: five columns on a four-column grid; "Arrived" uses the orange of the buttons.
18. Empty states with no next step: Returns, Order takers, Integrations, Cancelled orders, Grand report, Delivery riders, Reservations, Fixed assets.

Low: pluralisation ("1 accounts", "1 categories", "1 advances"), "A EasAlpha extra", "Whatsapp" casing, "TOTAL POS" label on Purchase Orders, two 10 px strings in the receipt preview, "Settings version" line only on five pages, "Export PDF" vs "PDF", per-gram prices rounded to whole rupees on Price History.

## Not defects, but worth knowing

- The local demo database carries rows from automated tests ("E2E Oil 1791886363750", revoked E2E devices, negative stock). They make several pages look worse than the production demo does.
- Orange is both the button colour and the main chart series. Changing the chart palette to navy-first is a design choice, not a defect.
- The menu keeps the spec's Title Case names ("Stock in Hand", "Daily Stock Sheet") next to sentence-case EasAlpha extras ("Modifier groups"). Titles now follow the menu; making the casing uniform would mean renaming spec items.

Screenshots: before in `tmp/admin-review/` (local only), after-fix samples in `docs/screenshots/admin-review/`.
