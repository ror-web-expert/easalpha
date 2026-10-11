# EasAlpha: Mobile Apps

Date: 8 Oct 2026. Sources: the build blueprint and the ArfaPOS audit (Rider app settings, Order Takers, QR Ordering pages).

> **10 Oct 2026: `SPEC.md` is the requirement.** Where this file differs from `SPEC.md`, `SPEC.md` wins. The differences are listed in `PDF-ALIGNMENT.md`; the extras in this file stay. The text before this change is kept in `archive/before-spec-2026-10-10/`.


EasAlpha runs on phones and tablets in five ways. Three are apps the restaurant's own people use, two are for customers. All of them talk to the same Rails API with the same login system; the role decides which app a person can open.

| App | Platform | Who | Login | Offline | Phase |
|---|---|---|---|---|---|
| EasAlpha POS on tablet | Android tablet 10 inch and up; waiter's Android phone; iPad later | Cashier, waiter, manager | 4-digit PIN on a device paired to the branch | Full | Core |
| Rider app | Android and iOS; technology open (recommended: an installable web page) | Rider | Phone + WhatsApp OTP | Queue and sync | Phase 2 |
| Stock count on phone | Browser or the POS app on Android | Manager, stock staff | PIN or admin login | Queue and sync | Phase 2 |
| Customer ordering site | Web page per restaurant, installable like an app | Customers | Phone + WhatsApp OTP, no password | No | Phase 2 |
| Branded customer app | Android and iOS, restaurant's own name and logo | Customers | Phone + WhatsApp OTP | No | Phase 3 (SPEC names a customer mobile app among its surfaces) |

Owners use the admin panel on the phone browser plus WhatsApp alerts. A separate owner app can come later.

---

## 1. EasAlpha POS on Android tablet and waiter phone

The same till as the desktop: the installable web app at `/pos`, with the catalog in IndexedDB and the offline queue (SPEC). Order-taker tablets do not set up printers: they print through the desktop computer whose IP the admin stores as the print server (SPEC).

Who uses it:

- **Waiter** on a phone or 8-inch tablet: takes dine-in orders at the table and sends them to the kitchen. Cannot take payment.
- **Cashier** on a 10-inch tablet at the counter: everything the desktop till does.
- **Manager**: approvals by PIN on the cashier's screen, voids, refunds, shift close.

Screens, in the order a waiter uses them:

1. **Pair device**: one-time code from the admin panel pairs the tablet to a branch. Shown once; later the device goes straight to the PIN screen.
2. **PIN login**: 4-digit PIN, locked after 5 wrong tries, auto-lock after inactivity. Shows the current shift and the sync badge.
3. **Table picker**: floor plan with status colours; tap a table to open or continue its order; merge and move tables (manager).
4. **New order**: category list on the left, item grid with photos, order panel. Modifiers in a bottom sheet. Notes per item. Order type switch at the top. Customer lookup by phone with one-tap repeat of the last order.
5. **Send to kitchen**: the order becomes Pending and goes to the kitchen display and the stations. Stock is deducted when the order is completed (SPEC).
6. **Course firing** (Phase 2): send starters now, mains later.
7. **Change after sending**: adds or removes print a CHANGED or CANCELLED ticket at the station.
8. **Payment** (cashier role): cash with rounding, card terminal, EasyPaisa, JazzCash, Raast QR, khata, split, tips, service charge. Receipt prints through the print server; digital receipt by WhatsApp when the customer gave a phone.
9. **Void and refund**: reason list and manager PIN; both names saved.
10. **Shift**: open with opening cash, cash in and out with reason, blind close, Z report (cashier and manager).
11. **QR orders tab** (Phase 2): accept or reject orders from table QR cards; call-waiter and ask-for-bill requests with the table number.
12. **Delivery** (Phase 2): assign a rider, see rider status chips, record cash collected.
13. **Needs attention**: records the server rejected during sync, with the reason and a fix action.

Rules on the tablet:

- Works fully offline; every action is saved locally in under 100 ms. See `04-offline-online.md`.
- The waiter role never sees payment buttons; the server rejects a payment from a waiter even if the screen is tampered with.
- Price shown is the price the device had at the time; an offline order keeps that price.
- A removed staff member is blocked on the next sync; an admin can log out any device remotely.
- Screen is tested at 1024 px tablet width and 390 px phone width; touch targets at least 48 px.

---

## 2. Rider app

