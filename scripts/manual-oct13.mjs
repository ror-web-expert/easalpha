// Hands-on pass of the 13 Oct 2026 features in a real browser against the local demo: QR table ordering end to end
// (guest phone, till accept, waiter call, table bill), barcodes (generate, lookup, labels PDF, scanner test, a wedge scan
// on the till), printing (the till's receipt to a print server, the customer bill PDF and public link), khata at the
// till (search, pay on account, the limit), and security (no token, wrong role, modules off, secrets, other tenant,
// PIN lock, CORS, rate limit). Usage: WEB=http://localhost:3002 PIN=0000 node scripts/manual-oct13.mjs
// Run it only while the API logs WhatsApp instead of sending (customers it creates have no phone, so nothing goes out).
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
const API = process.env.API || "http://localhost:3001/api/v1", WEB = process.env.WEB || "http://localhost:3002", PIN = process.env.PIN || "1111";
const OUT = new URL("./shots/manual-oct13/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = "") => { results.push({ name, ok, info: String(info).slice(0, 300) }); console.log(`${ok ? "ok  " : "FAIL"} ${name} ${String(info).slice(0, 200)}`); };
async function api(path, { method = "GET", token, body, headers = {}, raw } = {}) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type"), headers: r.headers };
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, headers: r.headers };
}
const tag = String(Date.now()).slice(-5);
const login = await api("/auth/login", { method: "POST", body: { email: "demo@easalpha.com", password: "password123" } });
const T = login.j.access_token;
const me = await api("/me", { token: T });
const branchId = me.j?.branch?.id || me.j?.branches?.[0]?.id || login.j?.branch?.id;
const settings0 = await api("/settings", { token: T });
const flat = Object.values(settings0.j?.groups || {}).flatMap((g) => Object.values(g.screens || {}).flat());
const setting = (k) => flat.find((s) => s.key === k)?.value;
const original = { "pos.print_server.ip": setting("pos.print_server.ip") ?? null, "pos.print_server.port": setting("pos.print_server.port") ?? 9100, "pos.order_behavior.confirmation_popup": setting("pos.order_behavior.confirmation_popup") ?? true, "pos.barcode_scanning.enabled": setting("pos.barcode_scanning.enabled") ?? true };

// A stand-in for the desktop print server: records every job the till posts.
const printJobs = [];
const printServer = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => { body += c; });
  req.on("end", () => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method === "POST" && req.url === "/print") { try { printJobs.push(JSON.parse(body)); } catch {} res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{\"ok\":true}"); }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]"); });
});
await new Promise((r) => printServer.listen(9977, "127.0.0.1", r));
await api("/settings", { method: "PATCH", token: T, body: { values: { "pos.print_server.ip": "127.0.0.1", "pos.print_server.port": 9977, "pos.order_behavior.confirmation_popup": true, "pos.barcode_scanning.enabled": true } } });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const wire = (p, label) => { p.on("pageerror", (e) => errors.push(`${label} ${String(e).slice(0, 160)}`)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errors.push(`${label} console ${m.text().slice(0, 160)}`); }); };

