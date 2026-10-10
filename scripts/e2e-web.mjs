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
for (const m of (await api("/staff", { token: T })).j?.data || []) if (m.user?.name === "E2E Cook" && m.status === "active") await api(`/staff/${m.id}/deactivate`, { method: "POST", token: T });
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
try { await a.waitForURL(/\/admin/, { timeout: 90000 }); step("admin login", true, a.url()); } catch { step("admin login", false, a.url()); await shot(a, "admin-login-fail"); }
await a.waitForTimeout(1500); await shot(a, "admin-dashboard");
const adminPages = ["/admin", "/admin/orders", "/admin/products/menus", "/admin/products/categories", "/admin/products/catalog", "/admin/products/modifier-groups", "/admin/products/deals", "/admin/products/promotions", "/admin/products/tax-rates", "/admin/products/stations",
  "/admin/customers", "/admin/customers/groups", "/admin/customers/import", "/admin/customers/ar-aging", "/admin/tables", "/admin/staff/admin-staff", "/admin/staff/roles", "/admin/settings/devices", "/admin/finance/shifts", "/admin/finance/day-close", "/admin/finance/tax-invoices",
  "/admin/finance/payment-accounts", "/admin/settings/needs-attention", "/admin/reports", "/admin/settings/store", "/admin/settings/store-management", "/admin/settings/payment-methods", "/admin/settings/checklist", "/admin/settings/audit-logs", "/admin/inventory/stock-in-hand", "/admin/inventory/items", "/admin/inventory/items/import", "/admin/inventory/stock-actions", "/admin/inventory/stock-actions/new", "/admin/inventory-reports/daily-stock-sheet", "/admin/inventory-reports/waste-adjustments", "/admin/inventory/settings", "/admin/inventory/sections", "/admin/inventory/units", "/admin/inventory/recipes", "/admin/inventory/recipes/new", "/admin/inventory/food-cost", "/admin/inventory/production", "/admin/inventory/order-inventory", "/admin/inventory-reports/consumption", "/admin/inventory-reports/deduction-health", "/admin/purchasing/payables-aging", "/admin/suppliers", "/admin/suppliers/import", "/admin/purchasing/purchase-orders", "/admin/purchasing/purchase-orders/new", "/admin/purchasing/goods-received", "/admin/purchasing/goods-received/new", "/admin/purchasing/purchase-returns", "/admin/purchasing/purchase-returns/new", "/admin/inventory/demand", "/admin/purchasing/purchases-report", "/admin/expenses", "/admin/expenses/categories", "/admin/expenses/overheads", "/admin/riders/delivery-board", "/admin/riders/manage", "/admin/riders/zones", "/admin/orders/qr", "/admin/settings/qr", "/admin/reports/schedules",
  "/admin/staff/cashiers", "/admin/staff/order-takers", "/admin/staff/sessions", "/admin/staff/roles", "/admin/settings/business-hours", "/admin/settings/point-of-sale", "/admin/settings/charges-tax", "/admin/settings/security-cash", "/admin/settings/store-management", "/admin/settings/payment-methods", "/admin/settings/checklist", "/admin/products/quick-add", "/admin/orders/pending", "/admin/inventory-reports/stock-ledger", "/admin/inventory-reports/actual-vs-theoretical", "/admin/inventory-reports/valuation-cogs"];
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


