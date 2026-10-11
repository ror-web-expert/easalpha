// EasAlpha WhatsApp gateway. One WhatsApp Web session per business: the owner scans a QR code with any phone
// (WhatsApp > Linked devices) and EasAlpha sends receipts, statements and alerts from that number.
// Sessions persist on disk under ./sessions/<business id> so a restart does not need a new scan.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT || 3010);
const TOKEN = process.env.WHATSAPP_GATEWAY_TOKEN || "";
const ROOT = path.resolve(process.env.SESSIONS_DIR || "./sessions");
const log = pino({ level: process.env.LOG_LEVEL || "info" });
const sessions = new Map(); // id -> { sock, status, qr, phone, connectedAt, lastError, starting }

fs.mkdirSync(ROOT, { recursive: true });

function safeId(id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("bad session id");
  return id;
}

function view(s) {
  return { status: s?.status || "disconnected", qr: s?.qr || null, phone: s?.phone || null, connected_at: s?.connectedAt || null, last_error: s?.lastError || null };
}

async function start(id) {
  const existing = sessions.get(id);
  if (existing && (existing.status === "connected" || existing.starting)) return existing;
  const s = existing || { status: "connecting", qr: null, phone: null, connectedAt: null, lastError: null };
  s.starting = true;
  s.status = "connecting";
  sessions.set(id, s);
  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(ROOT, id));
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({ auth: state, version, printQRInTerminal: false, logger: log.child({ id, level: "warn" }), browser: ["EasAlpha", "Chrome", "1.0"], syncFullHistory: false, markOnlineOnConnect: false });
    s.sock = sock;
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        s.status = "qr";
        s.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 280 });
      }
      if (u.connection === "open") {
        s.status = "connected";
        s.qr = null;
        s.lastError = null;
        s.connectedAt = new Date().toISOString();
        const jid = sock.user?.id || "";
        s.phone = jid ? "+" + jid.split(":")[0].split("@")[0] : null;
        log.info({ id, phone: s.phone }, "connected");
      }
      if (u.connection === "close") {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        s.status = "disconnected";
        s.qr = null;
        s.lastError = loggedOut ? "The phone unlinked this device" : `Connection closed (${code || "unknown"})`;
        log.warn({ id, code }, "closed");
        if (loggedOut) {
          fs.rmSync(path.join(ROOT, id), { recursive: true, force: true });
          s.phone = null;
        } else {
          setTimeout(() => start(id).catch(() => {}), 3000); // reconnect, the saved credentials are still valid
        }
      }
    });
  } catch (e) {
    s.status = "disconnected";
    s.lastError = e.message;
  } finally {
    s.starting = false;
  }
  return s;
}

async function logout(id) {
  const s = sessions.get(id);
  try { await s?.sock?.logout(); } catch { /* already gone */ }
  try { s?.sock?.end?.(); } catch { /* ignore */ }
  fs.rmSync(path.join(ROOT, id), { recursive: true, force: true });
  sessions.set(id, { status: "disconnected", qr: null, phone: null, connectedAt: null, lastError: null });
  return sessions.get(id);
}

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));
app.get("/sessions/:id", (req, res) => res.json(view(sessions.get(safeId(req.params.id)))));
app.post("/sessions/:id/start", async (req, res) => res.status(202).json(view(await start(safeId(req.params.id)))));
app.post("/sessions/:id/logout", async (req, res) => res.json(view(await logout(safeId(req.params.id)))));
app.post("/sessions/:id/send", async (req, res) => {
  const s = sessions.get(safeId(req.params.id));
  if (!s || s.status !== "connected") return res.status(409).json({ ok: false, last_error: "No phone is linked. Scan the QR code in Settings, WhatsApp." });
  const to = String(req.body?.to || "").replace(/\D/g, "");
  const text = String(req.body?.text || "").slice(0, 4000);
  if (!to || !text) return res.status(400).json({ ok: false, last_error: "to and text are required" });
  try {
    const r = await s.sock.sendMessage(`${to}@s.whatsapp.net`, { text });
    res.json({ ok: true, message_id: r?.key?.id || null });
  } catch (e) {
    res.status(502).json({ ok: false, last_error: e.message });
  }
});
app.use((err, _req, res, _next) => res.status(400).json({ error: err.message }));

// Resume every saved session at boot so linked phones reconnect without a new scan.
for (const id of fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) start(id).catch(() => {});

app.listen(PORT, () => log.info({ port: PORT }, "easalpha-whatsapp gateway listening"));