// ---- The till: pair a device and sign in with the cashier PIN.
const existing = (await api("/devices", { token: T })).j?.data || [];
for (const d of existing) if (d.name === "Manual test till") await api(`/devices/${d.id}`, { method: "DELETE", token: T });
let till = await api("/devices", { method: "POST", token: T, body: { name: "Manual test till", kind: "till" } });
if (till.status !== 201) { const c = existing.find((d) => d.kind === "till"); till = await api(`/devices/${c.id}/regenerate_code`, { method: "POST", token: T }); }
const tillCtx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const t = await tillCtx.newPage(); wire(t, "till");
await t.goto(WEB + "/pos/pair"); await t.waitForSelector("button", { timeout: 60000 });
for (const d of till.j.pairing_code) await t.getByRole("button", { name: d, exact: true }).first().click();
await t.getByRole("button", { name: "Pair" }).click();
await t.waitForURL(/\/pos\/pin/, { timeout: 20000 });
for (const d of PIN) await t.getByRole("button", { name: d, exact: true }).first().click();
await t.waitForURL(/\/pos$/, { timeout: 20000 }); await t.waitForTimeout(2500);
step("till paired and signed in with the PIN", /\/pos$/.test(t.url()), t.url());
const closeDialogs = async (p) => { for (let i = 0; i < 3 && (await p.locator('[role="dialog"]').count()); i++) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); const c = p.locator('[role="dialog"]').getByRole("button", { name: /^(Close|Skip|Later|Not now|Cancel|OK)$/i }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } } };
await closeDialogs(t);
const newOrder = async () => { await closeDialogs(t); await t.evaluate(() => { try { const k = Object.keys(localStorage).find((x) => x.includes("cart")); if (k) localStorage.removeItem(k); } catch {} }); await t.goto(WEB + "/pos"); await t.waitForTimeout(1500); await closeDialogs(t); };
// The grid opens on Favourites, so a tile is found through the item search (F2) by name.
const addTile = async (name) => { await t.keyboard.press("F2"); await t.waitForTimeout(200); await t.keyboard.type(name.slice(0, 12)); await t.waitForTimeout(700); await t.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click(); await t.waitForTimeout(500); await t.keyboard.press("Escape"); };
const catalog = await api("/catalog", { token: T });
const simple = catalog.j.products.filter((p) => p.active && !p.variants?.length && !(p.modifier_group_ids || []).length);
const product = simple[0];

