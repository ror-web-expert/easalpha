# Servio: Desktop Applications

Date: 8 Oct 2026. Sources: the build blueprint and the ArfaPOS audit.

Servio has one desktop application, **Servio POS**, the till. The kitchen display and the customer display are browser pages served by the same app on a second device or a second screen. The admin panel is web only.

---

## 1. Servio POS, the till

| Item | Value |
|---|---|
| Platforms | Windows 10 and later, macOS 12 and later. Android tablet build shares the code (see `03-mobile-app.md`). |
| Shell | Tauri 2. Rust side handles printing, cash drawer, SQLite, auto-update and device identity. |
| Screens | The Next.js till screens from `servio-web`, bundled into the app. One code base for desktop, tablet and the browser fallback. |
| Local data | Encrypted SQLite (SQLCipher) with menu, prices, tax, staff PINs, tables, open orders, shift, 7 days of synced orders. |
| Minimum screen | 1366 x 768. Works with touch, mouse and keyboard. |
| Install | Signed installer; silent update in the background, applied only when no shift is open. |
| Identity | Paired to one branch with a one-time code; device token stored in the OS keychain. |

### 1.1 Layout

Three columns on every order screen: categories on the left, item grid with photos in the middle, the current order and the pay button on the right. Touch targets at least 48 px. A big coloured order-type switch at the top: Dine-in, Takeaway, Delivery, Walk-in. Dark mode for night shifts and a high-contrast mode for bright counters. Inter for English, Noto Nastaliq Urdu for Urdu.

### 1.2 Screens

| Screen | What it does |
|---|---|
| Pair device | One-time code from the admin panel; shows branch name after pairing. Only an owner or manager can pair. |
| PIN login | 4-digit PIN; 5 wrong tries lock the user; auto-lock after inactivity; shows the open shift and the sync badge. |
| Orders list | Today's orders with type, serial, status, customer, rider, payment state and total. Filters by type, status, payment, source and rider. Open orders and paid orders are separate totals. No delete button. |
| New order | Category grid, search (F2), modifiers dialog, notes, quantity, customer by phone with one-tap repeat of the last order, table picker for dine-in, delivery address and rider for delivery. |
| Floor plan | Tables with status colours; open or continue an order; merge and move tables; waiter assignment; service charge applied by setting. |
| Send to kitchen | Marks the order Placed, prints KOT per station or pushes to the kitchen display, deducts stock on the server. Later edits print CHANGED or CANCELLED tickets. |
| Hold and recall | Park an order and bring it back. |
| Payment (F8) | Cash with change and rounding, card terminal, EasyPaisa, JazzCash, bank transfer, Raast QR on screen, khata, split by amount or by item, tips, service charge. Prints the receipt and sends the digital receipt by WhatsApp. |
| Void | Before payment: reason list, manager PIN, stock returned or recorded as waste. Both names saved. |
| Refund | After payment: manager only, reason, method, logged. |
| Price override and open item | Manager PIN for an override; permission for an open item; both logged with before and after. |
| Staff meal | Complimentary order type with reason and approver; cost tracked (decision 4). |
| Reprint | Reprints marked DUPLICATE and logged. |
| Shift open | Opening cash count. One open shift per cashier. |
| Cash in and out | Amount, reason, optional note; updates expected cash. |
| Shift close | Blind count by denomination; system shows over or short; manager approves; Z report prints: sales by payment type, voids, discounts, tax, over or short. A shift still open at day end is force-closed and flagged. |
| Expenses (Phase 2) | Category, subcategory, amount, payment method, receipt photo, petty cash from the drawer; daily prompt at shift close. |
| QR orders (Phase 2) | Accept or reject orders from table cards; call-waiter and ask-for-bill requests with table number. |
| Delivery (Phase 2) | Assign rider, see status chips (picked up to delivered), record cash collected, settle the rider at shift end, issue or return cash float. |
| Sync and needs attention | Connection badge, pending count, last sync time, list of rejected records with fix actions. |
| Settings | Printers and stations, receipt copies, cash drawer test, display language, dark mode, customer display on or off. Business settings are admin-panel only. |