// ---- Phase 1 gate (SPEC): login + permissions. A manager sees Inventory; after a custom grant and a fresh sign-in, the sidebar follows the new set.
{
  const mgrRole = roles.j.data.find((r) => r.system_key === "manager").id;
  const email = `e2e-mgr-${Date.now()}@servio.test`;
  const mgr = await api("/staff", { method: "POST", token: T, body: { name: "E2E Manager", email, password: "password123", role_id: mgrRole, staff_type: "admin" } });
  step("gate: manager created", mgr.status === 201, String(mgr.status));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const g = await ctx.newPage(); wire(g, "gate");
  const loginAs = async () => { await g.goto(WEB + "/login"); await g.waitForSelector("input[type=email]"); await g.fill("input[type=email]", email); await g.fill("input[type=password]", "password123"); await g.getByRole("button", { name: "Log in" }).click(); await g.waitForURL(/\/admin/, { timeout: 90000 }); await g.waitForTimeout(1200); };
  await loginAs();
  const navText1 = await g.evaluate(() => document.querySelector("nav")?.innerText || "");
  step("gate: manager sees Inventory group", /Inventory/.test(navText1), navText1.slice(0, 80).replace(/\n/g, " "));
  await g.goto(WEB + `/admin/staff/${mgr.j.id}/access`, { waitUntil: "networkidle" }).catch(() => null); await g.waitForTimeout(800); await shot(g, "gate-permission-editor");
  const put = await api(`/staff/${mgr.j.id}/permissions`, { method: "PUT", token: T, body: { codes: ["app.admin", "DASHBOARD", "SALES_WALKIN"] } });
  step("gate: custom grant saved", put.status === 200 && put.j.mode === "custom", JSON.stringify(put.j?.granted));
  await g.goto(WEB + "/admin", { waitUntil: "networkidle" }); await g.waitForTimeout(800);
  const navText2 = await g.evaluate(() => document.querySelector("nav")?.innerText || "");
  step("gate: old session keeps old menu until re-login", /Inventory/.test(navText2), "");
  await g.evaluate(() => localStorage.removeItem("servio.auth")); await loginAs();
  const navText3 = await g.evaluate(() => document.querySelector("nav")?.innerText || "");
  step("gate: after re-login Inventory is gone and Orders stays", !/Inventory/.test(navText3) && /Orders/.test(navText3), navText3.slice(0, 120).replace(/\n/g, " "));
  await shot(g, "gate-after-relogin");
  await ctx.close();
}


// ---- Phase 2 gate (SPEC): the menu renders in the POS with a Quick Add item, a product discount and a favourited deal.
{
  const catBefore = await api("/catalog", { token: T });
  const chai = catBefore.j.products.find((p) => /chai|tea|water|roti/i.test(p.name)) || catBefore.j.products[0];
  const qa = await api("/quick_add_items", { method: "PUT", token: T, body: { items: [{ product_id: chai.id }] } });
  step("phase 2: quick add item saved", qa.status === 200 && qa.j.data.length === 1, String(qa.status));
  const disc = await api(`/products/${chai.id}`, { method: "PATCH", token: T, body: { discount_value: 10, discount_type: "percent", pct_code: "98.21.00" } });
  step("phase 2: product discount and PCT code saved", disc.status === 200 && disc.j.pct_code === "98.21.00", JSON.stringify([disc.j?.discount_value, disc.j?.discount_type]));
  const deal = catBefore.j.deals[0];
  if (deal) { const fav = await api(`/deals/${deal.id}`, { method: "PATCH", token: T, body: { is_favourite: true } }); step("phase 2: deal favourited", fav.status === 200 && fav.j.is_favourite === true, String(fav.status)); }
  const cat = await api("/catalog", { token: T });
  step("phase 2: catalog carries quick add items", (cat.j.quick_add_items || []).length === 1, JSON.stringify(cat.j.quick_add_items?.map((q) => q.name)));
  report.phase2 = { quickAddName: chai.name };
}