// ================= 1. Order and QR =================
{
  const branch = (await api(`/branches/${branchId}`, { token: T })).j || {};
  const qr0 = branch.qr_settings || {};
  const set = await api(`/branches/${branchId}`, { method: "PATCH", token: T, body: { qr_settings: { ...qr0, enabled: true, cashier_accept: true, call_waiter: true, ask_bill: true, running_bill: true, guest_name: true, welcome: "Welcome! Order from your seat." } } });
  step("qr: ordering switched on for the branch", set.status === 200, String(set.status));
  const tables = (await api("/tables", { token: T })).j?.data || [];
  const table = tables.find((x) => !x.current_order_id && x.qr_token) || tables[0];
  const card = await api(`/tables/${table.id}/qr`, { token: T });
  step("qr: the table card links to this site's /q/ page", card.status === 200 && card.j.url === `${WEB.replace(/:\d+$/, ":3000")}/q/${table.qr_token}` || /\/q\/[A-Za-z0-9_-]+$/.test(card.j?.url || ""), card.j?.url);
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); wire(a, "admin");
  await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]"); await a.fill("input[type=email]", "demo@easalpha.com"); await a.fill("input[type=password]", "password123"); await a.getByRole("button", { name: "Log in" }).click(); await a.waitForURL(/\/admin/, { timeout: 60000 });
  await a.goto(WEB + "/admin/settings/qr", { waitUntil: "networkidle" }); await a.waitForTimeout(1200); await a.screenshot({ path: OUT + "qr-admin-settings.png", fullPage: true });
  const cardsText = await a.evaluate(() => document.body.innerText);
  step("qr: Settings, QR ordering shows the table cards", /Table cards/.test(cardsText) && new RegExp(table.code).test(cardsText), table.code);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const g = await phone.newPage(); wire(g, "guest");
  await g.goto(`${WEB}/q/${table.qr_token}`, { waitUntil: "networkidle", timeout: 60000 }); await g.waitForTimeout(800);
  const gt = await g.evaluate(() => document.body.innerText);
  step("qr: guest page shows the business, the table and the welcome", /Demo Cafe/.test(gt) && new RegExp(`Table ${table.code}`, "i").test(gt) && /Welcome! Order from your seat/.test(gt), gt.slice(0, 120).replace(/\n/g, " | "));
  await g.screenshot({ path: OUT + "qr-guest-menu.png", fullPage: true });
  await g.getByRole("button", { name: `Add ${product.name}` }).first().click();
  await g.getByRole("button", { name: "View order" }).click();
  await g.getByPlaceholder("So the waiter knows who ordered").fill("Gate Guest");
  await g.screenshot({ path: OUT + "qr-guest-cart.png" });
  await g.getByRole("button", { name: /Place order/ }).click();
  await g.waitForTimeout(1500);
  const after = await g.evaluate(() => document.body.innerText);
  step("qr: order placed and waits for the counter", /Sent to the counter/.test(after), after.slice(0, 160).replace(/\n/g, " | "));
  await g.screenshot({ path: OUT + "qr-guest-waiting.png" });
  const pending = (await api("/qr_orders", { token: T })).j?.data || [];
  const mine = pending.find((o) => o.guest_name === "Gate Guest");
  step("qr: the order is on the till's QR queue", !!mine, JSON.stringify(pending.map((o) => [o.guest_name, o.table_code]).slice(0, 5)));
  await t.goto(WEB + "/pos/qr", { waitUntil: "networkidle" }); await t.waitForTimeout(1500); await closeDialogs(t);
  await t.screenshot({ path: OUT + "qr-till-queue.png" });
  const acceptBtn = t.getByRole("button", { name: "Accept" }).first();
  if (await acceptBtn.count()) { await acceptBtn.click(); await t.waitForTimeout(1500); }
  const acceptedOrder = mine ? (await api(`/orders/${mine.id}`, { token: T })).j : null;
  const stillPending = ((await api("/qr_orders", { token: T })).j?.data || []).some((o) => o.id === mine?.id);
  step("qr: Accept on the till sends it to the kitchen", !stillPending && acceptedOrder?.status !== "draft", `${acceptedOrder?.status}, still pending: ${stillPending}`);
  await g.waitForTimeout(11000);
  const live = await g.evaluate(() => document.body.innerText);
  step("qr: the guest's phone moves to Being prepared on its own", /Being prepared/.test(live), live.slice(0, 120).replace(/\n/g, " | "));
  await g.screenshot({ path: OUT + "qr-guest-accepted.png" });
  await g.getByRole("button", { name: "Order more" }).click(); await g.waitForTimeout(400);
  await g.getByRole("button", { name: "Call a waiter" }).click(); await g.waitForTimeout(1200);
  const reqs = (await api("/qr_orders/requests", { token: T })).j?.data || [];
  step("qr: Call a waiter reaches the till", reqs.some((r) => r.kind === "call_waiter" && r.table_code === table.code), JSON.stringify(reqs.slice(0, 3)));
  await g.getByRole("button", { name: "Table bill" }).click(); await g.waitForTimeout(1200);
  const billText = await g.evaluate(() => document.body.innerText);
  step("qr: the table bill lists the dish", new RegExp(product.name).test(billText), billText.slice(0, 120).replace(/\n/g, " | "));
  await g.screenshot({ path: OUT + "qr-guest-bill.png" });
  await t.goto(WEB + "/pos/qr", { waitUntil: "networkidle" }); await t.waitForTimeout(1000);
  const handle = t.getByRole("button", { name: "Handle" }).first(); if (await handle.count()) { await handle.click(); await t.waitForTimeout(800); }
  const reqs2 = (await api("/qr_orders/requests", { token: T })).j?.data || [];
  step("qr: Handle on the till clears the request", !reqs2.some((r) => r.kind === "call_waiter" && r.table_code === table.code), String(reqs2.length));
  // Tidy: void the guest order so the table is free again.
  if (mine) await api(`/orders/${mine.id}/void`, { method: "POST", token: T, body: { reason: "manual test" } });
  await api(`/branches/${branchId}`, { method: "PATCH", token: T, body: { qr_settings: qr0 } });
  await phone.close(); await a.context().close();
}

