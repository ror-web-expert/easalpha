# servio-whatsapp

WhatsApp gateway for EasAlpha. The owner opens Settings, WhatsApp, Connect a phone, scans the QR code with any WhatsApp number (WhatsApp, Linked devices, Link a device), and EasAlpha sends receipts, account statements, vouchers and owner alerts from that number. No Meta business account is needed.

Run it next to the API:

```bash
cd servio-whatsapp && npm install && WHATSAPP_GATEWAY_TOKEN=change-me npm start   # listens on 3010
```

Point the API at it: `WHATSAPP_GATEWAY_URL=http://localhost:3010` and the same `WHATSAPP_GATEWAY_TOKEN`. Sessions persist in `./sessions/` so a restart does not need a new scan. One session per business.

Endpoints (bearer token): `GET /sessions/:id`, `POST /sessions/:id/start`, `POST /sessions/:id/logout`, `POST /sessions/:id/send { to, text }`, `GET /health`.

Note: this links a normal WhatsApp account the same way WhatsApp Web does. Keep message volume reasonable (receipts, statements, alerts); for bulk marketing at scale use the Meta Cloud API provider instead.
