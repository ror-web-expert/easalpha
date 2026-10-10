# Servio: local logins and URLs

Demo data for local testing only. Updated 9 Oct 2026.

## URLs

| What | URL |
|---|---|
| Admin panel login | http://localhost:3000/login |
| Admin panel | http://localhost:3000/admin |
| Till (POS) | http://localhost:3000/pos |
| Kitchen display | http://localhost:3000/kitchen |
| Token screen | http://localhost:3000/token |
| Customer queue screen | http://localhost:3000/queue |
| API health | http://localhost:3001/api/v1/health |

## Admin panel users (business "Demo Cafe")

| Role | Email | Password | PIN |
|---|---|---|---|
| Owner | demo@servio.pk | password123 | none |
| Manager | manager@servio.pk | password123 | 9999 |

## Till and kitchen staff (PIN login on a paired device)

| Role | Name | PIN |
|---|---|---|
| Cashier | Demo Cashier | 1111 |
| Manager (approvals) | Demo Manager | 9999 |
| Kitchen | E2E Cook (test user) | 2222 |

## Device pairing codes

| Device | Kind | Pairing code |
|---|---|---|
| Counter till | till | 123456 |
| Kitchen screen | kitchen | 654321 |

If a code no longer works, open Admin, Devices, and press "Regenerate code". The trial plan allows 3 tills.

## How to use the till

1. Open http://localhost:3000/pos/pair and enter 123456.
2. Enter cashier PIN 1111.
3. Open a shift, pick a category, add items, press F5 to send to the kitchen, F8 to pay.

## How to use the kitchen screen

1. In a second browser window, open http://localhost:3000/pos/pair and enter 654321.
2. Enter PIN 2222. The kitchen display opens and shows orders sent from the till.

## Database

| Item | Value |
|---|---|
| Host and port | localhost:5434 (Docker container `servio-pg`) |
| User | postgres |
| Password | postgres |
| Database | servio_development |

## Restart everything

```
docker start servio-pg
cd servio-api && bin/dev           # API on 3001 plus background jobs
cd servio-web && pnpm dev -p 3000  # web app on 3000
```