Platform: Android and iOS; technology open (`PDF-ALIGNMENT.md` question 2; recommended: an installable web page). Login: phone number and WhatsApp OTP. A rider sees only their own deliveries and their own cash.

Screens:

1. **Today**: assigned deliveries in order, with address, customer phone, order total, payment type (paid online, cash on delivery, khata) and a map link.
2. **Delivery detail**: items, address, notes, call customer, open in Google Maps, status buttons.
3. **Status updates**: Picked up, On the way, Arrived, Delivered, Failed with a reason (customer not home, wrong address, refused). Each update is timestamped and sent to the till and the admin panel; the customer gets a WhatsApp status message where enabled.
4. **Cash collected**: for cash on delivery the rider records the amount collected per order. The order stays open until the cashier closes it at the till; a rider marking Delivered never closes the order.
5. **End of shift**: list of cash collected, cash float held, expenses spent from the float, and the amount to hand in. The cashier confirms the hand-in on the till, which settles the rider.
6. **Cash float**: statement of company cash issued to the rider, returned, spent and adjusted (ArfaPOS Rider Vault). Issue and return are done by the cashier or manager; the rider only sees the statement.
7. **My deliveries**: own history and success rate; the same figures the admin sees in Rider Reports.

Rules:

- Status updates and cash entries queue when offline and sync in order when the connection returns; the map needs the internet.
- Location sharing is optional per business; when on, the admin panel shows the rider's last position on the Riders page.
- Push notification on a new assignment; the till shows Unassigned in orange until a rider is set.
- The rider role has `app.rider` and `reports.view_own` only.

---

## 3. Stock count on a phone (Phase 2)

A manager walks the store with a phone and counts a section. Opens only when the counting switch is on in Inventory Settings.

- Pick section, then count item by item; search by name or SKU, or scan a barcode with the camera.
- Shows the item's unit and the last count; never shows the expected quantity (blind count).
- Saves each line locally; submit posts a count document that writes adjustment ledger rows.
- Actual vs theoretical report uses two counts to show real usage against what recipes say.

---

## 4. Customer ordering site and QR ordering (Phase 2)

A web page per restaurant at `easalpha.com/store/<slug>`, or the restaurant's own domain on the Business plan. Installable to the home screen; no app store needed. Works like an app on any phone.

Modes:

- **Delivery and pickup**: browse the live menu (only menus, categories and items switched on for online), cart, address, pay by card, EasyPaisa, JazzCash or cash on delivery, track the order (confirmed, preparing, ready, out for delivery), loyalty points (Phase 3).
- **QR table ordering**: scanning the table card opens the menu tagged with the table. Options the restaurant sets: cashier must accept each order, call waiter, ask for bill, show the running bill with tax and service charge, ask for a guest name. When QR ordering is off the card shows "ordering is not available".

Rules:

- Login by phone and WhatsApp OTP, no password. Order status by WhatsApp.
- Online only; when offline the page says so and keeps the cart.
- Public endpoints have stricter rate limits.
- Prices by order type apply; delivery zones and charges from the Delivery module.

---

## 5. Branded customer app (Phase 3; SPEC names a customer mobile app among its surfaces)

The same ordering flow as the site, packaged with the restaurant's name, logo and colours, published to Google Play and the App Store if a native build is chosen (question 2). Adds push notifications for offers and order status. One code base, one configuration file per restaurant.

---

## 6. Notifications on mobile

| Event | Rider app | Customer | Owner phone |
|---|---|---|---|
| New delivery assigned | Push | | |
| Order confirmed, ready, out for delivery | | WhatsApp | |
| Big void, cash short, low stock | | | WhatsApp alert |
| Daily sales summary | | | WhatsApp at day close or 11 pm |
| Trial and billing reminders | | | WhatsApp and email, days 60, 80, 88 |
| Offers and birthday deals (Phase 3) | | WhatsApp, opted-in only, with STOP | |

---

## 7. Technical notes

- Rider and customer apps: technology open (`PDF-ALIGNMENT.md` question 2); the option written here was React Native (Expo), TypeScript types generated from the OpenAPI spec, a local queue (SQLite) for offline actions, Expo push notifications.
- POS on Android: the same web app at `/pos`, installed to the home screen; printing through the desktop print server (SPEC).
- Device registration: every POS device is paired to one branch and carries a device token; the server checks device, user, business, branch, permission and app on every request.
- Store listings: only if native builds are chosen (question 2); the POS itself is installed from the browser.