// ================= 2. Barcodes =================
let code = null;
{
  const target = simple[1] || product;
  const have = (await api(`/products/${target.id}`, { token: T })).j?.barcodes || [];
  let gen = { status: 0 };
  if (!have.length) {
    gen = await api("/products/barcodes/generate", { method: "POST", token: T, body: { count: 1 } });
    const fresh = gen.j?.codes?.[0] || gen.j?.data?.[0]?.code || gen.j?.data?.[0];
    await api(`/products/${target.id}/barcodes`, { method: "POST", token: T, body: { code: fresh } });
  }
  code = ((await api(`/products/${target.id}`, { token: T })).j?.barcodes || [])[0]?.code;
  step("barcode: a product has a code (generated and attached when it had none)", !!code, `${target.name} ${code} (${gen.status})`);
  const look = await api(`/products/barcode_lookup?code=${encodeURIComponent(code)}`, { token: T });
  step("barcode: lookup finds the product", look.status === 200 && (look.j?.product?.id === target.id || look.j?.id === target.id), JSON.stringify(look.j).slice(0, 120));
  const bad = await api("/products/barcode_lookup?code=0000000000000", { token: T });
  step("barcode: an unknown code answers 404", bad.status === 404, String(bad.status));
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 800 }, acceptDownloads: true })).newPage(); wire(a, "admin2");
  await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]"); await a.fill("input[type=email]", "demo@easalpha.com"); await a.fill("input[type=password]", "password123"); await a.getByRole("button", { name: "Log in" }).click(); await a.waitForURL(/\/admin/, { timeout: 60000 });
  await a.goto(WEB + "/admin/products/labels", { waitUntil: "networkidle" }); await a.waitForTimeout(1200);
  const pick = a.getByRole("checkbox", { name: `Pick ${target.name}` }).first();
  if (await pick.count()) await pick.check();
  await a.screenshot({ path: OUT + "barcode-labels.png", fullPage: true });
  const dl = a.waitForEvent("download", { timeout: 20000 }).catch(() => null);
  await a.getByRole("button", { name: "Download PDF" }).click();
  const file = await dl;
  const pdfPath = file ? await file.path() : null;
  const head = pdfPath ? fs.readFileSync(pdfPath).subarray(0, 5).toString() : "";
  step("barcode: Barcode Labels downloads a PDF", head === "%PDF-", `${file?.suggestedFilename()} ${head}`);
  await a.goto(WEB + "/admin/settings/point-of-sale", { waitUntil: "networkidle" }); await a.waitForTimeout(1200);
  const cardTitle = a.getByText("Test your scanner");
  step("barcode: the scanner test card is on the page", (await cardTitle.count()) > 0, a.url());
  const area = a.getByRole("textbox", { name: /Scanner test area/ });
  if (await area.count()) await area.first().click();
  await a.keyboard.type(code, { delay: 5 }); await a.keyboard.press("Enter"); await a.waitForTimeout(600);
  const devText = await a.evaluate(() => document.body.innerText);
  step("barcode: the scanner test shows the scanned code", devText.includes(code), "");
  await a.screenshot({ path: OUT + "barcode-scanner-test.png", fullPage: true });
  await a.context().close();
  // The till: a keyboard-wedge scan adds the item.
  await newOrder();
  await t.mouse.click(700, 400);
  await t.keyboard.type(code, { delay: 5 }); await t.keyboard.press("Enter"); await t.waitForTimeout(1200);
  const panel = await t.evaluate(() => document.body.innerText);
  step("barcode: a wedge scan on the till adds the product", new RegExp(target.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(panel) && /1 item/.test(panel), panel.match(/\d+ items?/)?.[0] ?? "");
  await t.screenshot({ path: OUT + "barcode-till-scan.png" });
}

