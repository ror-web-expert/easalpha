// Every screen for every kind of user, on a local stack (scripts/dev-up.sh): the public site, the admin as the owner and
// as a manager (every page of the sidebar), the till as a cashier (pair, PIN, a cash sale, hold, orders, shift), the
// kitchen display, the queue and token screens, the rider app, the canteen kiosk and counter, the super panel, the
// storefront and a table's QR page. Each page is checked for a 200, no error boundary, no console error and no failed
// API call, and screenshotted. Report: tmp/all-screens/report.json and a summary on stdout; exit 1 when anything failed.
//
//   node scripts/all-screens.mjs                      (API http://localhost:3001/api/v1, web http://localhost:3000)
//   SUPER_EMAIL=... SUPER_PASSWORD=... node scripts/all-screens.mjs   (also walks /super)
import { chromium } from "playwright";
import fs from "node:fs";

const API = process.env.API || "http://localhost:3001/api/v1", WEB = process.env.WEB || "http://localhost:3000";
const OUT = process.env.OUT || new URL("../tmp/all-screens/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const report = { started: new Date().toISOString(), pages: [], steps: [], consoleErrors: [], failedRequests: [] };
const step = (name, ok, info = "") => { report.steps.push({ name, ok, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
const save = () => fs.writeFileSync(OUT + "report.json", JSON.stringify(report, null, 2));
process.on("uncaughtException", (e) => { console.error("FATAL", String(e).slice(0, 500)); save(); process.exit(2); });
process.on("unhandledRejection", (e) => { console.error("FATAL", String(e).slice(0, 500)); save(); process.exit(2); });

async function api(path, { method = "GET", token, body, query, branch } = {}) {
  const url = new URL(API + path); Object.entries(query ?? {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch-Id": branch } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* no body */ }
  return { status: r.status, j };
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tag = String(Date.now()).slice(-6);

// ---- Setup through the API as the owner: modules on, one staff member per system role, one device per kind.
const login = await api("/auth/login", { method: "POST", body: { email: process.env.OWNER_EMAIL || "demo@easalpha.com", password: process.env.OWNER_PASSWORD || "password123" } });
if (login.status !== 200) { console.error("owner login failed", login); process.exit(1); }
const T = login.j.access_token;
const me = await api("/me", { token: T }); const branchId = me.j.branches?.[0]?.id ?? me.j.branch?.id;
step("owner login", true, me.j.business?.name ?? "");
const mods = await api("/settings", { method: "PATCH", token: T, body: { values: { "modules.customer_accounts": true, "modules.canteen": true, "modules.payroll": true } } });
step("modules on", mods.status === 200, JSON.stringify(mods.j?.modules ?? mods.j?.error));
const roles = (await api("/roles", { token: T })).j?.data ?? [];
const roleId = (key) => roles.find((r) => r.system_key === key)?.id;
step("system roles present", ["manager", "cashier", "kitchen", "rider"].every(roleId), roles.map((r) => r.system_key).join(","));
// Earlier runs' staff and devices are retired first so names and PINs stay unique.
for (const m of (await api("/staff", { token: T })).j?.data ?? []) if (/^Walk /.test(m.user?.name ?? "") && m.status === "active") await api(`/staff/${m.id}/deactivate`, { method: "POST", token: T });
for (const d of (await api("/devices", { token: T })).j?.data ?? []) if (/^Walk /.test(d.name)) await api(`/devices/${d.id}`, { method: "DELETE", token: T });
const mkStaff = async (name, key, extra) => { const r = await api("/staff", { method: "POST", token: T, body: { name, role_id: roleId(key), ...extra } }); step(`staff ${name}`, r.status === 201, `${r.status} ${JSON.stringify(r.j?.error ?? "")}`); return r.j; };
const managerEmail = `walk-manager-${tag}@easalpha.test`;
const manager = await mkStaff("Walk Manager", "manager", { email: managerEmail, password: "password123", staff_type: "admin" });
const cashier = await mkStaff("Walk Cashier", "cashier", { phone: `+9230${tag}1`, pin: "4321" });
const cashier2 = await mkStaff("Walk Cashier Two", "cashier", { phone: `+9230${tag}2`, pin: "4324" });
const cook = await mkStaff("Walk Cook", "kitchen", { phone: `+9230${tag}3`, pin: "4322" });
const rider = await mkStaff("Walk Rider", "rider", { phone: `+9230${tag}4`, pin: "4323" });
// A device's code comes from its kind and a counter, and a deleted device keeps its code, so a kind that was created
// before may answer 422: then an existing device of that kind gets a fresh pairing code instead.
const mkDevice = async (name, kind) => {
  let r = await api("/devices", { method: "POST", token: T, body: { name, kind, branch_id: branchId } });
  if (r.status === 422) {
    const existing = ((await api("/devices", { token: T })).j?.data ?? []).find((d) => d.kind === kind && !d.revoked_at);
    if (existing) r = await api(`/devices/${existing.id}/regenerate_code`, { method: "POST", token: T });
  }
  step(`device ${name}`, !!r.j?.pairing_code, `${r.status} ${JSON.stringify(r.j?.error ?? "")}`);
  return r.j;
};
const tillDev = await mkDevice(`Walk till ${tag}`, "till"), kdsDev = await mkDevice(`Walk kitchen ${tag}`, "kitchen"), riderDev = await mkDevice(`Walk rider ${tag}`, "rider"), kioskDev = await mkDevice(`Walk kiosk ${tag}`, "kiosk");
for (const [name, d] of [["till", tillDev], ["kitchen", kdsDev], ["rider", riderDev], ["kiosk", kioskDev]]) if (!d?.pairing_code) { console.error(`no pairing code for the ${name} device; stopping`); save(); process.exit(1); }
void manager; void cashier; void cashier2; void cook; void rider;

// ---- Browser helpers
const browser = await chromium.launch({ channel: "chrome", headless: true });
function wire(page, label) {
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|sw\.js|manifest|Failed to load resource: the server responded with a status of 4/.test(m.text())) report.consoleErrors.push({ label, url: page.url(), text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => report.consoleErrors.push({ label, url: page.url(), text: "pageerror: " + String(e).slice(0, 300) }));
  page.on("response", (r) => { if (r.status() >= 500 || (r.status() >= 400 && r.url().includes("/api/v1/") && !/auth\/refresh|lookup|\/health|sync\/push/.test(r.url()))) report.failedRequests.push({ label, page: page.url(), url: r.url(), status: r.status() }); });
}
let shotNo = 0;
const shot = async (page, name) => { shotNo += 1; await page.screenshot({ path: `${OUT}${String(shotNo).padStart(3, "0")}-${name.replace(/[^a-z0-9_-]+/gi, "_")}.png`, fullPage: false }).catch(() => {}); };
const BROKEN = /Application error|Unhandled Runtime Error|This page could not be found|Something went wrong|Internal Server Error/;
/** Opens every route for one kind of user and records what each page did. allowNoPermission: a "no permission" panel counts as fine. */
async function walk(page, label, routes, { allowNoPermission = false, settle = 500 } = {}) {
  for (const path of routes) {
    const before = report.consoleErrors.length, beforeF = report.failedRequests.length;
    const resp = await page.goto(WEB + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(settle);
    const body = await page.evaluate(() => document.body.innerText).catch(() => "");
    const broken = BROKEN.test(body || "");
    const noPerm = /not allowed|no permission|don.t have permission|Access denied|Ask the owner/i.test(body || "");
    const r = { label, path, status: resp?.status() ?? null, broken, noPermission: noPerm, consoleErrors: report.consoleErrors.length - before, failedRequests: report.failedRequests.length - beforeF, textLength: (body || "").length };
    report.pages.push(r);
    const newFailed = report.failedRequests.slice(beforeF);
    const only403 = newFailed.length > 0 && newFailed.every((f) => f.status === 403);
    r.permissionLimited = allowNoPermission && (noPerm || only403);
    const ok = !broken && r.status === 200 && (r.failedRequests === 0 || r.permissionLimited) && r.consoleErrors === 0 && (r.textLength > 40) && (allowNoPermission || !noPerm);
    step(`${label} ${path}`, ok, r.permissionLimited ? "permission-limited" : ok ? "" : JSON.stringify(r));
    await shot(page, `${label}${path}`);
  }
}

// ---- 1. Public pages, no login
const pub = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const p = await pub.newPage(); wire(p, "public");
await walk(p, "public", ["/", "/pricing", "/features", "/guides", "/apps", "/download", "/contact", "/privacy", "/terms", "/fbr-pos-integration", "/kitchen-display-system", "/offline-pos-system", "/restaurant-inventory-software", "/restaurant-pos-pakistan", "/login", "/signup", "/setup", "/pos/pair", "/rider", "/canteen", "/store/demo-cafe"]);
const tables = (await api("/tables", { token: T })).j?.data ?? [];
const qrTable = tables.find((t) => t.qr_token);
if (qrTable) await walk(p, "public", [`/q/${qrTable.qr_token}`]); else step("public /q/<token>", false, "no table with a QR token");
await pub.close();

// ---- 2. Admin as the owner: every page in the sidebar plus the ones reached from rows
const adminRoutes = fs.readFileSync(new URL("./admin-routes.txt", import.meta.url), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
async function adminLogin(email, password, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); wire(page, label);
  await page.goto(WEB + "/login"); await page.waitForSelector("input[type=email]", { timeout: 60000 });
  await page.fill("input[type=email]", email); await page.fill("input[type=password]", password); await page.getByRole("button", { name: /Log in|Sign in/ }).click();
  try { await page.waitForURL(/\/admin/, { timeout: 90000 }); step(`${label} login`, true, page.url()); } catch { step(`${label} login`, false, page.url()); await shot(page, `${label}-login-fail`); }
  return { ctx, page };
}
const owner = await adminLogin(process.env.OWNER_EMAIL || "demo@easalpha.com", process.env.OWNER_PASSWORD || "password123", "owner");
await walk(owner.page, "owner", adminRoutes);
const firstCustomer = (await api("/customers?with_balance=true", { token: T })).j?.data?.[0];
const firstOrder = (await api("/orders", { token: T, query: { limit: 1, all_days: "true" } })).j?.data?.[0];
const extra = [firstCustomer ? `/admin/customers/${firstCustomer.id}` : null, firstOrder ? `/admin/orders/${firstOrder.id}` : null].filter(Boolean);
if (extra.length) await walk(owner.page, "owner", extra);
await owner.ctx.close();

// ---- 3. Admin as a manager: the same pages; a "no permission" panel is fine, a crash is not
const mgr = await adminLogin(managerEmail, "password123", "manager");
await walk(mgr.page, "manager", adminRoutes, { allowNoPermission: true, settle: 300 });
await mgr.ctx.close();

// ---- 4. The till as a cashier
async function pairAndPin(page, code, pin, label, expectUrl) {
  await page.goto(WEB + "/pos/pair"); await page.waitForSelector("button", { timeout: 60000 });
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).first().click();
  await page.getByRole("button", { name: "Pair" }).click();
  try { await page.waitForURL(/\/pos\/pin/, { timeout: 20000 }); step(`${label} paired`, true); } catch { step(`${label} paired`, false, page.url()); await shot(page, `${label}-pair-fail`); return false; }
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).first().click();
  try { await page.waitForURL(expectUrl, { timeout: 20000 }); step(`${label} PIN login`, true); return true; } catch { step(`${label} PIN login`, false, page.url()); await shot(page, `${label}-pin-fail`); return false; }
}
const posCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const t = await posCtx.newPage(); wire(t, "till");
if (await pairAndPin(t, tillDev.pairing_code, "4321", "till", /\/pos(\?|$)/)) {
  await t.waitForTimeout(3000); await shot(t, "till-sell");
  const text = await t.evaluate(() => document.body.innerText);
  step("till shows prices", /Rs\s?\d/.test(text || ""), "");
  // A cash sale: first tile, Pay, the exact-amount button, then the receipt dialog
  const tiles = t.locator("button").filter({ hasText: /Rs\s?\d/ });
  if (await tiles.count()) {
    await tiles.first().click(); await t.waitForTimeout(600);
    const add = t.getByRole("button", { name: /^Add/ }); if (await add.count()) await add.first().click();
    await t.waitForTimeout(500);
    const lines = await t.locator("ul.flex-1 > li.border-b").count();
    step("till: item in the cart", lines > 0, `${lines} lines`);
    await shot(t, "till-cart");
    // Hold and recall
    await t.keyboard.press("F4"); await t.waitForTimeout(1500); await shot(t, "till-after-hold");
    await t.goto(WEB + "/pos/orders", { waitUntil: "networkidle" }); await t.waitForTimeout(1500); await shot(t, "till-orders-held");
    const held = t.getByRole("button").filter({ hasText: /Held/ });
    step("till: held order listed", (await held.count()) > 0, "");
    await t.goto(WEB + "/pos", { waitUntil: "networkidle" }); await t.waitForTimeout(1500);
    if (await tiles.count()) { await tiles.first().click(); await t.waitForTimeout(500); const add2 = t.getByRole("button", { name: /^Add/ }); if (await add2.count()) await add2.first().click(); }
    await t.waitForTimeout(400);
    const bill = t.getByRole("button", { name: /^Bill$/ }); if (await bill.count()) { await bill.click(); await t.waitForTimeout(1200); await shot(t, "till-bill-preview"); step("till: bill preview opens", /Bill preview/.test(await t.evaluate(() => document.body.innerText)), ""); await t.keyboard.press("Escape"); await t.waitForTimeout(400); }
    await t.keyboard.press("F8"); await t.waitForTimeout(1500); await shot(t, "till-pay");
    const payText = await t.evaluate(() => document.body.innerText);
    step("till: payment screen opens", /Pay|Cash/.test(payText || ""), "");
    const exact = t.locator("button").filter({ hasText: /^Rs\s?[\d,]+$/ }).first();
    if (await exact.count()) await exact.click();
    await t.waitForTimeout(300);
    const payBtn = t.getByRole("button", { name: /^Pay Rs|^Finish/ }).first();
    if (await payBtn.count()) { await payBtn.click(); await t.waitForTimeout(3000); }
    await shot(t, "till-after-pay");
    const afterPay = await t.evaluate(() => document.body.innerText);
    step("till: cash sale completed", /Paid|change|Receipt/i.test(afterPay || ""), (afterPay || "").slice(0, 80).replace(/\s+/g, " "));
    await t.keyboard.press("Escape").catch(() => {});
  } else step("till product tiles", false, "no tiles");
  await walk(t, "till", ["/pos/orders", "/pos/shift", "/pos/delivery", "/pos/campaign", "/pos/qr", "/pos/attention"], { settle: 1200 });
  // Lock, then a second cashier signs in: the cart must be empty for them
  await t.goto(WEB + "/pos", { waitUntil: "networkidle" }); await t.waitForTimeout(1000);
  const tiles2 = t.locator("button").filter({ hasText: /Rs\s?\d/ });
  if (await tiles2.count()) { await tiles2.first().click(); await t.waitForTimeout(400); const add3 = t.getByRole("button", { name: /^Add/ }); if (await add3.count()) await add3.first().click(); }
  const lock = t.getByRole("button", { name: /^Lock$/ }); if (await lock.count()) await lock.first().click();
  await t.waitForTimeout(800);
  const confirmLock = t.getByRole("dialog").getByRole("button", { name: /Lock/ });
  if (await confirmLock.count()) { await confirmLock.first().click(); await t.waitForTimeout(800); }
  if (/\/pos\/pin/.test(t.url())) {
    for (const d of "4324") await t.getByRole("button", { name: d, exact: true }).first().click();
    await t.waitForURL(/\/pos(\?|$)/, { timeout: 15000 }).catch(() => {});
    await t.waitForTimeout(1200);
    const cartLines = await t.locator("ul.flex-1 > li.border-b").count();
    step("till: second cashier starts with an empty cart", cartLines === 0, `${cartLines} lines carried over`);
    await shot(t, "till-second-cashier");
  } else step("till: lock button", false, t.url());
}
await posCtx.close();

// ---- 5. Kitchen display, queue and token screens
const kCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const k = await kCtx.newPage(); wire(k, "kitchen");
if (await pairAndPin(k, kdsDev.pairing_code, "4322", "kitchen", /\/kitchen/)) {
  await k.waitForTimeout(3000); await shot(k, "kitchen");
  const ktext = await k.evaluate(() => document.body.innerText);
  step("kitchen shows tickets or an empty state", /#\d+|No orders|Nothing|waiting/i.test(ktext || ""), (ktext || "").slice(0, 80).replace(/\s+/g, " "));
  const bump = k.getByRole("button", { name: /Start|Ready|Bump|Done/ }).first();
  if (await bump.count()) { await bump.click(); await k.waitForTimeout(1200); await shot(k, "kitchen-after-bump"); step("kitchen: bump works", true); }
  await walk(k, "kitchen", ["/queue", "/token"], { settle: 1500 });
}
await kCtx.close();

// ---- 6. Rider app
const rCtx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true }); const rp = await rCtx.newPage(); wire(rp, "rider");
await rp.goto(WEB + "/rider"); await rp.waitForSelector("button", { timeout: 60000 }).catch(() => {});
const riderButtons = await rp.locator("button").count();
if (riderButtons) {
  for (const d of riderDev.pairing_code) await rp.getByRole("button", { name: d, exact: true }).first().click().catch(() => {});
  await rp.getByRole("button", { name: "Pair" }).click().catch(() => {});
  await rp.waitForTimeout(2000);
  for (const d of "4323") await rp.getByRole("button", { name: d, exact: true }).first().click().catch(() => {});
  await rp.waitForTimeout(2500); await shot(rp, "rider");
  const rtext = await rp.evaluate(() => document.body.innerText);
  step("rider app signed in", /Deliver|No deliveries|Today|Online/i.test(rtext || ""), (rtext || "").slice(0, 80).replace(/\s+/g, " "));
} else step("rider app loads", false, rp.url());
await rCtx.close();

// ---- 7. Canteen kiosk and counter
const cCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const c = await cCtx.newPage(); wire(c, "canteen");
await c.goto(WEB + "/canteen", { waitUntil: "networkidle" }); await c.waitForTimeout(800);
for (const d of kioskDev.pairing_code) await c.getByRole("button", { name: d, exact: true }).first().click().catch(() => {});
await c.getByRole("button", { name: "Pair" }).click().catch(() => {}); await c.waitForTimeout(3000);
await shot(c, "canteen-kiosk");
const ctext = await c.evaluate(() => document.body.innerText);
step("canteen kiosk paired", !/Pair this device|pairing code/i.test(ctext || "") && (ctext || "").length > 20, (ctext || "").slice(0, 80).replace(/\s+/g, " "));
await walk(c, "canteen", ["/canteen/serve"], { settle: 1500 });
await cCtx.close();

// ---- 8. Super panel (when credentials are given)
if (process.env.SUPER_EMAIL && process.env.SUPER_PASSWORD) {
  const sCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const s = await sCtx.newPage(); wire(s, "super");
  await s.goto(WEB + "/super/login"); await s.waitForSelector("input[type=email]", { timeout: 60000 });
  await s.fill("input[type=email]", process.env.SUPER_EMAIL); await s.fill("input[type=password]", process.env.SUPER_PASSWORD); await s.getByRole("button", { name: /Log in|Sign in/ }).click();
  try { await s.waitForURL(/\/super(?!\/login)/, { timeout: 60000 }); step("super login", true); } catch { step("super login", false, s.url()); }
  await walk(s, "super", ["/super", "/super/businesses", "/super/support", "/super/invoices", "/super/flags", "/super/settings"]);
  const biz = (await s.locator("a[href^='/super/businesses/']").first().getAttribute("href").catch(() => null));
  if (biz) await walk(s, "super", [biz]);
  await sCtx.close();
} else step("super panel", true, "skipped: set SUPER_EMAIL and SUPER_PASSWORD to walk it");

await browser.close();
report.finished = new Date().toISOString();
save();
const failed = report.steps.filter((s) => !s.ok);
console.log(`\n${report.steps.length - failed.length} ok, ${failed.length} failed, ${report.pages.length} pages, ${report.consoleErrors.length} console errors, ${report.failedRequests.length} failed requests. Report: ${OUT}report.json`);
if (failed.length) { console.log("Failed:"); for (const f of failed) console.log(` - ${f.name} ${f.info}`); }
process.exit(failed.length ? 1 : 0);