// ---- Phase 3 gate (SPEC): a paid walk-in order is reopened, an item is added, and the story shows the diff and the amount change.
{
  const cat = await api("/catalog", { token: T });
  const [p1, p2] = cat.j.products;
  const o = await api("/orders", { method: "POST", token: T, body: { order_type: "walk_in", lines: [{ product_id: p1.id, quantity: 1 }], place: true } });
  step("phase 3: walk-in order placed", o.status === 201 && o.j.spec_status === "pending", `${o.status} ${o.j?.spec_status}`);
  const pay = await api(`/orders/${o.j.id}/payments`, { method: "POST", token: T, body: { payments: [{ method_code: "cash", amount_minor: o.j.total_minor, tendered_minor: o.j.total_minor }] } });
  const afterPay = await api(`/orders/${o.j.id}`, { token: T });
  step("phase 3: paid by cash, completed", pay.status < 300 && afterPay.j.spec_status === "completed" && afterPay.j.spec_payment_status === "paid", `${pay.status} ${afterPay.j?.spec_status}`);
  const re = await api(`/orders/${o.j.id}/reopen`, { method: "POST", token: T });
  step("phase 3: reopened", re.status === 200 && re.j.reopen_count === 1, `${re.status}`);
  const line = re.j.items[0];
  const ed = await api(`/orders/${o.j.id}`, { method: "PATCH", token: T, body: { lines: [{ id: line.id, quantity: 1 }, { product_id: p2.id, quantity: 1 }] } });
  const last = ed.j?.story?.events?.at(-1);
  step("phase 3: story shows the item diff and amount change", ed.status === 200 && last?.type === "edited" && last.diff.added.length === 1 && last.amount_after > last.amount_before, JSON.stringify({ type: last?.type, added: last?.diff?.added, from: last?.amount_before, to: last?.amount_after }));
  report.phase3 = { orderId: o.j.id, serial: o.j.serial };
  const resp = await a.goto(WEB + "/admin/orders?status=open", { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
  await a.waitForTimeout(800); await shot(a, "phase3-orders-open");
  step("phase 3: admin orders page renders", !!resp && resp.status() === 200, "");
}


// ---- Phase 4 gate (SPEC): stock deducts on sale, at completion, and Deduction Health sees it.
{
  const units = await api("/units", { token: T }); const pcs = units.j.data.find((u) => u.code === "pcs");
  const sections = await api("/stock_sections", { token: T }); const kitchen = sections.j.data.find((s) => s.slug === "kitchen") || sections.j.data[0];
  const item = await api("/stock_items", { method: "POST", token: T, body: { name: `E2E Bun ${Date.now()}`, base_unit_id: pcs.id } });
  step("phase 4: item gets an auto SKU", item.status === 201 && /^[A-Z]{1,3}-[A-Z]{2}-\d{4}$/.test(item.j.sku), item.j?.sku);
  const grn = await api("/stock_documents", { method: "POST", token: T, body: { kind: "receive", to_section_id: kitchen.id, lines: [{ stock_item_id: item.j.id, quantity: 100, unit_cost_minor: 1000 }], post: true } });
  step("phase 4: goods receipt posted as GRN-", grn.status === 201 && /^GRN-\d{6}$/.test(grn.j.label) && grn.j.status === "posted", grn.j?.label);
  const cat = await api("/catalog", { token: T });
  const made = await api("/products", { method: "POST", token: T, body: { category_id: cat.j.categories[0].id, name: `E2E Bun Burger ${Date.now()}`, base_price_minor: 25000 } });
  const prod = made.j;
  const recipe = await api("/recipes", { method: "POST", token: T, body: { product_id: prod.id, name: "E2E recipe", lines: [{ stock_item_id: item.j.id, quantity: 1 }] } });
  step("phase 4: product with a one-ingredient recipe", made.status === 201 && recipe.status === 201, `${made.status} ${recipe.status}`);
  const o = await api("/orders", { method: "POST", token: T, body: { order_type: "walk_in", lines: [{ product_id: prod.id, quantity: 2 }], place: true } });
  const before = (await api(`/stock/ledger?item_id=${item.j.id}&kind=sale`, { token: T })).j.data.length;
  await api(`/orders/${o.j.id}/payments`, { method: "POST", token: T, body: { payments: [{ method_code: "cash", amount_minor: o.j.total_minor, tendered_minor: o.j.total_minor }] } });
  const after = (await api(`/stock/ledger?item_id=${item.j.id}&kind=sale`, { token: T })).j.data;
  step("phase 4: stock deducts at completion (not at placing)", before === 0 && after.length === 1 && Number(after[0].quantity) === -2, JSON.stringify({ before, after: after.map((e) => e.quantity) }));
  const health = await api(`/stock/deduction_health/${o.j.id}`, { token: T });
  step("phase 4: deduction health shows the movement", health.status === 200 && health.j.movements.length >= 1 && health.j.audits[0]?.status === "ok", JSON.stringify(health.j?.audits?.[0]?.status));
  const retry = await api(`/stock/deduction_health/${o.j.id}/retry`, { method: "POST", token: T });
  step("phase 4: retry never deducts twice", retry.status === 200 && retry.j.movements.filter((m) => m.kind === "sale").length === 1, String(retry.j?.movements?.length));
  if (recipe.status === 201) await api(`/recipes/${recipe.j.id}`, { method: "DELETE", token: T });
  if (made.status === 201) await api(`/products/${prod.id}`, { method: "PATCH", token: T, body: { active: false } });
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
const tillText = await t.evaluate(() => document.body.innerText).catch(() => "");
step("phase 2: till shows the quick add item", new RegExp(report.phase2.quickAddName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(tillText), report.phase2.quickAddName);
await shot(t, "phase2-till-quick-add");
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
