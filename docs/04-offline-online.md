# EasAlpha: Offline and Online Behaviour

Date: 8 Oct 2026. Source: the build blueprint, with lessons from the ArfaPOS audit (its safety net for lost deductions and its 146 never-closed sessions).

> **10 Oct 2026: `SPEC.md` is the requirement.** Where this file differs from `SPEC.md`, `SPEC.md` wins. The differences are listed in `PDF-ALIGNMENT.md`; the extras in this file stay. The text before this change is kept in `archive/before-spec-2026-10-10/`.


Principle: **the till never stops.** A sale is never blocked by a stock figure, a slow server or a dead internet connection. Everything a cashier does is saved on the device first and reaches the server when it can.

---

## 1. What works where

| Capability | Offline | Needs internet |
|---|---|---|
| Taking orders, all order types | Yes | |
| Cash payments, khata payments, cash rounding | Yes | |
| Printing receipts and kitchen tickets | Yes, local printers | |
| Cash drawer, shift open and close, Z report for that till | Yes | |
| Discounts, voids and price overrides with manager PIN | Yes, PINs cached | |
| Today's report for that till | Yes | |
| EasyPaisa, JazzCash and online card payments | | Blocked, with a clear message |
| Card terminal link | Depends on the terminal | |
| FBR and PRA invoice number | | Queued; receipt reprinted with QR after sync, or QR on the digital receipt |
| WhatsApp receipts and status messages | | Queued |
| Online, QR and Foodpanda orders | | Cannot arrive |
| Kitchen display updates | Through the local hub (Phase 3) | Yes until then; KOT printer is the fallback |
| Stock figures | Last known value shown | Calculated on the server from synced sales |
| Admin panel, live owner dashboard | | Online only |
| Rider app status and cash entries | Queued | Map and directions online |
| Customer ordering site | | Online only; cart kept |

---

## 2. How the till works offline

1. **Local database.** Each till keeps an IndexedDB store inside the web app with the menu, prices, tax rates, staff PINs and permissions, tables, open orders, the current shift and the last 7 days of synced orders. The catalog is checked by ETag on launch (SPEC).
2. **Save first, always.** Every action (order, item, payment, void, cash in or out, shift event) is written locally in under 100 ms, online or not. The screen never waits for the server.
3. **Connection badge.** The app checks the connection every few seconds and shows Online (green), Offline (orange) or Syncing (blue). The badge also shows how many records are waiting.
4. **Sync queue.** Saved records go to the API in the order they happened, in batches. Each record carries a UUID made on the device and sends it as the `Idempotency-Key`; the server accepts each UUID once, so a retried batch never duplicates anything.
5. **Pull changes.** After each push the till pulls changes made in the admin panel since its last cursor: prices, new items, staff, PINs, tables, settings.
6. **Needs attention.** A record the server rejects (item deleted, customer archived, permission removed) goes to a list for the manager with the reason and a fix action. It is never lost silently.
7. **Capacity.** At least 24 hours of orders stored on the till. A warning shows at 12 hours offline.
8. **Updates.** The web app updates itself, but never during an open shift.
9. **Offline Orders.** The queue of orders punched without a connection is visible on the POS to users with the OFFLINE_ORDERS permission (SPEC).

---

## 3. Sync protocol

Push:

- Endpoint per record type under `/api/v1/sync/`; one batch request carries up to 200 records in time order.
- Each record: `uuid`, `device_id`, `created_at` from the device clock, `server_seq` empty, payload. The server returns one result per record: accepted, duplicate, rejected with code.
- Retries with exponential backoff; a rejected record is removed from the queue and shown under Needs attention.
- A `sync_batches` row on the server records every batch with device, counts and outcome.

Pull:

- `GET /api/v1/sync/changes?cursor=<last>` returns master data changed since the cursor, in dependency order (units, categories, products, prices, modifiers, staff, tables, settings).
- The till applies them in one transaction and stores the new cursor.

Conflict rules:

