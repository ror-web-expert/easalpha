import { chromium } from "playwright";
import fs from "node:fs";
const API = process.env.API || "http://localhost:3001/api/v1", WEB = process.env.WEB || "http://localhost:3000";
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

const login = await api("/auth/login", { method: "POST", body: { email: "demo@easalpha.com", password: "password123" } });
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
let till = await api("/devices", { method: "POST", token: T, body: { name: "E2E till", kind: "till" } });
if (till.status !== 201) { // the trial plan allows three tills: reuse the seeded Counter till with a fresh code
  const counter = (existing.j?.data || []).find((d) => d.name === "Counter till");
  if (counter) till = await api(`/devices/${counter.id}/regenerate_code`, { method: "POST", token: T });
}
const kds = await api("/devices", { method: "POST", token: T, body: { name: "E2E kitchen", kind: "kitchen" } });
step("devices created", !!till.j?.pairing_code && kds.status === 201, `${till.j?.pairing_code} ${kds.j?.pairing_code}`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
function wire(page, label) {
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push({ label, url: page.url(), text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => report.consoleErrors.push({ label, url: page.url(), text: "pageerror: " + String(e).slice(0, 300) }));
  page.on("response", (r) => { if (r.status() >= 500 || (r.status() >= 400 && r.url().includes("/api/v1/") && !/auth\/refresh|lookup/.test(r.url()))) report.failedRequests.push({ label, page: page.url(), url: r.url(), status: r.status() }); });
}
const shot = (page, name) => page.screenshot({ path: OUT + name + ".png", fullPage: false });

const admin = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const a = await admin.newPage(); wire(a, "admin");
await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]", { timeout: 60000 }); await a.fill("input[type=email]", "demo@easalpha.com"); await a.fill("input[type=password]", "password123");
await a.getByRole("button", { name: "Log in" }).click();
try { await a.waitForURL(/\/admin/, { timeout: 90000 }); step("admin login", true, a.url()); } catch { step("admin login", false, a.url()); await shot(a, "admin-login-fail"); }
await a.waitForTimeout(1500); await shot(a, "admin-dashboard");
const adminPages = ["/admin", "/admin/orders", "/admin/products/menus", "/admin/products/categories", "/admin/products/catalog", "/admin/products/modifier-groups", "/admin/products/deals", "/admin/products/promotions", "/admin/products/tax-rates", "/admin/products/stations",
  "/admin/customers", "/admin/customers/groups", "/admin/customers/import", "/admin/customers/ar-aging", "/admin/tables", "/admin/staff/admin-staff", "/admin/staff/roles", "/admin/settings/devices", "/admin/finance/shifts", "/admin/finance/day-close", "/admin/finance/tax-invoices",
  "/admin/finance/payment-accounts", "/admin/settings/needs-attention", "/admin/reports", "/admin/settings/store", "/admin/settings/store-management", "/admin/settings/payment-methods", "/admin/settings/checklist", "/admin/settings/audit-logs", "/admin/inventory/stock-in-hand", "/admin/inventory/items", "/admin/inventory/items/import", "/admin/inventory/stock-actions", "/admin/inventory/stock-actions/new", "/admin/inventory-reports/daily-stock-sheet", "/admin/inventory-reports/waste-adjustments", "/admin/inventory/settings", "/admin/inventory/sections", "/admin/inventory/units", "/admin/inventory/recipes", "/admin/inventory/recipes/new", "/admin/inventory/food-cost", "/admin/inventory/production", "/admin/inventory/order-inventory", "/admin/inventory-reports/consumption", "/admin/inventory-reports/deduction-health", "/admin/purchasing/payables-aging", "/admin/suppliers", "/admin/suppliers/import", "/admin/purchasing/purchase-orders", "/admin/purchasing/purchase-orders/new", "/admin/purchasing/goods-received", "/admin/purchasing/goods-received/new", "/admin/purchasing/purchase-returns", "/admin/purchasing/purchase-returns/new", "/admin/inventory/demand", "/admin/purchasing/purchases-report", "/admin/expenses", "/admin/expenses/categories", "/admin/expenses/overheads", "/admin/riders/delivery-board", "/admin/riders/manage", "/admin/riders/zones", "/admin/orders/qr", "/admin/settings/qr", "/admin/reports/schedules",
  "/admin/staff/cashiers", "/admin/staff/order-takers", "/admin/staff/sessions", "/admin/staff/roles", "/admin/settings/business-hours", "/admin/settings/point-of-sale", "/admin/settings/charges-tax", "/admin/settings/security-cash", "/admin/settings/store-management", "/admin/settings/payment-methods", "/admin/settings/checklist", "/admin/products/quick-add", "/admin/orders/pending", "/admin/inventory-reports/stock-ledger", "/admin/inventory-reports/actual-vs-theoretical", "/admin/inventory-reports/valuation-cogs", "/admin/purchasing/price-history", "/admin/suppliers/ledger", "/admin/suppliers/insights", "/admin/suppliers/payments", "/admin/finance/dashboard", "/admin/finance/combined-ledger", "/admin/finance/journal-voucher", "/admin/finance/chart-of-accounts", "/admin/finance/fixed-assets", "/admin/finance/liabilities", "/admin/finance/equity", "/admin/finance/balance-sheet", "/admin/finance/trial-balance", "/admin/payroll/overview", "/admin/payroll/employees", "/admin/payroll/advances", "/admin/payroll/run", "/admin/payroll/ledger", "/admin/payroll/fingerprint", "/admin/payroll/reports", "/admin/payroll/settings", "/admin/reports/cashier-till", "/admin/reports/delivery-riders", "/admin/riders/reports", "/admin/riders/manage", "/admin/reports/grand", "/admin/reports/sales", "/admin/reports/sales-calendar", "/admin/reports/financial", "/admin/reports/products-deals", "/admin/reports/categories", "/admin/reports/order-takers", "/admin/reports/cashiers", "/admin/reports/customers", "/admin/reports/customer-ledger", "/admin/reports/operations", "/admin/reports/cancelled-modified", "/admin/reports/vouchers", "/admin/reports/loyalty-points", "/admin/reports/regular-discounts", "/admin/reports/ai-pricing", "/admin/inventory-reports/ai-stock-forecast", "/admin/customers/ledger", "/admin/customers/insights", "/admin/customers/payments", "/admin/customers/account", "/admin/settings/regular-discounts", "/admin/settings/vouchers", "/admin/settings/reviews", "/admin/settings/whatsapp", "/admin/settings/notifications", "/admin/settings/website", "/admin/settings/plan", "/admin/settings/branding", "/admin/support"];
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
  const email = `e2e-mgr-${Date.now()}@easalpha.test`;
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
  await g.evaluate(() => localStorage.removeItem("easalpha.auth")); await loginAs();
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


// ---- Phase 5 gate (SPEC): the supplier ledger ties out.
{
  const units = await api("/units", { token: T }); const pcs = units.j.data.find((u) => u.code === "pcs");
  const item = await api("/stock_items", { method: "POST", token: T, body: { name: `E2E Oil ${Date.now()}`, base_unit_id: pcs.id } });
  const sup = await api("/suppliers", { method: "POST", token: T, body: { name: `E2E Supplier ${Date.now()}`, opening_balance_minor: 10000 } });
  step("phase 5: supplier labelled To Pay with counts", sup.status === 201 && sup.j.balance_label === "to_pay" && sup.j.items_count === 0, JSON.stringify([sup.j?.balance_label, sup.j?.items_count]));
  const po = await api("/purchase_orders", { method: "POST", token: T, body: { supplier_id: sup.j.id, send: true, lines: [{ stock_item_id: item.j.id, quantity: 10, unit_cost_minor: 5000 }] } });
  const rec = await api(`/purchase_orders/${po.j.id}/receive`, { method: "POST", token: T, body: {} });
  const pay = await api(`/purchase_orders/${po.j.id}/pay`, { method: "POST", token: T, body: { amount_minor: 20000, method_code: "cash" } });
  step("phase 5: PO received and part paid", rec.status === 201 && pay.status === 201 && pay.j.purchase_order.payment_status === "partial", JSON.stringify([rec.status, pay.j?.purchase_order?.payment_status]));
  const adj = await api(`/suppliers/${sup.j.id}/adjust`, { method: "POST", token: T, body: { amount_minor: -1000, reason: "E2E discount" } });
  const led = await api(`/suppliers/${sup.j.id}/ledger`, { token: T });
  const t = led.j.tiles;
  step("phase 5: supplier ledger ties out (opening + purchases - payments + adjustments = balance)", adj.status === 201 && t.ties_out === true && t.balance_minor === 10000 + 50000 - 20000 - 1000 && t.balance_minor === t.cached_balance_minor, JSON.stringify(t));
  const tb = await api(`/finance/trial_balance?from=${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}`, { token: T });
  const bs = await api("/finance/balance_sheet", { token: T });
  step("phase 5: trial balance and balance sheet balance", tb.status === 200 && tb.j.balanced === true && bs.status === 200 && bs.j.balanced === true, JSON.stringify([tb.j?.balanced, bs.j?.balanced]));
}


// ---- Phase 6 gate (SPEC): the payroll run matches the attendance it priced.
{
  const rules = await api("/employees/rules", { method: "PUT", token: T, body: { shift_start: "10:00", shift_end: "18:00", rules_enabled: true, late_after_minutes: 15, late_penalty: "fine_only", late_fine_minor: 50000, free_lates: 0, absent_penalty: "lose_day", absent_rule: "fixed_26", fixed_divisor: 26, working_days: [1, 2, 3, 4, 5, 6] } });
  const emp = await api("/employees", { method: "POST", token: T, body: { name: `E2E Cook ${Date.now()}`, base_salary_minor: 2600000, joined_on: "2026-01-01" } });
  const fp = `E2E-${Date.now()}`;
  const enrol = await api("/attendance/enrol", { method: "POST", token: T, body: { employee_id: emp.j.id, fingerprint_id: fp } });
  step("phase 6: rules saved and employee enrolled", rules.status === 200 && emp.status === 201 && enrol.status === 200 && enrol.j.fingerprint_enrolled === true, JSON.stringify([rules.status, emp.status, enrol.status]));
  const scan = await api("/attendance/scan", { method: "POST", token: T, body: { fingerprint_id: fp } });
  const again = await api("/attendance/scan", { method: "POST", token: T, body: { fingerprint_id: fp } });
  step("phase 6: a scan checks in and a second tap is Already Marked", scan.status === 200 && scan.j.result === "check_in" && again.j.result === "already_marked", JSON.stringify([scan.j?.result, again.j?.result]));
  const month = new Date().toISOString().slice(0, 7);
  const ledger = await api(`/attendance/ledger?employee_id=${emp.j.id}&month=${month}`, { token: T });
  const existing = await api("/payroll/runs", { token: T });
  for (const r of existing.j.data.filter((x) => x.month.startsWith(month) && x.status !== "paid" && x.status !== "cancelled")) await api(`/payroll/runs/${r.id}/cancel`, { method: "POST", token: T });
  const run = await api("/payroll/runs", { method: "POST", token: T, body: { month } });
  const slip = run.j?.payslips?.find((p) => p.employee_id === emp.j.id);
  const expectedFines = ledger.j?.summary?.charges?.fines_minor;
  step("phase 6: payroll run prices the month the rules engine decided", run.status === 201 && slip && slip.late_fines_minor === expectedFines && slip.detail.divisor === 26 && run.j.settings_snapshot.fixed_divisor === 26, JSON.stringify({ status: run.status, fines: slip?.late_fines_minor, expectedFines, divisor: slip?.detail?.divisor }));
  if (run.status === 201) await api(`/payroll/runs/${run.j.id}/cancel`, { method: "POST", token: T });
  await api("/attendance/revoke", { method: "POST", token: T, body: { employee_id: emp.j.id } });
  await api("/employees/rules", { method: "PUT", token: T, body: { rules_enabled: false } });
  const temp = await api("/riders", { method: "POST", token: T, body: { name: `E2E Temp ${Date.now()}`, temporary: true, lifetime_kind: "one_order" } });
  const till = await api(`/reports/cashier_till?from=${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}`, { token: T });
  step("phase 6: temporary rider created and Cashier Till report answers", temp.status === 201 && temp.j.lifetime_label === "One order" && till.status === 200 && Array.isArray(till.j.rows), JSON.stringify([temp.j?.lifetime_label, till.status]));
  if (temp.status === 201) await api(`/riders/${temp.j.id}`, { method: "DELETE", token: T });
}


// ---- Phase 7 gate (SPEC): the Grand Report ties out.
{
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10); const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const g = await api(`/reports/grand_spec?from=${from}&to=${to}`, { token: T });
  const methodsSum = (g.j?.methods || []).reduce((a, m) => a + m.amount_minor, 0);
  const shareSum = (g.j?.methods || []).reduce((a, m) => a + m.share_percent, 0);
  step("phase 7: Grand Report methods sum to the collected total and shares tie out", g.status === 200 && methodsSum === g.j.methods_total_minor && (methodsSum === 0 || Math.abs(shareSum - 100) < 1), JSON.stringify({ sales: g.j?.sales_minor, methodsSum, shareSum: Math.round(shareSum) }));
  const tier = await api("/regular_discount_tiers", { method: "POST", token: T, body: { name: `E2E tier ${Date.now()}`, within_days: 30, kind: "percent", value: 5 } });
  const batch = await api("/voucher_batches", { method: "POST", token: T, body: { name: `E2E voucher ${Date.now()}`, kind: "public", public_code: `E2E${Date.now().toString().slice(-6)}`, value_kind: "fixed", value: 50, usage_limit: 5 } });
  const review = await api("/reviews", { method: "POST", token: T, body: { rating: 5, comment: "E2E", source: "tablet" } });
  step("phase 7: tier, voucher batch and review created", tier.status === 201 && batch.status === 201 && review.status === 201 && review.j.rating_word === "Excellent", JSON.stringify([tier.status, batch.status, review.j?.rating_word]));
  const ai = await api("/reports/ai_pricing?refresh=true", { token: T });
  const wc = await api("/website_config", { token: T });
  step("phase 7: AI pricing insight stored and website config answers", ai.status === 200 && ai.j.kind === "pricing" && wc.status === 200 && Array.isArray(wc.j.section_names), JSON.stringify([ai.j?.kind, wc.j?.section_names?.length]));
  if (tier.status === 201) await api(`/regular_discount_tiers/${tier.j.id}`, { method: "DELETE", token: T });
  if (batch.status === 201) await api(`/voucher_batches/${batch.j.id}`, { method: "DELETE", token: T });
  if (review.status === 201) await api(`/reviews/${review.j.id}`, { method: "DELETE", token: T });
}


