import { chromium } from "playwright";
import fs from "node:fs";
const API = "http://localhost:3001/api/v1", WEB = "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const report = { pages: [], consoleErrors: [], failedRequests: [], steps: [] };
const step = (name, ok, info = "") => { report.steps.push({ name, ok, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
const save = () => fs.writeFileSync(OUT + "../report.json", JSON.stringify(report, null, 2));
process.on("uncaughtException", (e) => { console.error("FATAL", String(e).slice(0, 400)); save(); process.exit(2); });

async function api(path, { method = "GET", token, body, branch } = {}) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch-Id": branch } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

const login = await api("/auth/login", { method: "POST", body: { email: "demo@servio.pk", password: "password123" } });
if (login.status !== 200) { console.error("API login failed", login); process.exit(1); }
const T = login.j.access_token;
const me = await api("/me", { token: T }); const branchId = me.j.branches[0].id;
const cat = await api("/catalog", { token: T });
if (!cat.j?.products?.length && !cat.j?.categories?.length) { const s = await api("/onboarding/sample_menu", { method: "POST", token: T }); step("sample menu loaded", s.status < 300, String(s.status)); }
const roles = await api("/roles", { token: T }); const kitchenRole = roles.j.data.find((r) => r.system_key === "kitchen").id;
const staff = await api("/staff", { method: "POST", token: T, body: { name: "E2E Cook", phone: `+9234${String(Date.now()).slice(-8)}`, role_id: kitchenRole, pin: "2222" } });
step("kitchen staff created", staff.status === 201, String(staff.status));
const existing = await api("/devices", { token: T });
for (const d of existing.j?.data || []) if (/^E2E /.test(d.name)) await api(`/devices/${d.id}`, { method: "DELETE", token: T });
const till = await api("/devices", { method: "POST", token: T, body: { name: "E2E till", kind: "till" } });
const kds = await api("/devices", { method: "POST", token: T, body: { name: "E2E kitchen", kind: "kitchen" } });
step("devices created", till.status === 201 && kds.status === 201, `${till.j?.pairing_code} ${kds.j?.pairing_code}`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
function wire(page, label) {
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push({ label, url: page.url(), text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => report.consoleErrors.push({ label, url: page.url(), text: "pageerror: " + String(e).slice(0, 300) }));
  page.on("response", (r) => { if (r.status() >= 500 || (r.status() >= 400 && r.url().includes("/api/v1/") && !/auth\/refresh|lookup/.test(r.url()))) report.failedRequests.push({ label, page: page.url(), url: r.url(), status: r.status() }); });
}
const shot = (page, name) => page.screenshot({ path: OUT + name + ".png", fullPage: false });

const admin = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const a = await admin.newPage(); wire(a, "admin");
await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]", { timeout: 60000 }); await a.fill("input[type=email]", "demo@servio.pk"); await a.fill("input[type=password]", "password123");
await a.getByRole("button", { name: "Log in" }).click();
try { await a.waitForURL(/\/admin/, { timeout: 30000 }); step("admin login", true, a.url()); } catch { step("admin login", false, a.url()); await shot(a, "admin-login-fail"); }
await a.waitForTimeout(1500); await shot(a, "admin-dashboard");
const adminPages = ["/admin", "/admin/orders", "/admin/menu/menus", "/admin/menu/categories", "/admin/menu/products", "/admin/menu/modifier-groups", "/admin/menu/deals", "/admin/menu/promotions", "/admin/menu/tax-rates", "/admin/menu/stations",
  "/admin/customers", "/admin/customers/groups", "/admin/customers/import", "/admin/customers/aging", "/admin/tables", "/admin/staff", "/admin/staff/roles", "/admin/devices", "/admin/shifts", "/admin/day-close", "/admin/tax-invoices",
  "/admin/accounts", "/admin/sync", "/admin/reports", "/admin/settings", "/admin/settings/branches", "/admin/settings/payment-methods", "/admin/settings/checklist", "/admin/audit", "/admin/stock", "/admin/stock/items", "/admin/stock/items/import", "/admin/stock/documents", "/admin/stock/documents/new", "/admin/stock/sheet", "/admin/stock/waste", "/admin/stock/settings", "/admin/stock/sections", "/admin/stock/units", "/admin/stock/recipes", "/admin/stock/recipes/new", "/admin/stock/food-cost", "/admin/stock/production", "/admin/stock/packaging", "/admin/stock/consumption", "/admin/stock/deduction-audits", "/admin/purchasing", "/admin/purchasing/suppliers", "/admin/purchasing/suppliers/import", "/admin/purchasing/orders", "/admin/purchasing/orders/new", "/admin/purchasing/receipts", "/admin/purchasing/receipts/new", "/admin/purchasing/returns", "/admin/purchasing/returns/new", "/admin/purchasing/reorder", "/admin/purchasing/report", "/admin/expenses", "/admin/expenses/categories", "/admin/expenses/overheads", "/admin/delivery", "/admin/delivery/riders", "/admin/delivery/zones", "/admin/qr-orders", "/admin/settings/qr", "/admin/reports/schedules"];
for (const p of adminPages) {
  const before = report.consoleErrors.length, beforeF = report.failedRequests.length;
  const resp = await a.goto(WEB + p, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
  await a.waitForTimeout(400);
  const body = await a.evaluate(() => document.body.innerText).catch(() => "");
  const broken = /Application error|Unhandled Runtime Error|This page could not be found/.test(body || "");
  const r = { path: p, status: resp?.status(), broken, newConsoleErrors: report.consoleErrors.length - before, newFailedRequests: report.failedRequests.length - beforeF, textLength: (body || "").length };
  report.pages.push(r); step(`admin ${p}`, !broken && r.status === 200 && r.newFailedRequests === 0, JSON.stringify(r));
  await shot(a, "admin" + p.replace(/\//g, "_"));
}

const pos = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const t = await pos.newPage(); wire(t, "pos");
await t.goto(WEB + "/pos/pair"); await t.waitForSelector("button", { timeout: 60000 });
for (const d of till.j.pairing_code) await t.getByRole("button", { name: d, exact: true }).first().click();
await t.getByRole("button", { name: "Pair" }).click();
try { await t.waitForURL(/\/pos\/pin/, { timeout: 15000 }); step("till paired", true); } catch { step("till paired", false, t.url()); await shot(t, "pos-pair-fail"); }
for (const d of "1111") await t.getByRole("button", { name: d, exact: true }).first().click();
try { await t.waitForURL(/\/pos$/, { timeout: 15000 }); step("cashier PIN login", true); } catch { step("cashier PIN login", false, t.url()); await shot(t, "pos-pin-fail"); }
await t.waitForTimeout(2500); await shot(t, "pos-main");
const posText = await t.evaluate(() => document.body.innerText);
step("till shows prices", /Rs\s?\d/.test(posText || ""), "");
const burgers = t.getByRole("button", { name: /^Burgers$/ }); if (await burgers.count()) await burgers.first().click(); await t.waitForTimeout(600);
const tiles = t.locator("button").filter({ hasText: /Rs\s?\d/ });
const n = await tiles.count(); step("till product tiles", n > 0, `${n} tiles`);
if (n > 0) {
  await tiles.first().click(); await t.waitForTimeout(800);
  const add = t.getByRole("button", { name: /^Add/ }); if (await add.count()) await add.first().click();
  await t.waitForTimeout(600); await shot(t, "pos-with-item");
  await t.keyboard.press("F5"); await t.waitForTimeout(2500); await shot(t, "pos-after-send");
  const orders = await api(`/orders?open=true`, { token: T, branch: branchId });
  step("order reached the server after F5", (orders.j?.data?.length || 0) > 0, `${orders.j?.data?.length} open orders`);
}

const kctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const k = await kctx.newPage(); wire(k, "kitchen");
await k.goto(WEB + "/pos/pair"); await k.waitForSelector("button", { timeout: 60000 });
for (const d of kds.j.pairing_code) await k.getByRole("button", { name: d, exact: true }).first().click();
await k.getByRole("button", { name: "Pair" }).click(); await k.waitForURL(/\/pos\/pin/, { timeout: 15000 }).catch(() => {});
for (const d of "2222") await k.getByRole("button", { name: d, exact: true }).first().click();
try { await k.waitForURL(/\/kitchen/, { timeout: 15000 }); step("kitchen PIN login routes to /kitchen", true); } catch { step("kitchen PIN login routes to /kitchen", false, k.url()); }
await k.waitForTimeout(3000); await shot(k, "kitchen");
const ktext = await k.evaluate(() => document.body.innerText); step("kitchen shows a ticket", /#\d+/.test(ktext || ""), (ktext || "").slice(0, 120).replace(/\s+/g, " "));
const tok = await kctx.newPage(); wire(tok, "token"); await tok.goto(WEB + "/token"); await tok.waitForTimeout(2000); await shot(tok, "token");
const q = await kctx.newPage(); wire(q, "queue"); await q.goto(WEB + "/queue"); await q.waitForTimeout(2500); await shot(q, "queue");
const qtext = await q.evaluate(() => document.body.innerText); step("queue screen shows preparing or ready", /Preparing|Ready/i.test(qtext || ""), (qtext || "").slice(0, 80).replace(/\s+/g, " "));

await browser.close(); save();
console.log("\nconsole errors:", report.consoleErrors.length, "\nfailed requests:", report.failedRequests.length);
for (const f of report.failedRequests.slice(0, 20)) console.log("  ", f.label, f.status, f.url.replace(API, ""), "on", f.page.replace(WEB, ""));
const seen = new Set(); for (const c of report.consoleErrors) { const key = c.text.slice(0, 120); if (seen.has(key)) continue; seen.add(key); console.log("  ", c.label, c.url.replace(WEB, ""), c.text.slice(0, 200)); if (seen.size > 12) break; }
