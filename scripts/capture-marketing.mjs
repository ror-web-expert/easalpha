// Captures real product screenshots for the marketing site into easalpha-web/public/marketing/.
import { chromium } from "playwright";
import fs from "node:fs";
const API = "http://localhost:3001/api/v1", WEB = "http://localhost:3000";
const OUT = new URL("../easalpha-web/public/marketing/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const api = async (path, { method = "GET", token, body } = {}) => { const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; };
const login = await api("/auth/login", { method: "POST", body: { email: "demo@easalpha.com", password: "password123" } }); const T = login.j.access_token;
for (const d of (await api("/devices", { token: T })).j?.data || []) if (/^Shot /.test(d.name)) await api(`/devices/${d.id}`, { method: "DELETE", token: T });
// The trial plan allows three tills, so reuse the seeded Counter till with a fresh code instead of adding one.
const counter = ((await api("/devices", { token: T })).j?.data || []).find((d) => d.name === "Counter till");
const till = counter ? await api(`/devices/${counter.id}/regenerate_code`, { method: "POST", token: T }) : await api("/devices", { method: "POST", token: T, body: { name: "Shot till", kind: "till" } });
if (!till.j?.pairing_code) { console.error("no till code", till); process.exit(1); }
const kds = await api("/devices", { method: "POST", token: T, body: { name: "Shot kitchen", kind: "kitchen" } });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const shot = async (page, name, opts = {}) => { await page.waitForTimeout(opts.wait ?? 1800); await page.screenshot({ path: OUT + name + ".png", fullPage: false }); console.log("shot", name); };

const admin = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); const a = await admin.newPage();
await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]"); await a.fill("input[type=email]", "demo@easalpha.com"); await a.fill("input[type=password]", "password123");
await a.getByRole("button", { name: "Log in" }).click(); await a.waitForURL(/\/admin/, { timeout: 60000 });
const adminShots = [["/admin", "admin-dashboard"], ["/admin/orders", "admin-orders"], ["/admin/products/catalog", "admin-catalog"], ["/admin/inventory/stock-in-hand", "admin-stock"], ["/admin/inventory-reports/deduction-health", "admin-deduction-health"],
  ["/admin/reports/grand", "admin-grand-report"], ["/admin/finance/dashboard", "admin-finance"], ["/admin/finance/balance-sheet", "admin-balance-sheet"], ["/admin/payroll/fingerprint", "admin-attendance"], ["/admin/suppliers/ledger", "admin-supplier-ledger"],
  ["/admin/settings/whatsapp", "admin-whatsapp"], ["/admin/staff/roles", "admin-permissions"], ["/admin/reports/sales-calendar", "admin-sales-calendar"]];
const widen = async (page) => {
  // richer screenshots: the last 30 days rather than today's handful
  await page.getByText("Last 30 days", { exact: true }).first().click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(1500);
  const preset = page.locator("select").filter({ hasText: "Last 30 days" }).first();
  if (await preset.count().catch(() => 0)) await preset.selectOption({ label: "Last 30 days" }).catch(() => {});
};
if (!process.argv.includes("--pos-only")) for (const [path, name] of adminShots) { await a.goto(WEB + path); await a.waitForTimeout(800); await widen(a); await shot(a, name); }
await admin.close();

const pos = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 }); const t = await pos.newPage();
await t.goto(WEB + "/pos/pair"); await t.waitForSelector("button", { timeout: 60000 });
for (const d of till.j.pairing_code) await t.getByRole("button", { name: d, exact: true }).first().click();
await t.getByRole("button", { name: "Pair" }).click(); await t.waitForURL(/\/pos\/pin/, { timeout: 20000 });
for (const d of "1111") await t.getByRole("button", { name: d, exact: true }).first().click();
await t.waitForURL(/\/pos$/, { timeout: 20000 }).catch(() => {}); await t.waitForTimeout(2500);
await t.getByText("Burgers", { exact: true }).first().click().catch(() => {}); await t.waitForTimeout(800);
for (const name of ["Chicken Patty Burger", "Zinger Burger"]) await t.getByText(name, { exact: false }).first().click().catch(() => {});
await shot(t, "pos-till", { wait: 1500 });
await pos.close();

const kitchen = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 }); const k = await kitchen.newPage();
await k.goto(WEB + "/pos/pair"); await k.waitForSelector("button", { timeout: 60000 });
for (const d of kds.j.pairing_code) await k.getByRole("button", { name: d, exact: true }).first().click();
await k.getByRole("button", { name: "Pair" }).click(); await k.waitForURL(/\/pos\/pin/, { timeout: 20000 }).catch(() => {});
for (const d of "3333") await k.getByRole("button", { name: d, exact: true }).first().click();
await k.waitForURL(/\/kitchen/, { timeout: 20000 }).catch(() => {}); await shot(k, "kitchen-display", { wait: 3000 });
await kitchen.close();

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true }); const p = await phone.newPage();
await p.goto(WEB + "/store/demo-cafe"); await shot(p, "storefront-phone", { wait: 2500 });
await p.goto(WEB + "/rider/pair"); await shot(p, "rider-pair", { wait: 1500 });
await phone.close();
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); const s = await desk.newPage();
await s.goto(WEB + "/store/demo-cafe"); await shot(s, "storefront-desktop", { wait: 2500 });
await browser.close();
for (const d of (await api("/devices", { token: T })).j?.data || []) if (/^Shot /.test(d.name)) await api(`/devices/${d.id}`, { method: "DELETE", token: T });
console.log("done", fs.readdirSync(OUT).length, "files");
console.log("Next's image optimiser caches old versions: rm -rf easalpha-web/.next/cache/images and restart the web server to serve the new captures.");