// ---- Help & Support box, Branding and the Super panel gate.
{
  // Branding: a real PNG goes through POST /uploads, becomes the business logo and renders back as image/png.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhQGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData(); fd.append("file", new Blob([png], { type: "image/png" }), "e2e-logo.png");
  const up = await fetch(API + "/uploads", { method: "POST", headers: { Authorization: `Bearer ${T}` }, body: fd }); const upJ = await up.json().catch(() => null);
  const biz0 = await api("/business", { token: T }); const rc0 = await api("/settings", { token: T });
  const biz = await api("/business", { method: "PATCH", token: T, body: { logo_key: upJ?.key } });
  const img = upJ?.key ? await fetch(upJ.key) : null;
  step("branding: logo uploaded, saved on the business and served as an image", up.status === 201 && biz.status === 200 && biz.j.logo_key === upJ.key && img?.status === 200 && /^image\/png/.test(img.headers.get("content-type") || ""), JSON.stringify([up.status, biz.j?.logo_key?.slice(-12), img?.headers.get("content-type")]));
  const rc = await api("/settings", { method: "PATCH", token: T, body: { values: { "pos.receipt.header": "E2E header", "pos.receipt.footer_qr_url": "https://example.com/review" } } });
  const wc0 = await api("/website_config", { token: T });
  const wc = await api("/website_config", { method: "PATCH", token: T, body: { sections: { identity: { ...(wc0.j?.sections?.identity || {}), theme_color: "#2e7d32", favicon_key: upJ?.key, cover_key: upJ?.key } } } });
  const sf = wc0.j?.slug ? await api(`/public/storefront/${wc0.j.slug}`) : { status: 0, j: null };
  // Put the demo business back the way it was: the gate must not leave a 1-pixel logo or a green theme behind.
  const flat = Object.values(rc0.j?.groups || {}).flatMap((g) => Object.values(g.screens || {}).flat());
  const prev = (k) => flat.find((x) => x.key === k)?.value ?? null;
  await api("/business", { method: "PATCH", token: T, body: { logo_key: biz0.j?.logo_key ?? null } });
  await api("/settings", { method: "PATCH", token: T, body: { values: { "pos.receipt.header": prev("pos.receipt.header"), "pos.receipt.footer_qr_url": prev("pos.receipt.footer_qr_url") } } });
  await api("/website_config", { method: "PATCH", token: T, body: { sections: { identity: { theme_color: wc0.j?.sections?.identity?.theme_color ?? null, favicon_key: wc0.j?.sections?.identity?.favicon_key ?? null, cover_key: wc0.j?.sections?.identity?.cover_key ?? null } } } });
  step("branding: receipt header, theme colour, cover and favicon saved; storefront carries them", rc.status === 200 && wc.status === 200 && wc.j?.sections?.identity?.theme_color === "#2e7d32" && (sf.status !== 200 || sf.j?.config?.identity?.favicon_key === upJ?.key), JSON.stringify([rc.status, wc.status, wc.j?.sections?.identity?.theme_color, sf.status]));

  // Help & Support: platform info is public, a request goes in, the super admin answers, the answer and a notification come back.
  const plat = await api("/platform");
  const req = await api("/support_requests", { method: "POST", token: T, body: { subject: `E2E help ${Date.now()}`, message: "Gate: does the reply reach the box?", category: "question", page: "/admin/support" } });
  const slog = await api("/super/login", { method: "POST", body: { email: "admin@easalpha.com", password: "admin12345" } }); const ST = slog.j?.access_token;
  step("support: platform info is public and the super admin can log in", plat.status === 200 && !!plat.j?.product_name && slog.status === 200 && !!ST, JSON.stringify([plat.j?.product_name, slog.status]));
  const inbox = await api("/super/support_requests?status=open", { token: ST });
  const mine = (inbox.j?.data || []).find((r) => r.id === req.j?.id);
  const rep = await api(`/super/support_requests/${req.j?.id}/reply`, { method: "POST", token: ST, body: { reply: "Gate reply: yes, it does." } });
  const list = await api("/support_requests", { token: T }); const answered = (list.j?.data || []).find((r) => r.id === req.j?.id);
  const notes = await api("/notifications", { token: T }); const note = (notes.j?.data || []).find((n) => n.kind === "support_reply" && n.link === "/admin/support");
  step("support: request reaches the super inbox with the business name, the reply comes back answered with a notification", req.status === 201 && !!mine && !!mine.business?.name && rep.status === 200 && answered?.status === "answered" && answered?.reply?.startsWith("Gate reply") && !!note, JSON.stringify([req.status, mine?.business?.name, rep.j?.status, answered?.status, !!note]));
  await api(`/super/support_requests/${req.j?.id}/close`, { method: "POST", token: ST });
  const ps = await api("/super/platform_settings", { method: "PUT", token: ST, body: { values: { announcement: "E2E announcement" } } });
  const plat2 = await api("/platform");
  await api("/super/platform_settings", { method: "PUT", token: ST, body: { values: { announcement: "" } } });
  const stats = await api("/super/stats", { token: ST }); const health = await api("/super/health", { token: ST });
  step("super: platform settings change what every panel reads; stats and health answer", ps.status === 200 && plat2.j?.announcement === "E2E announcement" && stats.status === 200 && typeof stats.j?.open_support_requests === "number" && health.j?.status === "ok", JSON.stringify([ps.status, plat2.j?.announcement, stats.j?.open_support_requests]));

  // Online ordering: the storefront cart places an order, it waits in the cashier's queue, acceptance moves the guest's stage on.
  const sfo = await api("/public/storefront/demo-cafe");
  const prod = sfo.j?.products?.find((x) => !x.variants?.length) || sfo.j?.products?.[0];
  const placed = await api("/public/storefront/demo-cafe/orders", { method: "POST", body: { lines: [{ product_id: prod?.id, quantity: 2 }], order_type: "takeaway", customer: { name: "Gate Guest", phone: "03009998877" }, notes: "gate" } });
  const queue = await api("/qr_orders?source=online", { token: T, branch: branchId });
  const inQueue = (queue.j?.data || []).some((o) => o.id === placed.j?.id);
  const acc = placed.j?.id ? await api(`/qr_orders/${placed.j.id}/accept`, { method: "POST", token: T, branch: branchId }) : { status: 0 };
  const track = placed.j?.id ? await api(`/public/storefront/demo-cafe/orders/${placed.j.id}?guest_token=${placed.j.guest_token}`) : { status: 0, j: null };
  step("online ordering: cart order waits in the queue, cashier accepts, guest tracking moves to accepted", placed.status === 201 && placed.j.stage === "waiting" && inQueue && acc.status === 200 && track.j?.stage === "accepted", JSON.stringify([placed.status, placed.j?.stage, inQueue, acc.status, track.j?.stage]));

  // Super panel in the browser: login and every screen renders.
  const sctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const sp = await sctx.newPage(); wire(sp, "super");
  await sp.goto(WEB + "/super/login"); await sp.waitForSelector("input[type=email]", { timeout: 60000 }); await sp.fill("input[type=email]", "admin@easalpha.com"); await sp.fill("input[type=password]", "admin12345");
  await sp.getByRole("button", { name: /log in|sign in/i }).click();
  try { await sp.waitForURL(/\/super(\/)?$/, { timeout: 60000 }); step("super: panel login", true, sp.url()); } catch { step("super: panel login", false, sp.url()); await shot(sp, "super-login-fail"); }
  await sp.waitForTimeout(1200); await shot(sp, "super-dashboard");
  for (const p of ["/super", "/super/businesses", `/super/businesses/${me.j.business.id}`, "/super/support", "/super/invoices", "/super/flags", "/super/settings"]) {
    const before = report.consoleErrors.length, beforeF = report.failedRequests.length;
    const resp = await sp.goto(WEB + p, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
    await sp.waitForTimeout(400);
    const body = await sp.evaluate(() => document.body.innerText).catch(() => "");
    const broken = /Application error|Unhandled Runtime Error|This page could not be found/.test(body || "");
    const r = { path: p, status: resp?.status(), broken, newConsoleErrors: report.consoleErrors.length - before, newFailedRequests: report.failedRequests.length - beforeF, textLength: (body || "").length };
    report.pages.push(r); step(`super ${p}`, !broken && r.status === 200 && r.newFailedRequests === 0 && !/\/super\/login/.test(sp.url()), JSON.stringify(r));
  }
  await shot(sp, "super-support"); await sctx.close();

  // Admin Help box opens from the sidebar and shows the contact card.
  await a.goto(WEB + "/admin", { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
  const helpBtn = a.getByRole("button", { name: /help/i }).first();
  let helpText = "";
  if (await helpBtn.count()) { await helpBtn.click(); await a.waitForTimeout(600); const contactTab = a.getByRole("tab", { name: "Contact" }); if (await contactTab.count()) await contactTab.click(); await a.waitForTimeout(400); helpText = await a.evaluate(() => document.body.innerText).catch(() => ""); await shot(a, "admin-help-box"); }
  step("support: Help & Support box opens with the contact card", /WhatsApp/i.test(helpText) && new RegExp((plat.j?.support_email || "@").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(helpText), (helpText || "").slice(0, 100).replace(/\s+/g, " "));
  await a.keyboard.press("Escape").catch(() => {});
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

// "Set up this device": a manager signs in on the machine, picks a role, and the device is paired without a code.
const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const sp = await sctx.newPage(); wire(sp, "setup");
await sp.goto(WEB + "/setup"); await sp.waitForSelector("form", { timeout: 60000 });
await sp.getByLabel("Email").fill("demo@easalpha.com"); await sp.getByLabel("Password").fill("password123"); await sp.getByRole("button", { name: "Sign in" }).click();
try { await sp.getByRole("radio", { name: /Token screen/ }).waitFor({ timeout: 15000 }); step("setup: manager login shows the role choice", true); } catch { step("setup: manager login shows the role choice", false, sp.url()); await shot(sp, "setup-login-fail"); }
await shot(sp, "setup-choose");
await sp.getByRole("radio", { name: /Token screen/ }).click().catch(() => {});
await sp.getByLabel("Name of this device").fill("E2E token screen").catch(() => {});
await sp.getByRole("button", { name: /^Set up as/ }).click().catch(() => {});
try { await sp.getByRole("button", { name: /^Open the/ }).waitFor({ timeout: 15000 }); step("setup: device registered without a pairing code", true); } catch { step("setup: device registered without a pairing code", false, sp.url()); await shot(sp, "setup-register-fail"); }
await shot(sp, "setup-ready");
await sp.getByRole("button", { name: /^Open the/ }).click().catch(() => {});
try { await sp.waitForURL(/\/token/, { timeout: 15000 }); step("setup: opens the token screen", true); } catch { step("setup: opens the token screen", false, sp.url()); }
await sp.goto(WEB + "/setup");
try { await sp.waitForURL(/\/token/, { timeout: 15000 }); step("setup: a set-up browser forwards to its screen", true); } catch { step("setup: a set-up browser forwards to its screen", false, sp.url()); }
const regd = await api("/devices", { token: T });
step("setup: device listed as paired in Admin, Devices", !!(regd.j?.data || []).find((d) => d.name === "E2E token screen" && d.paired), "");

await browser.close(); save();
console.log("\nconsole errors:", report.consoleErrors.length, "\nfailed requests:", report.failedRequests.length);
for (const f of report.failedRequests.slice(0, 20)) console.log("  ", f.label, f.status, f.url.replace(API, ""), "on", f.page.replace(WEB, ""));
const seen = new Set(); for (const c of report.consoleErrors) { const key = c.text.slice(0, 120); if (seen.has(key)) continue; seen.add(key); console.log("  ", c.label, c.url.replace(WEB, ""), c.text.slice(0, 200)); if (seen.size > 12) break; }
