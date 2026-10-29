// Canteen module walk-through with screenshots (29 Oct 2026): switches the module on for the demo business, sets up
// sessions, workers and a published plan through the API, then drives the admin pages, the kiosk (fingerprint typed as
// a keyboard reader would), the "already taken" refusal, an offline meal, the counter and the reports in a real browser.
//   node scripts/canteen-walkthrough.mjs            (API on 3001, web on 3000; shots in tmp/canteen-shots)
import { chromium } from "playwright";
import fs from "node:fs";
const API = process.env.API || "http://localhost:3001/api/v1", WEB = process.env.WEB || "http://localhost:3000";
const OUT = process.env.OUT || new URL("../tmp/canteen-shots/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const steps = []; const errors = [];
const step = (name, ok, info = "") => { steps.push({ name, ok, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
async function api(path, { method = "GET", token, body, query } = {}) {
  const url = new URL(API + path); Object.entries(query ?? {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
let shotNo = 0;
const shot = async (page, name) => { shotNo += 1; const file = `${String(shotNo).padStart(2, "0")}-${name}.png`; await page.screenshot({ path: OUT + file, fullPage: false }); console.log("     shot", file); };

// ---- API set-up ----
const login = await api("/auth/login", { method: "POST", body: { email: "demo@easalpha.com", password: "password123" } });
if (login.status !== 200) { console.error("login failed", login); process.exit(1); }
const T = login.j.access_token;
const me = await api("/me", { token: T }); const branchId = me.j.branches?.[0]?.id ?? me.j.branch?.id;
step("owner login", true, me.j.business?.name ?? "");
let r = await api("/settings", { method: "PATCH", token: T, body: { values: { "modules.canteen": true } } });
step("canteen module on", r.status === 200 && r.j.modules?.canteen === true, JSON.stringify(r.j.modules));
// sessions: one covering now, so the kiosk serves immediately
const now = new Date(); const pad = (n) => String(n).padStart(2, "0"); const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const from = new Date(now.getTime() - 60 * 60000), to = new Date(now.getTime() + 3 * 60 * 60000);
let sessions = (await api("/canteen/sessions", { token: T })).j.data;
let lunch = sessions.find((s) => s.name === "Walk-through lunch");
if (!lunch) { r = await api("/canteen/sessions", { method: "POST", token: T, body: { name: "Walk-through lunch", starts_at: hhmm(from), ends_at: hhmm(to), max_claims: 1, sort_order: 0 } }); lunch = r.j; }
else await api(`/canteen/sessions/${lunch.id}`, { method: "PATCH", token: T, body: { starts_at: hhmm(from), ends_at: hhmm(to), active: true } });
for (const s of sessions.filter((s) => s.id !== lunch.id && s.active)) await api(`/canteen/sessions/${s.id}`, { method: "PATCH", token: T, body: { active: false } });
step("session covering now", !!lunch?.id, `${hhmm(from)} to ${hhmm(to)}`);
// workers: three employees with fingerprint ids
await api("/settings", { method: "PATCH", token: T, body: { values: { "modules.payroll": true } } });
const emps = (await api("/employees", { token: T })).j.data ?? [];
const want = [["Akbar Ali", "FP-001", "+923001000001"], ["Shazia Bibi", "FP-002", "+923001000002"], ["Imran Khan", "FP-003", "+923001000003"]];
const workers = [];
for (const [name, fid, phone] of want) {
  let e = emps.find((x) => x.name === name);
  if (!e) { r = await api("/employees", { method: "POST", token: T, body: { name, phone, designation: "Machine operator", base_salary_minor: 3500000, pay_frequency: "monthly" } }); e = r.j; }
  r = await api(`/canteen/workers/${e.id}/fingerprint`, { method: "POST", token: T, body: { fingerprint_id: fid } });
  workers.push(r.j);
}
step("three workers enrolled", workers.every((w) => w?.fingerprint_id), workers.map((w) => `${w?.name}:${w?.fingerprint_id}`).join(", "));
// plan: three dishes from the demo menu
const products = ((await api("/products", { token: T, query: { limit: 200 } })).j.data ?? []).filter((p) => p.active && !p.archived_at);
const pick = products.slice(0, 3);
const today = new Date(); const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
r = await api("/canteen/plans", { method: "POST", token: T, body: { meal_session_id: lunch.id, plan_date: day, publish: true, items: pick.map((p, i) => ({ product_id: p.id, planned_qty: 120 - i * 20, worker_price_minor: i === 0 ? 15000 : null })) } });
step("plan published", r.status === 200 && r.j.status === "published", r.j.items?.map((i) => i.name).join(", "));
// cancel any claims of these workers today so the run starts clean
const existing = (await api("/canteen/claims", { token: T, query: { date: day } })).j.data ?? [];
for (const c of existing.filter((c) => c.status !== "cancelled" && workers.some((w) => w.id === c.employee_id))) await api(`/canteen/claims/${c.id}/cancel`, { method: "POST", token: T, body: { reason: "walk-through reset" } });
// kiosk device
const devices = (await api("/devices", { token: T })).j.data ?? [];
for (const d of devices.filter((d) => /^Walk-through/.test(d.name))) await api(`/devices/${d.id}`, { method: "DELETE", token: T });
const kiosk = (await api("/devices", { method: "POST", token: T, body: { name: "Walk-through kiosk", kind: "kiosk", branch_id: branchId } })).j;
const counter = (await api("/devices", { method: "POST", token: T, body: { name: "Walk-through counter", kind: "kiosk", branch_id: branchId } })).j;
step("kiosk and counter devices", !!kiosk?.pairing_code && !!counter?.pairing_code, `${kiosk?.pairing_code} ${counter?.pairing_code}`);

// ---- Browser ----
const browser = await chromium.launch({ channel: "chrome", headless: true });
const wire = (page, label) => {
  page.on("pageerror", (e) => errors.push({ label, url: page.url(), text: "pageerror: " + String(e).slice(0, 300) }));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|sw\.js|manifest/.test(m.text())) errors.push({ label, url: page.url(), text: m.text().slice(0, 300) }); });
  page.on("response", (res) => { if (res.status() >= 500 || (res.status() >= 400 && res.url().includes("/api/v1/") && !/auth\/refresh|already|canteen\/claims$/.test(res.url()))) errors.push({ label, page: page.url(), url: res.url(), status: res.status() }); });
};

// Admin
const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const a = await admin.newPage(); wire(a, "admin");
await a.goto(`${WEB}/login`, { waitUntil: "networkidle" });
await a.fill('input[type="email"]', "demo@easalpha.com"); await a.fill('input[type="password"]', "password123"); await a.click('button[type="submit"]');
await a.waitForURL(/\/admin/, { timeout: 30000 }); await a.waitForTimeout(1500);
step("admin logged in", true);
await a.goto(`${WEB}/admin/settings/modules`, { waitUntil: "networkidle" }); await a.waitForTimeout(1200); await shot(a, "admin-modules");
step("modules page shows Canteen", (await a.textContent("body")).includes("Canteen"), "");
await a.goto(`${WEB}/admin/canteen/sessions`, { waitUntil: "networkidle" }); await a.waitForTimeout(1000); await shot(a, "admin-sessions");
await a.goto(`${WEB}/admin/canteen/plans`, { waitUntil: "networkidle" }); await a.waitForTimeout(1500); await shot(a, "admin-plans");
step("plans page shows the published plan", (await a.textContent("body")).includes("published"), "");
await a.goto(`${WEB}/admin/canteen/workers`, { waitUntil: "networkidle" }); await a.waitForTimeout(1200); await shot(a, "admin-workers");
await a.goto(`${WEB}/admin/canteen`, { waitUntil: "networkidle" }); await a.waitForTimeout(1200); await shot(a, "admin-today-before");

// Kiosk
const kctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const k = await kctx.newPage(); wire(k, "kiosk");
await k.goto(`${WEB}/canteen`, { waitUntil: "networkidle" }); await k.waitForTimeout(800);
for (const d of kiosk.pairing_code) await k.click(`button:has-text("${d}")`, { timeout: 5000 }).catch(async () => { await k.getByRole("button", { name: d, exact: true }).first().click(); });
await k.click('button:has-text("Pair")'); await k.waitForTimeout(3000);
const kioskBody = await k.textContent("body");
step("kiosk paired and shows the menu", kioskBody.includes(pick[0].name), "");
await shot(k, "kiosk-idle");
// a worker scans (the reader types the id and Enter) with no dish chosen: the kiosk asks for the dish
await k.keyboard.type("FP-001"); await k.keyboard.press("Enter"); await k.waitForTimeout(800);
step("kiosk greets the worker and asks for the dish", (await k.textContent("body")).includes("Akbar Ali"), "");
await shot(k, "kiosk-choose-dish");
await k.locator('[data-testid="dish"]').first().click(); await k.waitForTimeout(1500);
let result = await k.locator('[data-testid="result"]').textContent().catch(() => "");
step("token issued", /Your token/.test(result) && /-001/.test(result), result.replace(/\s+/g, " ").slice(0, 80));
await shot(k, "kiosk-token");
await k.locator('[data-testid="result"]').click(); await k.waitForTimeout(400);
// the same worker again: refused at once (or after the dish tap when the kiosk has no local worker list yet)
await k.keyboard.type("FP-001"); await k.keyboard.press("Enter"); await k.waitForTimeout(1500);
if (!(await k.locator('[data-testid="result"]').count())) { await k.locator('[data-testid="dish"]').first().click(); await k.waitForTimeout(1500); }
result = await k.locator('[data-testid="result"]').textContent().catch(() => "");
step("second helping refused", /Already taken/.test(result) && /-001/.test(result), result.replace(/\s+/g, " ").slice(0, 100));
await shot(k, "kiosk-already-taken");
await k.locator('[data-testid="result"]').click(); await k.waitForTimeout(400);
// dish first, then scan: one tap
await k.locator('[data-testid="dish"]').nth(1).click(); await k.waitForTimeout(300);
await k.keyboard.type("FP-002"); await k.keyboard.press("Enter"); await k.waitForTimeout(1500);
result = await k.locator('[data-testid="result"]').textContent().catch(() => "");
step("dish first then finger works", /Your token/.test(result) && /Shazia/.test(result), result.replace(/\s+/g, " ").slice(0, 80));
await k.locator('[data-testid="result"]').click(); await k.waitForTimeout(400);
// offline: the kiosk keeps serving from its local copy
await k.waitForTimeout(2500); // let the sync payload (workers, claims) land in IndexedDB
await kctx.setOffline(true); await k.waitForTimeout(1500);
await k.locator('[data-testid="dish"]').nth(2).click(); await k.waitForTimeout(300);
await k.keyboard.type("FP-003"); await k.keyboard.press("Enter"); await k.waitForTimeout(2500);
result = await k.locator('[data-testid="result"]').textContent().catch(() => "");
step("offline meal saved locally with a token", /Your token/.test(result) && /offline/i.test(result), result.replace(/\s+/g, " ").slice(0, 100));
await shot(k, "kiosk-offline-token");
await k.locator('[data-testid="result"]').click(); await k.waitForTimeout(300);
// offline, the same worker again: refused from the local copy
await k.keyboard.type("FP-003"); await k.keyboard.press("Enter"); await k.waitForTimeout(1500);
if (!(await k.locator('[data-testid="result"]').count())) { await k.locator('[data-testid="dish"]').first().click(); await k.waitForTimeout(1500); }
result = await k.locator('[data-testid="result"]').textContent().catch(() => "");
step("offline second helping refused locally", /Already taken/.test(result), result.replace(/\s+/g, " ").slice(0, 80));
await k.locator('[data-testid="result"]').click();
await kctx.setOffline(false); await k.waitForTimeout(6000); // the queue pushes the offline claim
const serverClaims = (await api("/canteen/claims", { token: T, query: { date: day } })).j.data.filter((c) => c.status !== "cancelled");
step("offline meal reached the server after reconnecting", serverClaims.some((c) => c.employee_name === "Imran Khan"), serverClaims.map((c) => `${c.token_label}:${c.employee_name}`).join(", "));
await shot(k, "kiosk-back-online");

// Counter
const cctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const c = await cctx.newPage(); wire(c, "counter");
await c.goto(`${WEB}/canteen/serve`, { waitUntil: "networkidle" }); await c.waitForTimeout(800);
for (const d of counter.pairing_code) await c.click(`button:has-text("${d}")`, { timeout: 5000 }).catch(async () => { await c.getByRole("button", { name: d, exact: true }).first().click(); });
await c.click('button:has-text("Pair")'); await c.waitForTimeout(3000);
const tokens = await c.locator('[data-testid="token"]').count();
step("counter shows the waiting tokens", tokens >= 3, `${tokens} waiting`);
await shot(c, "counter-waiting");
await c.locator('[data-testid="token"]').first().click(); await c.waitForTimeout(1500);
step("first token served", (await c.locator('[data-testid="token"]').count()) === tokens - 1, "");
await shot(c, "counter-served-one");

// Admin after
await a.goto(`${WEB}/admin/canteen`, { waitUntil: "networkidle" }); await a.waitForTimeout(1500); await shot(a, "admin-today-after");
await a.goto(`${WEB}/admin/canteen/claims`, { waitUntil: "networkidle" }); await a.waitForTimeout(1500); await shot(a, "admin-meals");
step("meals page lists the tokens", (await a.textContent("body")).includes("Akbar Ali"), "");
await a.goto(`${WEB}/admin/canteen/reports`, { waitUntil: "networkidle" }); await a.waitForTimeout(1500); await shot(a, "admin-reports-by-day");
await a.click('button:has-text("By dish")'); await a.waitForTimeout(1200); await shot(a, "admin-reports-by-dish");
await a.click('button:has-text("Per worker")'); await a.waitForTimeout(1200); await shot(a, "admin-reports-workers");
step("reports show the three workers", (await a.textContent("body")).includes("Imran Khan"), "");
// the worker's ledger carries the meal
const w1 = workers[0];
const ledger = await api(`/customers/${(await api(`/canteen/workers/${w1.id}`, { token: T })).j.worker.customer_id}/ledger`, { token: T });
step("meal on the worker's account", ledger.status === 200, JSON.stringify(ledger.j).slice(0, 120));
// cancel one meal from admin
const toCancel = serverClaims.find((c) => c.employee_name === "Shazia Bibi");
if (toCancel) { r = await api(`/canteen/claims/${toCancel.id}/cancel`, { method: "POST", token: T, body: { reason: "walk-through: not collected" } }); step("manager cancels a meal", r.status === 200 && r.j.status === "cancelled", r.j.status ?? JSON.stringify(r.j)); }
await a.goto(`${WEB}/admin/canteen/claims`, { waitUntil: "networkidle" }); await a.waitForTimeout(1500); await shot(a, "admin-meals-after-cancel");

await browser.close();
fs.writeFileSync(OUT + "report.json", JSON.stringify({ steps, errors }, null, 2));
const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} steps ok; ${errors.length} browser/API errors; shots in ${OUT}`);
if (errors.length) console.log(JSON.stringify(errors.slice(0, 10), null, 2));
process.exit(failed.length ? 1 : 0);