### 1.3 Keyboard shortcuts

| Key | Action |
|---|---|
| F1 | New order |
| F2 | Search items |
| F3 | Customer lookup by phone |
| F4 | Hold or recall |
| F5 | Send to kitchen |
| F8 | Pay |
| F9 | Open cash drawer (permission) |
| Esc | Back |
| Ctrl K | Quick search across orders and customers |

### 1.4 Printing

- ESC/POS thermal printers, 58 mm and 80 mm, over USB or network. The desktop till prints directly from the Rust side; no driver install.
- Receipt: logo, restaurant name, serial, items, modifiers, tax lines, FBR or PRA invoice number and QR, payment method, change, rounding line, tips, WhatsApp number for feedback. English or Urdu; Urdu rendered as an image.
- Kitchen tickets per station on network printers; a station with a kitchen display can still print as fallback.
- Cash drawer opens through the receipt printer port on cash payment and on F9 with permission.
- Receipt designer in the admin panel sets header, footer, social links and a 58 or 80 mm preview; the till downloads the design on sync.

### 1.5 Performance

| Action | Target |
|---|---|
| Add item to order | under 100 ms, local |
| Payment and receipt print | under 2 seconds |
| Order to kitchen display | under 2 seconds online |
| Cold start to PIN screen | under 5 seconds |
| Offline storage | at least 24 hours of orders |

### 1.6 Security on the till

- Local database encrypted; device token revocable from the admin panel; an owner can log out any device remotely.
- The screen hides buttons a role cannot use, and the server checks again on sync. A tampered client cannot pay as a waiter or void without a manager PIN.
- Every sensitive action writes an audit row with user, device, approver, before and after values.
- Synced orders older than 7 days are cleared; unsynced records are never cleared.

### 1.7 Updates

- Auto-update checks hourly; downloads in the background; installs only when no shift is open and the queue is empty.
- The version number shows on the PIN screen; a release can be rolled back from the admin panel by pinning a version.
- API versions stay live until every till in the business has updated.

---

## 2. Kitchen display

Runs in a browser in kiosk mode on any Android TV box or tablet. Paired to a branch and a station with a one-time code (decision 5); no person logs in.

- Columns or cards per order with the serial, order type, table, elapsed timer that turns amber and red at set minutes, items with modifiers and notes.
- Bump an item or the whole order when ready; the till and the token screen update.
- CHANGED and CANCELLED tickets show in a highlighted band.
- Sound on a new order.
- Online through Action Cable; through the local hub in Phase 3; KOT printer as fallback.
- Station routing: each product is mapped to a station (BBQ, Karahi, Tandoor, Drinks); an order shows only the items for that station.

---

## 3. Customer display and token screen

- **Customer display** (Phase 2): a second screen on the till showing the current order and total as it is built, and the amount due at payment.
- **Token screen** (Core): a screen facing the pickup counter showing "Order #59 ready" with a sound, driven by bumps on the kitchen display or the till.

Both are browser pages opened from the till's Settings on a second monitor or a separate device.

---

## 4. Hardware checklist for a new till

- [ ] Windows or Mac laptop or PC, 1366 x 768 or larger, or a 10-inch Android tablet
- [ ] 80 mm receipt printer, USB or LAN, cash drawer connected to it
- [ ] One network printer per kitchen station, or a kitchen display device
- [ ] Barcode scanner in USB keyboard mode, if retail items are sold
- [ ] Shop Wi-Fi with a fixed IP for printers
- [ ] Pairing code from the admin panel

---

## 5. Till app repository

`servio-pos-desktop`: Tauri 2 project. Rust crates for ESC/POS printing, cash drawer, SQLCipher, the sync queue and auto-update. The web layer is the shared till screens from `servio-web`, pulled in as a package. End-to-end tests with Playwright against the bundled screens; the offline test (disconnect, 20 orders, reconnect) runs in CI with a mocked API.