| Situation | Rule |
|---|---|
| Price changed in admin while an offline order used the old price | The order keeps the price the till had at the time of sale. The snapshot on the order item is the truth. |
| Item archived in admin while an offline order used it | The order is accepted (sale happened); the item stays archived; the Needs attention list notes it. |
| Staff removed while offline | Their offline actions up to the removal time are accepted; the device blocks them on the next sync. |
| PIN changed in admin | Reaches the till on the next sync; the old PIN works offline until then. |
| Two tills open the same table offline | Both orders are accepted; the table shows two open orders with an alert for the manager to merge or void. |
| Device clock wrong | Server records both device time and server receipt time; reports use the device time within the business day, and a skew over 10 minutes raises an alert. |
| Same UUID sent twice | Second copy returns the first result; nothing is written twice. |

Order numbers offline:

- Each till has a code (T1, T2). Offline serials are T1-059, T2-059, so two tills never clash. The server keeps the till serial and assigns the branch-wide serial when the order arrives.

Stock:

- Stock is deducted once on the server when the order is completed (SPEC). The till only shows the last known stock and never blocks a sale on it. If the deduction is lost, a safety-net job every 10 to 15 minutes finds completed orders whose stock never moved and deducts them dated to the day of the sale. A unique index on (source, item) means it never deducts twice. Deduction Health shows the job and offers Retry.

Tax:

- FBR and PRA invoices are requested on the server at Paid. Offline, the receipt prints without the tax QR and says "tax invoice pending". After sync the invoice number is stored; the till can reprint the receipt with the QR, and the digital WhatsApp receipt carries it.

---

## 4. Kitchen display and printers

- Online: the API pushes new, changed and cancelled orders to the station screens over Action Cable within 2 seconds.
- Offline today: the till prints the KOT on the station printer over the shop LAN, so the kitchen keeps working without the screen.
- Phase 3 local hub: one till acts as a hub on the shop Wi-Fi so other tills, waiter tablets and the kitchen display keep talking to each other when the internet is down. The hub holds the queue and syncs for everyone when the connection returns.

---

## 5. Rider app

- Status updates (picked up, on the way, arrived, delivered, failed) and cash collected are saved locally and queued.
- The till shows the rider's last synced status; a delivered order still needs closing by the cashier.
- End-of-shift settlement is confirmed on the till, online, because it moves money between accounts.

---

## 6. Admin panel, online ordering, aggregators

- The admin panel is online only. Its changes reach tills on their next sync.
- The customer site, QR ordering and Foodpanda need the restaurant's internet to deliver orders to the till; when the till is offline those orders wait on the server and arrive on reconnect, marked with their original time. A till offline for more than 5 minutes makes the server mark online ordering as "temporarily unavailable" to customers.

---

## 7. Data safety on devices

- Local data in IndexedDB inside the web app; device token revocable from the admin panel.
- Synced orders older than 7 days are cleared from the device; unsynced records are never cleared.
- A device that has not synced for 48 hours shows a red warning to the cashier and sends a WhatsApp alert to the owner.
- Logging out of a device with unsynced records is blocked with a message; a manager can force it, and the records stay on the device for the next login.

---

## 8. Test scenarios

Every release must pass these on staging before production:

1. Disconnect the till, take 20 orders with cash, khata and a void, reconnect: no duplicates, correct stock, correct Z report.
2. Pull the power during a payment: on restart the order is either paid or not paid, never half.
3. Two tills offline open the same table: both orders survive, the manager sees the alert.
4. Change a price in admin while the till is offline: the offline order keeps the old price; the next order uses the new one.
5. Remove a cashier in admin while they are offline: their orders sync, then the device blocks them.
6. 24 hours offline with 500 orders: the queue syncs completely in under 5 minutes on a 4G connection.
7. Tax server down at payment: receipt prints "pending", invoice arrives later, reprint shows the QR.
8. Device clock 2 hours wrong: orders land in the right business day and an alert is raised.
