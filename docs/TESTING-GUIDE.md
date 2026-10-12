# Testing guide (demo environment, 11 Oct 2026)

Everything runs locally: admin and all apps on http://localhost:3000, API on 3001, WhatsApp gateway on 3010.

## Logins

| Where | How | Credentials |
|---|---|---|
| Admin panel | http://localhost:3000/login | demo@easalpha.com / password123 (owner) |
| Manager PIN (approvals, refunds, reopen, payroll pay, Reset Stock) | asked inside the admin and POS | 9999 |
| Cashier | POS PIN screen after pairing | 1111 |
| Kitchen display | kitchen PIN screen after pairing | 3333 (Demo Kitchen) |
| Rider app | http://localhost:3000/rider, pair then PIN | 2222 (ZZ Rider) |
| Storefront (public) | http://localhost:3000/store/demo-cafe | no login |

## Set up a device without a code (new)

Open http://localhost:3000/setup, sign in as demo@easalpha.com / password123, pick Till, Kitchen display, Token screen, Queue screen, Order-taker tablet or Rider phone, name it and press Open. The ready screen lists who can sign in there and lets you set a PIN. The desktop app opens this page on every launch and forwards a machine that is already set up to its screen; "Set up this device again" in the EasAlpha menu (or `/setup?again=1`) changes the role.

## Pairing codes (fallback; one use each; make more under Settings, Devices)

| Device | Open | Code |
|---|---|---|
| Demo till (desktop POS) | http://localhost:3000/pos | 369669 |
| Demo tablet (order taker) | http://localhost:3000/pos on the tablet | 904759 |
| Demo kitchen display | http://localhost:3000/kitchen | 842658 |
| Demo rider phone | http://localhost:3000/rider | 197797 |

## Suggested order

1. Admin, Settings, Permissions: grant a cashier a custom set, sign in again on the POS and watch the menu change.
2. Products: image, discount, PCT code, Arrange, Quick Add Menu; the till shows them after sync.
3. POS: walk-in order, pay by cash, kitchen shows the ticket, reopen with the manager PIN, the order story shows the diff.
4. Inventory: a goods receipt (GRN), a recipe, then a sale deducts at completion; Deduction Health shows it; Demand, Reset Stock with PIN.
5. Purchasing: purchase order, receive, pay; Supplier Ledger ties out; Price History verdicts.
6. Finance: Dashboard, Journal Voucher, Trial Balance and Balance Sheet balance; Payment Methods, Add from catalogue.
7. Payroll, Fingerprint: Defaults rules, enrol an employee, scan (manual tap), Run Payroll, Sync to Expenses with PIN.
8. Riders: a delivery order, assign the rider, the rider app moves it to Delivered; Cashier Till and Day-End Settlement.
9. Reports: each screen, Export CSV and Export PDF.
10. Customers: account sale, Customer Account, Send bill (WhatsApp); Regular Discounts tier; a voucher; a review from the tablet.
11. Settings, WhatsApp: Connect a phone (already linked), Templates, Manual Send; Settings, Notifications: Enable on this device, Send test.
12. Storefront: open the public page, leave a review, see it under Settings, Reviews.

The browser gate (`node scripts/e2e-web.mjs`) runs all seven phase gates automatically and leaves "E2E" records behind; they are safe to delete.

## Demo brand images (11 Oct 2026)

The demo business carries a full set of images so every screen can be checked visually: a Demo Cafe logo (also the favicon), a cover image, one image per category and per product, the WhatsApp number +92 343 7172731 and a receipt footer QR pointing at the storefront. They were generated and uploaded through `POST /uploads`, so they live in Active Storage like real uploads. Screens to check: Settings, Branding (receipt, storefront and tab previews), Products, Catalog and Categories (thumbnails), `/store/demo-cafe` (cover, round logo, dish images, favicon and tab title), the till (logo on the receipt). Screenshots from the last walkthrough are in `scripts/shots/walkthrough/`.

## Customer accounts, barcodes, wages and touch (12 Oct 2026)

Before you start: the demo business has a real phone linked to WhatsApp. To try sending without messaging real numbers, start the API without `WHATSAPP_GATEWAY_URL`; messages are then saved as "logged" and nothing leaves the machine. Settings, WhatsApp, Send Logs shows them.

1. Modules: Settings, Modules. Switch Customer accounts off: Customer Ledger, Monthly Bills, Payments, Account and AR Aging leave the sidebar, the till hides Khata, and an old link explains where to switch it on. Switch it on again; nothing was lost. Only the owner can change modules.
2. A hostel student: Customers, New customer. Type the name of someone who exists: Possible duplicates appears. Enter room, roll no., guardian and phone, and an opening balance of Rs 3,000 with a reason. Save.
3. The student's page: Adjust balance, Decrease Rs 50, reason "Tea charged twice". Then Reverse it with a reason. Both rows stay; the ledger and the bill show them.
4. A sale on account at the till: pick the student (F3), pay with Khata. The student gets a WhatsApp message with the items and the new balance.
5. Bills: Customers, Monthly Bills. Choose This month, tick the student, Send to selected, then Print all. Open the bill link from the message on a phone.
6. Import: Customers, Import, Download template CSV, fill two students with opening_balance, import, and import again: the second time the opening balance is not entered twice.
7. Barcodes: open a product, Barcodes, Generate in-store code (or type the code printed on the pack), Save. Products, Barcode Labels: pick it, 3 labels, Download PDF and print at 100%.
8. Scanner: Settings, Point of Sale, Barcode Scanning on, Save. Test your scanner: click the box and scan; it shows what the scanner sends and what it finds. On the till, scan the label: the item is added. Scan a code that is on no product: the till offers to attach it (manager PIN for a cashier).
9. Camera: on a tablet or phone, the till shows Scan beside the search box; allow the camera and hold a barcode in front of it.
10. Wages: Payroll, Employees, set someone's Pay to Daily wage (Rs per day). Advances: give Rs 500. Pay Wages: tick the employee, recover Rs 200 of the advance, Pay selected. Employee Statement shows earned, paid, the advance and the balance; Send on WhatsApp.
11. Touch: open the till on a touch screen (or a tablet). Swipe the item tiles, the category list, the order list and the payment screen; nothing zooms, bounces, reloads or slides sideways, and a swipe never adds an item. The desktop app's EasAlpha menu has Open full screen at launch and Kiosk mode (Ctrl+Shift+K).

Scripts: `node scripts/manual-api-check.mjs <folder>` walks every new API flow on the demo data (26 checks, writes the bill PDFs to the folder); `node scripts/touch-check.mjs <label>` drives the till with touch on three tablet sizes; `node scripts/e2e-web.mjs` is the full browser gate.
