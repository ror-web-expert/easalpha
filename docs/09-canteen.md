# EasAlpha: Canteen (factory mess)

Date: 29 Oct 2026. Built for clients who run industrial canteens: several branches, each a canteen, hundreds of workers
with a one-hour break, three or four dishes a day. A worker identifies by fingerprint at a kiosk, takes one dish, gets a
token and collects at the counter. A second try in the same meal session is refused with the time and token of the first.
Every meal lands on the worker's own account, so "I never ate" is settled by the record, and the month's meals come off
the payroll run. Works online and offline. Switched on per business by the owner (Settings, Modules, Canteen).

Screenshots of the browser walk-through (29 Oct 2026, 23 of 23 steps): [screenshots/canteen/index.html](screenshots/canteen/index.html).

---

## 1. What the owner sets up

| Step | Where | Notes |
|---|---|---|
| Switch the module on | Admin, Settings, Modules | Canteen brings customer accounts with it (meals go on accounts). Only the owner can switch modules. |
| Meal sessions | Admin, Canteen, Meal Sessions | Breakfast 07:00 to 10:00, Lunch 12:00 to 15:00, Dinner 19:00 to 22:00 by default; per branch; a window past midnight is fine: its meals belong to the business day it opened, so a night session 23:00 to 06:00 is one meal on one plan though the business day turns at 02:01 inside it. One meal per worker per session; for a second meal in a shift, add a session. |
| Workers | Admin, Canteen, Workers | Workers are the employees under Payroll (phone, CNIC, department). Each gets a fingerprint id from the reader (the same id attendance uses) and an account for meals; the account is made on the first meal if missing, or in one go with "Give every worker an account". |
| The day's plan | Admin, Canteen, Meal Plans | Per session: the dishes (products from the menu), how many are cooked, what the worker pays. Blank price = menu price; a lower price means the company pays the difference (recorded as "Company subsidy"). Publish so the kiosk serves it. "Copy from the day before" saves typing. |
| Kiosks and counter | /setup on the machine, or Admin, Settings, Devices (kind Kiosk) | "Canteen kiosk" opens /canteen; "Canteen counter" opens /canteen/serve. Several kiosks per canteen are fine. |
| Token slips | Admin, Settings, Point of Sale, Print Server (or the desktop app) | The kiosk prints a slip when a printer is reachable; the screen shows the token either way (setting canteen.print_token). |
| Settings | Admin, Canteen, Settings | Manual lookup, the token slip, the daily menu copy (canteen.plans.auto_copy: soon after each branch's business day begins, a session with no plan that day gets its latest published plan of the past week, published, once a day) and the payroll deduction. |

Permissions: `canteen.manage` (sessions, plans, workers, cancelling meals) and `canteen.serve` (counter and kiosk by a
staff login). The owner and manager roles hold both. Kiosks and counters run on a paired device with no staff login.

## 2. At the counter, in eight seconds

1. The worker puts a finger on the reader. The reader behaves like a keyboard: it types the id and Enter. The kiosk
   also takes a card reader the same way, and a manager may find a worker by name, phone or CNIC when the reader fails
   (setting `canteen.manual_lookup`).
2. The kiosk shows the dishes of the session being served now. The worker taps one (tapping the dish first and then
   scanning is one tap fewer; with one dish on the plan there is nothing to choose).
3. A green screen shows the token (`Q1-017`: the kiosk's code and a daily sequence), the worker's name and the dish;
   the slip prints. The worker collects at the counter, which shows the tokens waiting, oldest first; the server taps the
   token (or types it) when the meal is handed over.
4. The same finger again in the same session gives a red screen: "Already taken: Akbar Ali took Chicken Karahi at
   12:05, token Q1-017". The rule is a unique index in the database (worker, day, session, not cancelled), so two kiosks
   serving the same worker at the same second still produce one meal.

## 3. Money

Each meal is an order (source `kiosk`) priced from the menu, paid at once: the worker's share on their account (khata)
and the company's share on the internal method "Company subsidy", which the till never offers. A free meal (worker
pays nothing) is just placed. Cancelling a meal (Admin, Canteen, Meals, with a reason) refunds both shares and frees
the dish count; the worker may take a meal again in that session.

Payroll: with `canteen.payroll_deduction` on (default), the monthly payroll run adds a deduction line "Canteen meals
(n)" with the month's worker share, and paying the run records a receipt on the worker's account (method "Salary
deduction"), so the account clears. Daily and weekly wage earners keep their account balance for the statement.

## 4. Offline

The kiosk keeps the sessions, the plans it may need next (the day being served and the next business day), every worker
and the claims of the days being served in its browser store (from `GET /canteen/sync`, and `GET /canteen/today`).
The worker list goes out whatever `canteen.manual_lookup` says, with a name and a hash of the reader id (SHA-256 of the
business id and the id), never a phone or CNIC; the kiosk hashes what the reader types. It picks the session being
served, and the day it belongs to, from its clock (set by the server's) as the server does. With no connection it still
identifies the worker, applies the "already taken" rule against everything it holds (the server's claims at the last
sync plus its own), numbers and prints the token, and queues the claim (`meal_claim` in the offline queue). When the
connection returns the queue pushes; the server judges the meal at the kiosk's scan time (not in the future, at most 72
hours old, the session open then within 15 minutes), records it with the kiosk's token label on that session's day,
answers `duplicate` to a repeat and refuses a second helping (`canteen.already_taken`), a scan outside every session or
one older than 72 hours (`canteen.too_old`); a refusal appears in the kiosk's list and on the admin Today page. Two kiosks that are
both offline cannot see each other's claims until one of them syncs; a worker who tries both in that window is caught at
sync. The counter needs the connection to mark meals served.

## 5. Reports

Admin, Canteen, Reports: any range (a day, a week, a month) by day, session, dish or department, and per worker with the
meals list; CSV export; the Today screen shows the live counts and each dish's progress against the planned quantity.
Per-worker statements and the ledger come from the customer account as for any khata customer.

## 6. API

All under `/api/v1/canteen/`, module required. Kiosk and counter calls accept a paired device token (kiosk, till,
tablet, token screen) or a staff login with `canteen.serve`:
`GET today`, `GET sync`, `POST claims`, `GET claims`, `POST claims/:id/serve`, `GET workers?q=` and `GET lookup` (a
device's name search and claims by employee id only while `canteen.manual_lookup` is on). Management needs
`canteen.manage`: `GET workers/:id` (phone and CNIC), `POST claims/:id/cancel`, `GET|POST|PATCH|DELETE sessions`, `GET|POST plans`, `POST plans/copy`,
`POST plans/:id/publish|unpublish`, `DELETE plans/:id`, `GET|POST workers/link`, `POST workers/:id/fingerprint`,
`GET reports/summary?group_by=day|session|dish|department`, `GET reports/workers` (both `&csv=1`). Offline claims go
through `POST /sync/push` as records of type `meal_claim`. Errors: `canteen.unknown_worker`, `canteen.no_session`,
`canteen.session_closed`, `canteen.no_plan`, `canteen.choose_dish`, `canteen.sold_out`, `canteen.already_taken` (details
carry the earlier claim), `canteen.too_old` (a replay more than 72 hours after the scan), `canteen.manual_lookup`.

Tables: `meal_sessions`, `meal_plans`, `meal_plan_items`, `meal_claims`; `employees.customer_id`;
`payment_methods.internal`.

## 7. Fingerprint readers

The kiosk takes any reader that presents itself as a keyboard (most USB fingerprint and RFID readers in "HID" mode do,
once the vendor's software is set to emit the user id). A standalone biometric terminal (ZKTeco and the like) that
holds the templates itself maps its user ids onto the workers' fingerprint ids (Workers, Enrol); its push API can be
bridged to the same `POST /canteen/claims` call. A vendor SDK that needs installed software belongs in the desktop app
beside the print server; that bridge is the next step once the client names the device.
