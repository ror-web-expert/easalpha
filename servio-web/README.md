# EasAlpha web

Next.js 15 front end for the EasAlpha restaurant POS: the admin panel (`/admin`), the till (`/pos`, installable PWA), the kitchen display (`/kitchen`) and the token screen (`/token`). All data loads client-side from the Rails API in `../servio-api`.

## Run

```bash
pnpm install
cp .env.example .env.local        # or export the variables below
pnpm dev                          # http://localhost:3000
```

Environment:

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | Base URL of the Rails API |
| `NEXT_PUBLIC_CABLE_URL` | derived (`ws://localhost:3001/cable`) | Action Cable endpoint for live kitchen and token updates |

Start the API first (`cd ../servio-api && bin/rails s -p 3001`). Checks: `pnpm lint` and `pnpm build`.

## Screens

| Path | Who | Notes |
|---|---|---|
| `/login` | Owners, managers | Email + password, or phone + WhatsApp OTP. Tokens live in `localStorage` (`servio.auth`), refresh is automatic. |
| `/admin/**` | Owners, managers | Dashboard, orders, menu, customers and khata, tables, staff and roles, devices, shifts, day close, tax invoices, payment accounts, sync rejections, reports, settings, audit log. Business switcher and branch picker in the sidebar and header. |
| `/pos` | Cashiers, waiters | Three-column till. Keyboard: F1 new order, F2 search, F3 customer, F4 hold/recall, F5 send to kitchen, F8 pay, Esc back. |
| `/pos/orders`, `/pos/shift`, `/pos/attention` | Till | Today's orders (open vs paid, void, refund, reprint), shift open/cash in-out/blind close with Z report, rejected sync records. |
| `/kitchen` | Kitchen device or user with kitchen permissions | Station selector, cards with elapsed timer (amber at 8 min, red at 15), bump item or order, CHANGED/CANCELLED band, sound, live via `KitchenChannel` with 10 s polling fallback. |
| `/token` | Token screen device | "Order #59 ready" in large type with a sound, from `GET /kitchen/ready` + `TokensChannel`. |

## Pair a till

1. In the admin go to **People › Devices › New device** (kind `till` or `tablet`). A 6-digit pairing code is shown once; **Regenerate** makes a new one.
2. On the till browser open `http://<host>:3000/pos`. It redirects to `/pos/pair`; enter the code. The device token is stored in `localStorage` (`servio.device`) and the menu is downloaded into IndexedDB (`servio-till`).
3. Staff log in on `/pos/pin` with their 4-digit PIN (set under **People › Staff**). The till locks after 5 minutes of inactivity.
4. Install it: Chrome shows an "Install app" prompt (manifest at `/manifest.json`; the service worker `/sw.js` caches the shell so the till opens offline).

Offline: every order, payment, void, shift and cash movement is written to IndexedDB first, then pushed to `POST /sync/push` with client UUIDs. The header badge shows Online / Offline / Syncing with the pending count; rejected records go to **Attention**. On reconnect the till pulls `GET /sync/changes`.

## Open the kitchen display

1. Create a device of kind **kitchen** (optionally bound to a station) or **token_screen** in **People › Devices**.
2. Open `http://<host>:3000/kitchen` (or `/token`) on the screen and enter the pairing code. A manager who is already logged in to the admin in the same browser can open either screen without pairing.
3. Pick the station in the header; the choice is remembered on that device. Tap the screen once so the browser allows sound.

## Layout

```
src/app/(admin)/admin/**   admin pages        src/components/admin/**   sidebar, page helpers, CRUD hooks
src/app/pos/**             till screens       src/components/pos/**     item grid, order panel, payment, receipt
src/app/kitchen, /token    kitchen screens    src/components/ui/**      hand-written shadcn-style primitives
src/lib/api.ts             typed fetch, refresh on 401, {code,message} errors
src/lib/types.ts           shapes matching the API serializers
src/lib/pricing.ts         local totals (mirrors Orders::Pricing)      src/lib/sync.ts   offline queue
src/lib/pos-actions.ts     offline-first order, payment, shift actions  src/lib/db.ts     Dexie schema
src/store/**               zustand: auth, device, cart, catalog, sync, theme, toast
```

Design tokens (teal primary, amber accent, slate neutrals, dark mode via `prefers-color-scheme` and `data-theme`) are CSS variables in `src/app/globals.css`, mapped into Tailwind through `@theme inline`.
