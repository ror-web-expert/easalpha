// Manual API walk-through of the 12 Oct 2026 features on the local demo data: a hostel student with an opening
// balance, a sale on account, a correction and its reversal, the bill (JSON, PDF, public link, send), barcodes, a daily
// wage with an advance, the employee statement, and the module switch. Run it only while the API logs WhatsApp
// messages instead of sending them (no WHATSAPP_GATEWAY_URL), because the demo business has a real phone linked.
import fs from "node:fs";
const API = process.env.API || "http://localhost:3001/api/v1";
const OUT = process.argv[2] || ".";
const results = [];
const step = (name, ok, info = "") => { results.push({ name, ok, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
async function call(path, { method = "GET", token, body, raw } = {}) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") };
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
const login = await call("/auth/login", { method: "POST", body: { email: "demo@easalpha.com", password: "password123" } });
const T = login.j.access_token;
step("login carries the modules", login.j.modules?.customer_accounts === true && login.j.modules?.payroll === true, JSON.stringify(login.j.modules));
const tag = String(Date.now()).slice(-5);
const phone = `+92300${String(Date.now()).slice(-7)}`;

// Student with an opening balance
const st = await call("/customers", { method: "POST", token: T, body: { name: `Hamza Test ${tag}`, phone, room: "B-12", member_no: `R-${tag}`, guardian_name: "Tariq Test", guardian_phone: `+92311${String(Date.now()).slice(-7)}`, notify_guardian: true,
  opening_balance_minor: 300000, opening_reason: "Carried over from the paper register" } });
step("student created with opening balance Rs 3,000", st.status === 201 && st.j.balance_minor === 300000, `${st.status} balance ${st.j?.balance_minor}`);
const S = st.j;
const dup = await call(`/customers/duplicates?name=${encodeURIComponent(`hamza  test ${tag}`)}&member_no=${encodeURIComponent(`r-${tag}`)}`, { token: T });
step("duplicate check finds the student by name and roll no", dup.j?.data?.[0]?.id === S.id, JSON.stringify(dup.j?.data?.[0]?.reasons));
const again = await call(`/customers/${S.id}/adjustments`, { method: "POST", token: T, body: { kind: "opening", amount_minor: 1000, reason: "twice" } });
step("a second opening balance is refused", again.status === 409 && again.j?.error?.code === "khata.opening_exists", String(again.status));

// A sale on account at the till
const cat = await call("/catalog", { token: T });
const product = cat.j.products.find((p) => p.active && !p.variants?.length && !(p.modifier_group_ids || []).length) || cat.j.products[0];
const order = await call("/orders", { method: "POST", token: T, body: { order_type: "takeaway", customer_id: S.id, lines: [{ product_id: product.id, quantity: 2 }], place: true } });
const pay = await call(`/orders/${order.j.id}/payments`, { method: "POST", token: T, body: { payments: [{ method_code: "khata", amount_minor: order.j.total_minor }] } });
step("order put on the student's account", pay.status === 201, `${product.name} x2 = Rs ${order.j.total_minor / 100}`);
const afterSale = (await call(`/customers/${S.id}`, { token: T })).j.balance_minor;
step("balance includes the sale", afterSale === 300000 + order.j.total_minor, `Rs ${afterSale / 100}`);

// Correction and reversal
const adj = await call(`/customers/${S.id}/adjustments`, { method: "POST", token: T, body: { kind: "adjustment", amount_minor: -5000, reason: "Tea charged twice" } });
step("correction of Rs -50 with a reason", adj.status === 201 && adj.j.customer.balance_minor === afterSale - 5000, adj.j?.adjustment?.label);
const rev = await call(`/customer_adjustments/${adj.j.adjustment.id}/reverse`, { method: "POST", token: T, body: { reason: "The tea was right" } });
step("reversal restores the balance", rev.status === 201 && rev.j.customer.balance_minor === afterSale, rev.j?.adjustment?.label);
const ledger = await call(`/customers/${S.id}/ledger`, { token: T });
step("ledger lists opening, sale, adjustment, reversal", JSON.stringify(ledger.j.entries.map((e) => e.kind)) === JSON.stringify(["opening", "charge", "adjustment", "reversal"]), ledger.j.entries.map((e) => `${e.kind}:${e.amount_minor}`).join(" "));
step("sale line shows the items", /2x /.test(ledger.j.entries[1]?.items || ""), ledger.j.entries[1]?.items);

// Bill for this month (the sale is today)
const now = new Date(); const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
const to = (await call("/me", { token: T })).j.branch?.business_day || now.toISOString().slice(0, 10);
const bill = await call(`/customers/${S.id}/bill?from=${from}&to=${to}`, { token: T });
step("bill JSON has the period totals", bill.status === 200 && bill.j.closing_balance_minor === afterSale, `brought forward ${bill.j.brought_forward_minor / 100}, purchases ${bill.j.totals?.charges_minor / 100}, due ${bill.j.closing_balance_minor / 100}, due on ${bill.j.due_on}`);
const pdf = await call(`/customers/${S.id}/bill.pdf?from=${from}&to=${to}`, { token: T, raw: true });
fs.writeFileSync(`${OUT}/bill-${tag}.pdf`, pdf.buf);
step("bill PDF downloads", pdf.type === "application/pdf" && pdf.buf.subarray(0, 5).toString() === "%PDF-", `${pdf.buf.length} bytes`);
const token = bill.j.link.split("/bill/")[1];
const pub = await call(`/public/bills/${token}`);
step("public bill link opens without login", pub.status === 200 && pub.j.customer?.name === S.name, bill.j.link.slice(0, 60) + "...");
const send = await call(`/customers/${S.id}/send_bill`, { method: "POST", token: T, body: { from, to } });
step("send bill goes to the student and the guardian", send.status === 201 && send.j.sent === 2, `${send.j?.to?.join(", ")} statuses ${send.j?.statuses?.join(",")}`);
step("messages are only logged in this test (nothing sent)", (send.j?.statuses || []).every((s) => s === "logged"), (send.j?.statuses || []).join(","));
const bills = await call(`/customer_bills?from=${from}&to=${to}`, { token: T });
step("Monthly Bills list includes the student", !!bills.j.rows.find((r) => r.customer.id === S.id), `${bills.j.rows.length} customers, due Rs ${bills.j.totals.due_minor / 100}`);
const all = await call(`/customer_bills.pdf?from=${from}&to=${to}`, { token: T, raw: true });
fs.writeFileSync(`${OUT}/all-bills.pdf`, all.buf);
step("print-all PDF downloads", all.buf.subarray(0, 5).toString() === "%PDF-", `${all.buf.length} bytes`);

// Barcodes
const p2 = cat.j.products.find((p) => p.active && p.id !== product.id) || product;
const gen = await call("/products/barcodes/generate", { method: "POST", token: T, body: { count: 1 } });
const code = gen.j.codes[0];
const add = await call(`/products/${p2.id}/barcodes`, { method: "POST", token: T, body: { code } });
step("in-store barcode generated and attached", add.status === 201, `${code} on ${p2.name}`);
const look = await call(`/products/barcode_lookup?code=${code}`, { token: T });
step("scanning the code finds the product", look.j?.product_id === p2.id && look.j.format === "ean13", look.j?.product_name);
await call(`/products/${p2.id}/barcodes/${add.j.barcode.id}`, { method: "DELETE", token: T });

// Wages
const emp = await call("/employees", { method: "POST", token: T, body: { name: `Daily Helper ${tag}`, phone: `+92345${String(Date.now()).slice(-7)}`, base_salary_minor: 120000, pay_frequency: "daily", joined_on: from } });
step("daily-wage employee created", emp.status === 201 && emp.j.pay_frequency === "daily", `Rs 1,200 a day`);
const adv = await call("/payroll/advances", { method: "POST", token: T, body: { employee_id: emp.j.id, amount_minor: 50000, reason: "Medicine" } });
await call(`/payroll/advances/${adv.j.id}/decide`, { method: "POST", token: T, body: { approve: true } });
const advPaid = await call(`/payroll/advances/${adv.j.id}/pay`, { method: "POST", token: T, body: { method_code: "cash" } });
step("advance of Rs 500 paid", advPaid.status < 300, String(advPaid.status));
const due = await call(`/wages/due?day=${to}`, { token: T });
const row = due.j.data.find((r) => r.employee_id === emp.j.id);
step("Pay Wages lists the helper with today's wage", row?.gross_minor === 120000, `days ${row?.days_worked}, outstanding advance ${row?.advances_outstanding_minor / 100}`);
const wage = await call("/wages", { method: "POST", token: T, body: { employee_id: emp.j.id, from: to, bonus_minor: 10000, advance_recovery_minor: 20000 } });
step("wage paid: 1,200 + 100 bonus - 200 advance = 1,100", wage.j?.net_minor === 110000, `${wage.j?.label} net Rs ${wage.j?.net_minor / 100}`);
const stmt = await call(`/employees/${emp.j.id}/statement?from=${from}&to=${to}`, { token: T });
step("employee statement balances", stmt.j?.closing_balance_minor === -30000, `earned ${stmt.j?.totals?.earned_minor / 100}, paid ${stmt.j?.totals?.paid_minor / 100}, advances ${stmt.j?.totals?.advances_minor / 100}, balance ${stmt.j?.closing_balance_minor / 100} (employee still owes Rs 300 of the advance)`);

// Module switch (owner only), then back on
await call("/settings", { method: "PATCH", token: T, body: { values: { "modules.customer_accounts": false } } });
const off = await call(`/customers/${S.id}/ledger`, { token: T });
step("with customer accounts off the ledger answers module.disabled", off.status === 403 && off.j?.error?.code === "module.disabled", String(off.status));
await call("/settings", { method: "PATCH", token: T, body: { values: { "modules.customer_accounts": true } } });
const on = await call(`/customers/${S.id}/ledger`, { token: T });
step("switched back on, everything is still there", on.status === 200 && on.j.entries.length === 4, `${on.j?.entries?.length} entries`);

fs.writeFileSync(`${OUT}/manual-api-results.json`, JSON.stringify({ student: S.id, employee: emp.j.id, results }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} passed`);
