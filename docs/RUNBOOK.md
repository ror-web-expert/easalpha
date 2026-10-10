# Servio runbook

How to run everything that exists today, test it, and find your way around. Updated 9 Oct 2026.

## Services

| Service | Command | Port |
|---|---|---|
| PostgreSQL 16 | `docker start servio-pg` (first run: `docker run -d --name servio-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p 5434:5432 -v servio_pgdata:/var/lib/postgresql/data postgres:16-alpine`) | 5434 |
| API | `cd servio-api && bin/rails s -p 3001` | 3001 |
| Background jobs | `cd servio-api && bin/jobs` (tax sync, WhatsApp, daily summary, billing lifecycle, scheduled reports, birthday offers, campaign sends, reservation reminders, pre-order due alerts; see `config/recurring.yml`) | - |
| Web app (admin, till, kitchen, token, queue) | `cd servio-web && NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 pnpm dev` | 3000 |
| Both API and jobs together | `cd servio-api && bin/dev` | 3001 |

Environment variables for the API (all optional in development): `PGHOST PGPORT PGUSER PGPASSWORD`, `CORS_ORIGINS`, `WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_SECRET`, `TAX_FBR_URL TAX_PRA_URL`, `PADDLE_WEBHOOK_SECRET`, `BILLING_JAZZCASH BILLING_EASYPAISA BILLING_BANK`, `SERVIO_APP_DB_PASSWORD` (the non-superuser database role that Row-Level Security applies to; production must connect as this role), `SERVIO_QR_BASE_URL` (the public host printed on QR table cards, default https://order.servio.pk; the card opens `<base>/q/<token>` which calls the public `GET /api/v1/qr/:token`). Foodpanda: the per-business secret is set from Settings, Integrations (or `PATCH /integrations/foodpanda` with `secret: "rotate"`), and Foodpanda posts signed JSON to `POST /api/v1/webhooks/foodpanda/<business slug>` with header `X-Signature: sha256=<HMAC>`.

## First-time setup

```
cd servio-api
bundle install
bin/rails db:create db:migrate db:seed
RAILS_ENV=test bin/rails db:create db:schema:load
```

`db:seed` creates the plans, the shared WhatsApp templates and a demo business:

| What | Value |
|---|---|
| Owner login | demo@servio.pk / password123 |
| Manager | manager@servio.pk / password123, PIN 9999 |
| Cashier | PIN 1111 |
| Till pairing code | 123456 |
| Kitchen screen pairing code | 654321 |
| Demo stock | 6 stock items in Warehouse and Kitchen, a Zinger Burger recipe, takeaway and delivery packaging rules |
| Demo purchasing | Metro Cash & Carry (open PO) and Gourmet Bakers (one receipt) |

## Tests

```
cd servio-api && bundle exec rspec            # 100+ request and model specs, tenant isolation on every resource
cd servio-api && bin/rails s -p 3001 &        # then the manual-style smoke run
scripts/smoke/phase1.sh http://localhost:3001  # 87 curl checks: signup to day close
scripts/smoke/phase2.sh http://localhost:3001  # 205 curl checks: stock, recipes, purchasing, expenses, delivery, riders, QR, schedules, loyalty, reservations, finance, Foodpanda, payroll
# Browser check of the web app (needs Chrome and `npm i playwright` in a scratch folder next to scripts/e2e-web.mjs):
node scripts/e2e-web.mjs                        # admin pages, till pairing and PIN, an order to the kitchen, token and queue screens
cd servio-api && bundle exec brakeman -q      # security scan
```

## Where things are

| Area | Path |
|---|---|
| Routes (238 endpoints) | `servio-api/config/routes.rb`, listed in `docs/api-reference.md` |
| Tenancy and RLS | `app/models/concerns/tenanted.rb`, `app/services/tenancy/context.rb`, `lib/servio/rls.rb` |
| Auth, PINs, devices | `app/services/auth/*`, `app/controllers/api/v1/{auth,devices}_controller.rb` |
| Orders | `app/services/orders/{builder,pricing,transitions}.rb` |
| Kitchen | `app/services/kitchen/tickets.rb`, `app/controllers/api/v1/kitchen_controller.rb`, `app/channels/*` |
| Payments, refunds, khata | `app/services/payments/*`, `app/services/receipts/builder.rb` |
| Shifts, Z report, day close | `app/services/shifts/*` |
| Tax | `app/services/tax/*`, `app/jobs/tax_*` |
| Offline sync | `app/services/sync/{push,changes}.rb`, `app/controllers/api/v1/sync_controller.rb` |
| Reports | `app/services/reports/*` |
| Billing | `app/services/billing/*`, `app/jobs/billing_lifecycle_job.rb` |
| Response shapes | `app/services/*serializers.rb` |

## Production notes

- Connect the API as the `servio_app` database role, not `postgres`, so Row-Level Security applies. Create it with the password in `SERVIO_APP_DB_PASSWORD`; migrations create the role and grants.
- Run `bin/jobs` as a separate process. Recurring jobs are in `config/recurring.yml` (tax queue sweep every 5 minutes, daily summaries at 23:00 Asia/Karachi). Add `BillingLifecycleJob` daily.
- Set `CORS_ORIGINS` to the web app's origin(s). Set `RAILS_MASTER_KEY`.
- Deploy by tag between 3 pm and 5 pm Pakistan time, as the blueprint says.

## WhatsApp by QR and push notifications

- Gateway: `cd servio-whatsapp && npm install && WHATSAPP_GATEWAY_TOKEN=<secret> npm start` (port 3010). Start the API with `WHATSAPP_GATEWAY_URL=http://localhost:3010 WHATSAPP_GATEWAY_TOKEN=<secret>`. In the admin panel open Settings, WhatsApp, Connect a phone, press Start and scan the QR with WhatsApp (Linked devices, Link a device). Sessions persist in `servio-whatsapp/sessions/`.
- Push: nothing to configure for a single server (keys are generated and stored). For several API servers set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (mailto:). Users enable push per device from Settings, Notifications (admin), the POS shift page, the kitchen header or the rider app.