// ================= 3. Bill print =================
{
  await newOrder();
  await addTile(product.name);
  await t.keyboard.press("F8"); await t.waitForTimeout(800);
  const dlg = t.locator('[role="dialog"]').last();
  await dlg.getByRole("button", { name: /^Cash/ }).first().click().catch(() => {});
  await t.waitForTimeout(300);
  const quick = dlg.locator("button", { hasText: /^Rs [\d,]+$/ }).first(); if (await quick.count()) await quick.click();
  await dlg.getByRole("button", { name: /^(Pay|Take|Charge|Complete)/ }).first().click();
  await t.waitForTimeout(2000);
  const receiptDlg = t.locator('[role="dialog"]').last();
  const rtext = await receiptDlg.innerText().catch(() => "");
  step("print: the receipt popup shows after paying", /Print/.test(rtext) && new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(rtext), rtext.slice(0, 120).replace(/\n/g, " | "));
  await t.screenshot({ path: OUT + "print-receipt-dialog.png" });
  const before = printJobs.length;
  await receiptDlg.getByRole("button", { name: "Print" }).click(); await t.waitForTimeout(1500);
  const job = printJobs[printJobs.length - 1];
  step("print: Print sends the receipt to the print server", printJobs.length > before && job?.role === "receipt" && JSON.stringify(job.lines).includes(product.name), `${printJobs.length - before} job(s), ${job?.lines?.length ?? 0} lines`);
  await closeDialogs(t);
  // The customer bill: a student with an opening balance and a sale on account, the PDF, the public link.
  const st = await api("/customers", { method: "POST", token: T, body: { name: `Bill Test ${tag}`, room: "C-7", member_no: `B-${tag}`, opening_balance_minor: 150000, opening_reason: "Old register" } });
  const S = st.j;
  const order = await api("/orders", { method: "POST", token: T, body: { order_type: "takeaway", customer_id: S.id, lines: [{ product_id: product.id, quantity: 1 }], place: true } });
  const pay = await api(`/orders/${order.j.id}/payments`, { method: "POST", token: T, body: { payments: [{ method_code: "khata", amount_minor: order.j.total_minor }] } });
  step("print: a sale on account for the bill", st.status === 201 && pay.status === 201, `${st.status} ${pay.status}`);
  const pdf = await api(`/customers/${S.id}/bill.pdf`, { token: T, raw: true });
  step("print: the customer bill PDF renders", pdf.status === 200 && pdf.buf.subarray(0, 5).toString() === "%PDF-", `${pdf.status} ${pdf.type} ${pdf.buf.length} bytes`);
  fs.writeFileSync(OUT + "customer-bill.pdf", pdf.buf);
  const bill = await api(`/customers/${S.id}/bill`, { token: T });
  const link = bill.j?.link || bill.j?.public_url || bill.j?.url;
  step("print: the bill JSON carries a public link", bill.status === 200 && /\/bill\//.test(link || ""), link);
  const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage(); wire(pub, "public-bill");
  const token = (link || "").split("/bill/")[1];
  await pub.goto(`${WEB}/bill/${token}`, { waitUntil: "networkidle" }); await pub.waitForTimeout(800);
  const ptext = await pub.evaluate(() => document.body.innerText);
  step("print: the public bill page opens for the customer", new RegExp(`Bill Test ${tag}`).test(ptext) && /Download PDF/.test(ptext), ptext.slice(0, 120).replace(/\n/g, " | "));
  await pub.screenshot({ path: OUT + "print-public-bill.png", fullPage: true });
  const pubPdf = await api(`/public/bills/${token}/pdf`, { raw: true });
  step("print: the public bill PDF downloads without a login", pubPdf.status === 200 && pubPdf.buf.subarray(0, 5).toString() === "%PDF-", String(pubPdf.status));
  const badLink = await api("/public/bills/not-a-real-token");
  step("security: a made-up bill link answers 404", badLink.status === 404, String(badLink.status));
  await pub.context().close();
}

// ================= 4. Khata at the till =================
{
  const cust = await api("/customers", { method: "POST", token: T, body: { name: `Khata Till ${tag}`, room: "D-3", member_no: `K-${tag}`, credit_limit_minor: 100000 } });
  const C = cust.j;
  await newOrder();
  await t.keyboard.press("F3"); await t.waitForTimeout(500);
  await t.getByLabel("Search customers").fill(`Khata Till ${tag}`); await t.waitForTimeout(900);
  const opt = t.getByRole("listbox", { name: "Customers found" }).locator("[role=option], li, button").first();
  if (await opt.count()) await opt.click();
  await t.waitForTimeout(500);
  const useBtn = t.locator('[role="dialog"]').getByRole("button", { name: /Use|Attach|Select|Continue|Done|this customer/i }).first();
  if (await useBtn.count()) await useBtn.click();
  await t.waitForTimeout(500); await closeDialogs(t);
  await t.screenshot({ path: OUT + "khata-till-customer.png" });
  const withCustomer = await t.evaluate(() => document.body.innerText);
  step("khata: the till finds the customer by name and attaches them", new RegExp(`Khata Till ${tag}`).test(withCustomer), "");
  await addTile(product.name);
  await t.keyboard.press("F8"); await t.waitForTimeout(800);
  const dlg = t.locator('[role="dialog"]').last();
  await dlg.getByRole("button", { name: /^Khata/ }).first().click(); await t.waitForTimeout(600);
  const ktext = await dlg.innerText();
  step("khata: Pay shows the account summary for the customer", /owes|limit|Limit/i.test(ktext), ktext.match(/[^\n]*(owes|limit)[^\n]*/i)?.[0] ?? ktext.slice(0, 100));
  await t.screenshot({ path: OUT + "khata-till-pay.png" });
  await dlg.getByRole("button", { name: /^(Pay|Take|Charge|Complete)/ }).first().click(); await t.waitForTimeout(2500);
  const bal = (await api(`/customers/${C.id}`, { token: T })).j;
  step("khata: the sale goes on the customer's account", bal?.balance_minor > 0, `balance Rs ${(bal?.balance_minor ?? 0) / 100}`);
  await closeDialogs(t);
  // Over the limit: the server refuses.
  const big = catalog.j.products.filter((p) => p.active && !p.variants?.length).sort((a, b) => b.base_price_minor - a.base_price_minor)[0];
  const o2 = await api("/orders", { method: "POST", token: T, body: { order_type: "takeaway", customer_id: C.id, lines: [{ product_id: big.id, quantity: 5 }], place: true } });
  const p2 = await api(`/orders/${o2.j.id}/payments`, { method: "POST", token: T, body: { payments: [{ method_code: "khata", amount_minor: o2.j.total_minor }] } });
  step("khata: a sale over the limit is refused", p2.status === 409 || p2.status === 422, `${p2.status} ${p2.j?.error?.code}`);
  await api(`/orders/${o2.j.id}/void`, { method: "POST", token: T, body: { reason: "manual test" } });
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); wire(a, "admin3");
  await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]"); await a.fill("input[type=email]", "demo@easalpha.com"); await a.fill("input[type=password]", "password123"); await a.getByRole("button", { name: "Log in" }).click(); await a.waitForURL(/\/admin/, { timeout: 60000 });
  for (const p of ["/admin/customers/account", "/admin/customers/ledger", "/admin/customers/bills", "/admin/customers/payments"]) {
    await a.goto(WEB + p, { waitUntil: "networkidle" }); await a.waitForTimeout(900);
    const txt = await a.evaluate(() => document.body.innerText);
    step(`khata: ${p} opens`, !/Application error|could not be found/.test(txt), "");
    await a.screenshot({ path: OUT + "khata" + p.replace(/\//g, "_") + ".png", fullPage: true });
  }
  await a.context().close();
}

// ================= 5. Security =================
{
  const noTok = await api("/customers");
  step("security: no token answers 401", noTok.status === 401, String(noTok.status));
  const cors = await fetch(API + "/health", { headers: { Origin: "https://evil.example" } });
  step("security: a foreign origin gets no CORS allow header", !cors.headers.get("access-control-allow-origin"), String(cors.headers.get("access-control-allow-origin")));
  const cat = await api("/catalog", { token: T });
  const sync = await api("/sync/changes?since=0", { token: T });
  const secretKeys = ["tax.pra.access_code", "tax.pra.bearer_token", "security.expense_report_pin"];
  const leaked = [cat.j?.business?.settings, sync.j?.settings, sync.j?.business?.settings].flatMap((s) => secretKeys.filter((k) => s && Object.prototype.hasOwnProperty.call(s, k)));
  step("security: catalog and sync carry no secret settings", leaked.length === 0, JSON.stringify(leaked));
  // A manager with settings.manage but not the owner cannot switch a module on through PATCH /business.
  const roles = (await api("/roles", { token: T })).j?.data || [];
  const mgrRole = roles.find((r) => r.system_key === "manager") || roles[0];
  const mgr = await api("/staff", { method: "POST", token: T, body: { name: "Sec Manager", email: `sec-mgr-${tag}@easalpha.test`, password: "password123", role_id: mgrRole.id, staff_type: "admin", pin: "2468" } });
  const perms = await api(`/staff/${mgr.j?.id}/permissions`, { token: T });
  await api(`/staff/${mgr.j?.id}/permissions`, { method: "PUT", token: T, body: { codes: [...new Set([...(perms.j?.effective || perms.j?.granted || []), "settings.manage"])] } });
  const mgrLogin = await api("/auth/login", { method: "POST", body: { email: `sec-mgr-${tag}@easalpha.test`, password: "password123" } });
  const M = mgrLogin.j?.access_token;
  const flip = await api("/business", { method: "PATCH", token: M, body: { settings: { "modules.payroll": true } } });
  step("security: a non-owner cannot switch modules through the business settings", flip.status === 403 || flip.status === 401, `${flip.status} ${flip.j?.error?.code}`);
  const own = await api("/settings", { method: "PATCH", token: M, body: { values: { "modules.payroll": false } } });
  step("security: a non-owner cannot switch modules through settings either", own.status === 403, `${own.status} ${own.j?.error?.code}`);
  // Modules off: the endpoints answer 403 module.disabled and the sidebar hides the screens.
  await api("/settings", { method: "PATCH", token: T, body: { values: { "modules.customer_accounts": false } } });
  const off = await api("/customer_bills", { token: T });
  step("security: with customer accounts off, the bill endpoint answers module.disabled", off.status === 403 && off.j?.error?.code === "module.disabled", `${off.status} ${off.j?.error?.code}`);
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); wire(a, "admin4");
  await a.goto(WEB + "/login"); await a.waitForSelector("input[type=email]"); await a.fill("input[type=email]", "demo@easalpha.com"); await a.fill("input[type=password]", "password123"); await a.getByRole("button", { name: "Log in" }).click(); await a.waitForURL(/\/admin/, { timeout: 60000 });
  await a.goto(WEB + "/admin/customers/bills", { waitUntil: "networkidle" }); await a.waitForTimeout(1000);
  const offText = await a.evaluate(() => document.body.innerText);
  step("security: the Monthly Bills screen explains the module is off", /switched off|Modules/.test(offText) && !/Application error/.test(offText), offText.slice(0, 100).replace(/\n/g, " | "));
  await a.screenshot({ path: OUT + "security-module-off.png" });
  await api("/settings", { method: "PATCH", token: T, body: { values: { "modules.customer_accounts": true } } });
  await a.context().close();
  // Another tenant cannot see this business's customer.
  const other = await api("/auth/signup", { method: "POST", body: { name: "Other Owner", business_name: `Other Biz ${tag}`, email: `other-${tag}@easalpha.test`, password: "password123" } });
  const O = other.j?.access_token;
  const myCust = (await api("/customers?limit=1", { token: T })).j?.data?.[0];
  const cross = O && myCust ? await api(`/customers/${myCust.id}`, { token: O }) : { status: 0 };
  step("security: another business cannot read this business's customer", cross.status === 404 || cross.status === 403, `${other.status} ${cross.status}`);
  // PIN lock: five wrong tries lock the staff member for 15 minutes.
  const pinDev = await api("/devices/pair", { method: "POST", body: { pairing_code: till.j.pairing_code, platform: "web", app_version: "manual" } }).catch(() => ({ status: 0 }));
  const regen = pinDev.status === 201 ? pinDev : await api(`/devices/${till.j.id}/regenerate_code`, { method: "POST", token: T }).then((r) => api("/devices/pair", { method: "POST", body: { pairing_code: r.j.pairing_code, platform: "web", app_version: "manual" } }));
  const D = regen.j?.device_token;
  let last = null;
  for (let i = 0; i < 6; i++) last = await api("/devices/pin_login", { method: "POST", token: D, body: { pin: "0001" } });
  const locked = await api("/devices/pin_login", { method: "POST", token: D, body: { pin: "2468" } });
  step("security: five wrong PINs lock that till (the right PIN is refused there with pin.locked)", last?.j?.error?.code === "pin.locked" && locked.j?.error?.code === "pin.locked", `${last?.status} ${last?.j?.error?.code} then ${locked.status} ${locked.j?.error?.code}`);
  // Login rate limit: 20 posts a minute per IP (Rack::Attack), active outside the test environment when caching is on.
  let hit429 = false;
  for (let i = 0; i < 24 && !hit429; i++) { const r = await api("/auth/login", { method: "POST", body: { email: "nobody@example.com", password: "x" } }); if (r.status === 429) hit429 = true; }
  step("security: the login rate limit answers 429 after 20 tries a minute (needs the Rails cache; informational in development)", hit429, hit429 ? "429 seen" : "no 429 in 24 tries");
}

await api("/settings", { method: "PATCH", token: T, body: { values: original } });
printServer.close(); await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed; page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  ", e);
fs.writeFileSync(OUT + "results.json", JSON.stringify({ results, errors }, null, 2));
process.exit(failed.length ? 1 : 0);
