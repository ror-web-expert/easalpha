import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, PaymentInput, PaymentResult, Receipt } from "@/lib/types";
import type { LocalOrder } from "@/lib/db";
import type { Cart } from "@/store/cart";
import type { CartLine } from "./pricing";

// payOrder against a small stand-in for the API that keeps the server's rules: Orders::Pricing (open items, no tax,
// order-level discounts, rounding and tips in the total) and Payments::Processor (the tip, cash rounding on the first
// cash payment only, the overpaid checks). Local storage and the sync queue are kept in memory.
const h = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  settings: {} as Record<string, unknown>,
  online: true,
  /** The sync queue; status "sending" is a record whose push is in flight. */
  queued: [] as { type: string; id: string; payload: Record<string, unknown>; status?: string }[],
  /** patchQueued merging into a record in flight too (the queued patch P6 builds) instead of refusing it. */
  patchWhileSending: false,
  /** Records the server refused, by id (db.attention). */
  attention: new Map<string, unknown>(),
  /** The signed-in cashier's permissions. */
  permissions: ["orders.staff_meal"] as string[],
  calls: [] as string[],
  handler: null as null | ((path: string, opts: { method?: string; body?: unknown; timeoutMs?: number }) => unknown),
  tiers: [] as unknown[],
  /** What the last push or heartbeat said (sync.ts reachability): "unknown" makes payOrder probe /health first. */
  reach: "online" as "online" | "unknown",
  health: true,
  /** The timeout each save asked the API for. */
  timeouts: [] as (number | undefined)[],
  /** The till's payment methods (catalog store); empty means only the code "cash" is cash. */
  methods: [] as { code: string; kind: string }[],
  /** db.kv, and the tail of the read-write transactions on it (IndexedDB runs them one after another). */
  kv: new Map<string, unknown>(),
  tx: Promise.resolve() as Promise<unknown>,
}));

// Every IndexedDB request answers in a later task, so two saves started together interleave as they do in a browser.
const later = () => new Promise((resolve) => setTimeout(resolve, 0));
vi.mock("@/lib/db", () => ({
  db: {
    orders: { get: async (id: string) => h.rows.get(id), put: async (o: { id: string }) => void h.rows.set(o.id, o), toArray: async () => [...h.rows.values()] },
    queue: {
      get: async (id: string) => { const r = h.queued.find((q) => q.id === id); return r ? { ...r, status: r.status ?? "pending" } : undefined; },
      delete: async (id: string) => { const i = h.queued.findIndex((q) => q.id === id); if (i >= 0) h.queued.splice(i, 1); },
    },
    attention: { get: async (id: string) => h.attention.get(id) },
    kv: {
      get: async (key: string) => { await later(); return h.kv.has(key) ? { key, value: h.kv.get(key) } : undefined; },
      put: async (row: { key: string; value: unknown }) => { await later(); h.kv.set(row.key, row.value); },
    },
    transaction: (_mode: string, _table: unknown, fn: () => Promise<unknown>) => {
      const run = h.tx.then(fn);
      h.tx = run.catch(() => undefined);
      return run;
    },
  },
  kvGet: async (key: string) => { await later(); return h.kv.get(key); },
  kvSet: async (key: string, value: unknown) => { await later(); h.kv.set(key, value); },
}));
// The queue keeps one record per id, as db.queue does; patchQueued only merges into a record of the given type.
vi.mock("@/lib/sync", () => ({
  isOnline: () => h.online,
  reachabilityUnknown: () => h.reach === "unknown",
  probeHealth: async () => { h.calls.push("probe"); return h.health; },
  noteNetworkFailure: () => {},
  noteReachable: () => {},
  isQueued: async (id: string) => h.queued.some((r) => r.id === id),
  processQueue: async () => undefined,
  refreshCounts: async () => undefined,
  patchQueued: async (id: string, patch: (p: Record<string, unknown>) => Record<string, unknown>, type?: string) => {
    const r = h.queued.find((q) => q.id === id);
    if (!r || (type && r.type !== type) || (r.status === "sending" && !h.patchWhileSending)) return false;
    r.payload = patch(r.payload);
    return true;
  },
  enqueue: async (r: { type: string; id: string; payload: Record<string, unknown> }) => {
    const i = h.queued.findIndex((q) => q.id === r.id);
    if (i >= 0) h.queued.splice(i, 1);
    h.queued.push(r);
  },
}));
vi.mock("@/store/catalog", () => ({ useCatalogStore: { getState: () => ({ catalog: { business: { name: "Test Cafe", currency: "PKR", settings: h.settings }, regular_discount_tiers: h.tiers, products: [] }, paymentMethods: h.methods }) } }));
vi.mock("@/store/device", () => ({ useDeviceStore: { getState: () => ({ device: null, branch: null, session: { permissions: h.permissions }, business: null }) } }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: async (path: string, opts: { method?: string; body?: unknown } = {}) => h.handler!(path, opts) };
});

import { ApiError } from "@/lib/api";
import { applyServerDiscount, buildLocalReceipt, cartToLocal, completeOrder, findLocalOrder, loadOrderForEdit, localToCart, payOrder, payStep, refundOrder, regularPricing, reopenFields, reopenOrder, saveOrder, serverToLocal, storeServerOrder, TotalChangedError } from "./pos-actions";
import { useCustomerStore } from "@/store/customers";
import { toCachedCustomer } from "./offline-customers";
import { defaultPaymentMethod, payableTotals, roundsCash } from "./pos-rules";
import { refundOffer } from "./refunds";

type Discount = { id: string; kind: string; value: number; amount_minor: number; reason: string | null; order_item_id: string | null };
interface ServerOrder {
  id: string; status: string; items: { id: string; name: string; unit_price_minor: number; quantity: number }[]; discounts: Discount[];
  /** Money the server counts that the till cannot see (an older catalog on the till, say). */
  hidden_minor: number;
  rounding_minor: number; tip_minor: number; paid_minor: number; methods: Record<string, number>; reopened_at: string | null; reopen_count: number;
}

let server: ServerOrder;
let seq = 0;
const subtotal = (o: ServerOrder) => o.items.reduce((s, i) => s + i.unit_price_minor * i.quantity, 0);
const discount = (o: ServerOrder) => o.discounts.reduce((s, d) => s + d.amount_minor, 0);
const total = (o: ServerOrder) => subtotal(o) - discount(o) + o.hidden_minor + o.rounding_minor + o.tip_minor;

function asOrder(o: ServerOrder): Order {
  const t = total(o);
  return {
    id: o.id, serial: 7, label: "#7", till_serial: null, business_day: "2026-10-13", order_type: "takeaway", source: "till", status: o.status,
    payment_status: o.paid_minor === 0 ? "unpaid" : o.paid_minor >= t ? "paid" : "partial", table_id: null, table_code: null, guest_name: null, covers: null,
    customer_id: null, is_staff_meal: false, staff_meal_reason: null, notes: null, subtotal_minor: subtotal(o), discount_minor: discount(o), service_charge_minor: 0,
    tax_minor: 0, rounding_minor: o.rounding_minor, tip_minor: o.tip_minor, delivery_charge_minor: 0, total_minor: t, paid_minor: o.paid_minor, receipt_number: null,
    void_reason: null, taken_by_membership_id: null, client_created_at: "2026-10-13T10:00:00Z", created_at: "2026-10-13T10:00:00Z", updated_at: "2026-10-13T10:00:00Z",
    payment_method_summary: Object.entries(o.methods).map(([k, v]) => `${k}:${v}`).join(",") || null, reopened_at: o.reopened_at, reopen_count: o.reopen_count,
    service_charge_percent: 0, service_charge_fixed_minor: 0, delivery_charge_percent: 0, tax_choice: null, tax_rate_id: null, discounts: o.discounts,
    items: o.items.map((i) => ({ id: i.id, product_id: null, variant_id: null, deal_id: null, name: i.name, unit_price_minor: i.unit_price_minor, quantity: String(i.quantity), modifiers: [], open_item: true, price_overridden: false, tax_rate: 0, tax_inclusive: false, station_id: null, status: "pending", sent_at: null, notes: null })),
  } as unknown as Order;
}

/** A cash-kind method, as Payments::Processor tells cash (PaymentMethod#cash?). */
const serverCash = (code: string) => (h.methods.find((m) => m.code === code)?.kind ?? (code === "cash" ? "cash" : null)) === "cash";

/** Payments::Processor#call: all or nothing, like its transaction. */
function takePayments(o: ServerOrder, body: { payments: PaymentInput[]; tip_minor: number }): PaymentResult {
  const next: ServerOrder = JSON.parse(JSON.stringify(o));
  if (body.tip_minor > 0) next.tip_minor += body.tip_minor;
  const step = Math.trunc(Number(h.settings.cash_rounding ?? 0)) * 100;
  if (step > 0 && body.payments.some((p) => serverCash(p.method_code)) && next.paid_minor === 0) {
    const before = total(next) - next.rounding_minor;
    next.rounding_minor = Math.floor((before + step / 2) / step) * step - before;
  }
  const due = total(next) - next.paid_minor;
  let taken = 0;
  let change = 0;
  const created = body.payments.map((p) => {
    if (!(p.amount_minor > 0)) throw new ApiError("payment.amount", "Amount must be positive", 400);
    const remaining = due - taken;
    if (p.amount_minor > remaining && !serverCash(p.method_code)) throw new ApiError("payment.overpaid", "Payment exceeds the amount due", 409);
    const applied = Math.min(p.amount_minor, remaining);
    if (applied <= 0) throw new ApiError("payment.overpaid", "Order is already paid", 409);
    const tendered = serverCash(p.method_code) ? Math.max(p.tendered_minor ?? 0, p.amount_minor) : null;
    const ch = tendered === null ? 0 : Math.max(tendered - applied, 0);
    taken += applied;
    change += ch;
    next.methods[p.method_code] = (next.methods[p.method_code] ?? 0) + applied;
    return { id: p.id ?? `pay-${++seq}`, order_id: o.id, method_code: p.method_code, amount_minor: applied, tendered_minor: tendered, change_minor: ch, tip_minor: 0, reference: p.reference ?? null, card_terminal_ref: null, status: "captured", received_by_membership_id: null, shift_id: null, business_day: "2026-10-13", received_at: "2026-10-13T10:05:00Z" };
  });
  next.paid_minor += taken;
  if (next.paid_minor >= total(next)) next.status = "paid";
  Object.assign(o, next);
  return { order: asOrder(o), payments: created, change_minor: change, receipt: o.status === "paid" ? ({ order: { label: "#7" } } as unknown as Receipt) : null };
}

function fresh(lines: [string, number][], over: Partial<ServerOrder> = {}): ServerOrder {
  return { id: "o-1", status: "placed", items: lines.map(([name, price], i) => ({ id: `item-${i + 1}`, name, unit_price_minor: price, quantity: 1 })), discounts: [], hidden_minor: 0, rounding_minor: 0, tip_minor: 0, paid_minor: 0, methods: {}, reopened_at: null, reopen_count: 0, ...over };
}

/** The order as the till opens it (loadOrderForEdit). */
const opened = (): Cart => ({ ...localToCart(serverToLocal(asOrder(server))), ...reopenFields(asOrder(server)) });
const openLine = (name: string, price: number): CartLine => ({ key: `new-${name}`, name, unit_price_minor: price, quantity: 1, modifiers: [], open_item: { name, price_minor: price }, tax_rate: 0, tax_inclusive: false });
const cash = (amount: number, tendered = amount): PaymentInput => ({ method_code: "cash", amount_minor: amount, tendered_minor: tendered });
const card = (amount: number): PaymentInput => ({ method_code: "card", amount_minor: amount, reference: "4242" });
/** The amount due the payment screen shows for these methods (the same sum PaymentDialog makes). */
const screenDue = (cart: Cart, codes: string[], tip = 0) => Math.max(0, payableTotals(cart, { settings: h.settings, tip_minor: tip, cash: roundsCash(codes, h.methods) }).total_minor - (cart.paid_minor ?? 0));

beforeEach(() => {
  h.rows.clear();
  h.kv.clear();
  h.queued.length = 0;
  h.patchWhileSending = false;
  h.attention.clear();
  h.permissions = ["orders.staff_meal"];
  h.calls.length = 0;
  h.online = true;
  h.reach = "online";
  h.health = true;
  h.timeouts.length = 0;
  for (const k of Object.keys(h.settings)) delete h.settings[k];
  h.tiers = [];
  h.methods.length = 0;
  h.handler = (path, opts) => {
    const [, id, action] = /^\/orders\/([^/]+)(?:\/(\w+))?$/.exec(path) ?? [];
    if (id === server.id && opts.method === "POST" && action === "place") { h.calls.push("place"); server.status = "placed"; return asOrder(server); }
    if (id === server.id && opts.method === "POST" && action === "complete") { h.calls.push("complete"); server.status = "paid"; return asOrder(server); }
    if (id === server.id && !opts.method && action === "receipt") { h.calls.push("receipt"); return { receipt_number: "R-7", order: { label: "#7" } } as unknown as Receipt; }
    if (id === server.id && opts.method === "PATCH" && !action) {
      h.calls.push("save");
      h.timeouts.push(opts.timeoutMs);
      const lines = (opts.body as { lines: { id?: string; quantity: number; open_item?: { name: string; price_minor: number } }[] }).lines;
      server.items = lines.map((l) => ({ id: l.id ?? `item-${++seq}`, name: l.open_item!.name, unit_price_minor: l.open_item!.price_minor, quantity: l.quantity }));
      return asOrder(server);
    }
    if (id === server.id && opts.method === "POST" && action === "payments") {
      h.calls.push("pay");
      return takePayments(server, opts.body as { payments: PaymentInput[]; tip_minor: number });
    }
    throw new Error(`unexpected ${opts.method ?? "GET"} ${path}`);
  };
});

describe("payOrder with Rs 10 cash rounding", () => {
  beforeEach(() => { h.settings.cash_rounding = 10; server = fresh([["Karahi", 125600]]); });

  async function partPaid() {
    const cart = opened();
    expect(screenDue(cart, ["cash"])).toBe(126000);
    const first = await payOrder(cart, [cash(50000)], 0, undefined, { shownDue: screenDue(cart, ["cash"]) });
    expect(server).toMatchObject({ rounding_minor: 400, paid_minor: 50000, status: "placed" });
    // The panel and the next payment screen carry the rounding the server stored with the first payment.
    expect(first.cart).toMatchObject({ rounding_minor: 400, paid_minor: 50000 });
    return first.cart;
  }

  it("takes the rest by cash after a Rs 500 cash part payment", async () => {
    const cart = await partPaid();
    const due = screenDue(cart, ["cash"]);
    expect(due).toBe(76000);
    const r = await payOrder(cart, [cash(due, 80000)], 0, undefined, { shownDue: due });
    expect(r.local.status).toBe("paid");
    expect(r.change_minor).toBe(4000);
    expect(server).toMatchObject({ status: "paid", paid_minor: 126000, rounding_minor: 400 });
  });

  it("takes the rest by card after a Rs 500 cash part payment", async () => {
    const cart = await partPaid();
    const due = screenDue(cart, ["card"]);
    expect(due).toBe(76000);
    const r = await payOrder(cart, [card(due)], 0, undefined, { shownDue: due });
    expect(r.local.status).toBe("paid");
    expect(server.methods).toEqual({ cash: 50000, card: 76000 });
  });

  it("charges the rounded total in one cash payment, and the plain total by card", async () => {
    const r = await payOrder(opened(), [cash(126000)], 0, undefined, { shownDue: screenDue(opened(), ["cash"]) });
    expect(r.local).toMatchObject({ status: "paid", total_minor: 126000 });
    server = fresh([["Karahi", 125600]]);
    h.rows.clear(); // a new order under the same id: nothing stored for it yet
    const byCard = await payOrder(opened(), [card(125600)], 0, undefined, { shownDue: screenDue(opened(), ["card"]) });
    expect(byCard.local).toMatchObject({ status: "paid", total_minor: 125600, rounding_minor: 0 });
  });

  it("rounds and gives change for a second cash method (cash on delivery) as for Cash, online and offline", async () => {
    h.methods.push({ code: "cash", kind: "cash" }, { code: "cod", kind: "cash" }, { code: "card", kind: "card" });
    const cod = (amount: number, tendered = amount): PaymentInput => ({ method_code: "cod", amount_minor: amount, tendered_minor: tendered });
    const shown = screenDue(opened(), ["cod"]);
    expect(shown).toBe(126000);
    const r = await payOrder(opened(), [cod(126000, 130000)], 0, undefined, { shownDue: shown });
    expect(r.local).toMatchObject({ status: "paid", total_minor: 126000 });
    expect(r.change_minor).toBe(4000);
    expect(server).toMatchObject({ rounding_minor: 400, paid_minor: 126000 });

    // Offline the till rounds the same way and keeps the tendered amount and the change for the receipt and the replay.
    server = fresh([["Karahi", 125600]]);
    h.rows.clear();
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.online = false;
    const off = await payOrder(opened(), [cod(126000, 130000)], 0);
    expect(off.local).toMatchObject({ status: "paid", total_minor: 126000 });
    expect(off.change_minor).toBe(4000);
    expect(off.local.payments.at(-1)).toMatchObject({ method_code: "cod", tendered_minor: 130000, change_minor: 4000 });
    expect(h.queued.find((q) => q.type === "payment")?.payload).toMatchObject({ method_code: "cod", amount_minor: 126000, tendered_minor: 130000 });
  });
});

describe("payOrder on a reopened order", () => {
  it("takes the rest of a reopened order whose first payment had a tip", async () => {
    server = fresh([["Karahi", 100000]], { tip_minor: 10000, paid_minor: 110000, methods: { cash: 110000 }, reopened_at: "2026-10-13T11:00:00Z", reopen_count: 1 });
    const cart = opened();
    expect(cart).toMatchObject({ reopened: true, tip_minor: 10000, paid_minor: 110000 });
    // The cashier adds a Rs 200 naan, then Save and pay.
    const edited = { ...cart, lines: [...cart.lines, openLine("Naan", 20000)] };
    const due = screenDue(edited, ["cash"]);
    expect(due).toBe(20000);
    const r = await payOrder(edited, [cash(due)], 0, undefined, { shownDue: due });
    expect(r.local.status).toBe("paid");
    expect(server).toMatchObject({ paid_minor: 130000, tip_minor: 10000 });
  });

  it("keeps the reopen state and the original method after a part payment", async () => {
    server = fresh([["Karahi", 100000]], { paid_minor: 100000, methods: { easypaisa: 100000 }, reopened_at: "2026-10-13T11:00:00Z", reopen_count: 2 });
    const cart = { ...opened(), lines: [...opened().lines, openLine("Naan", 50000)] };
    const r = await payOrder(cart, [cash(20000)], 0, undefined, { shownDue: screenDue(cart, ["cash"]) });
    expect(r.local.status).not.toBe("paid");
    expect(r.cart).toMatchObject({ reopened: true, reopen_count: 2, paid_minor: 120000, payment_method_summary: "easypaisa:100000,cash:20000" });
    expect(defaultPaymentMethod({}, r.cart)).toBe("easypaisa");
  });
});

describe("payOrder when the server's total differs from the payment screen", () => {
  it("stops a genuine change once, charging nothing, then pays the new total", async () => {
    server = fresh([["Karahi", 125280]]);
    const cart = opened();
    // On this save the server finds a regular-customer discount the till has not seen.
    server.discounts = [{ id: "d-1", kind: "regular", value: 13.92, amount_minor: 1392, reason: null, order_item_id: null }];
    const shown = screenDue(cart, ["cash"]);
    const err = await payOrder(cart, [cash(shown)], 0, undefined, { shownDue: shown }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TotalChangedError);
    const stop = err as TotalChangedError;
    expect(stop).toMatchObject({ fromMinor: 125280, toMinor: 123888 });
    expect(h.calls).toEqual(["save"]); // nothing was charged
    // The payment screen now shows the server's figure, and the next press pays it.
    const due = screenDue(stop.cart, ["cash"]);
    expect(due).toBe(123888);
    const r = await payOrder(stop.cart, [cash(due)], 0, undefined, { shownDue: due, seenDue: stop.toMinor });
    expect(r.local.status).toBe("paid");
    expect(server.paid_minor).toBe(123888);
  });

  it("cannot stop the same payment twice: a figure the cashier was shown is paid on the next press", async () => {
    server = fresh([["Karahi", 125280]], { hidden_minor: 300 });
    const cart = opened();
    const shown = screenDue(cart, ["card"]);
    const stop = (await payOrder(cart, [card(shown)], 0, undefined, { shownDue: shown }).catch((e: unknown) => e)) as TotalChangedError;
    expect(stop).toBeInstanceOf(TotalChangedError);
    expect(stop.toMinor).toBe(125580);
    // The till still works out Rs 1,252.80; the server's Rs 1,255.80 was shown, so the press pays that.
    const again = screenDue(stop.cart, ["card"]);
    expect(again).toBe(125280);
    const r = await payOrder(stop.cart, [card(again)], 0, undefined, { shownDue: again, seenDue: stop.toMinor });
    expect(r.local.status).toBe("paid");
    expect(server.methods).toEqual({ card: 125580 });
  });
});

describe("payOrder offline", () => {
  it("prices a part payment with the order-level discount once and keeps the cart as it was", async () => {
    // Rs 1,000 with 10% off on the product, and a Rs 100 voucher on the order: Rs 800 due.
    server = fresh([["Karahi", 100000]], { discounts: [{ id: "d-1", kind: "voucher", value: 100, amount_minor: 10000, reason: null, order_item_id: null }], reopened_at: "2026-10-13T11:00:00Z", reopen_count: 1 });
    const saved: LocalOrder = { ...serverToLocal(asOrder(server)), discount_minor: 20000 }; // the server's figure counts both discounts
    saved.lines = saved.lines.map((l) => ({ ...l, discount_value: 10, discount_type: "percent" }));
    h.rows.set(saved.id, saved);
    const cart = { ...localToCart(saved), ...reopenFields(asOrder(server)) };
    expect(cart.discount_minor).toBe(10000);
    expect(screenDue(cart, ["cash"])).toBe(80000);
    h.online = false;
    const r = await payOrder(cart, [cash(30000)], 0);
    expect(r.offline).toBe(true);
    expect(r.local).toMatchObject({ total_minor: 80000, paid_minor: 30000, payment_status: "partial" });
    expect(r.cart).toMatchObject({ discount_minor: 10000, discounts: cart.discounts, reopened: true, reopen_count: 1, paid_minor: 30000 });
    expect(screenDue(r.cart, ["cash"])).toBe(50000);
    expect(h.queued.map((q) => q.type)).toEqual(["payment"]);
  });
});

describe("payOrder offline on an order the server already has", () => {
  it("stores and queues lines added since the order was opened, so the payment covers them", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.online = false;
    // A table order opened while offline; the cashier adds a Rs 200 naan and takes Rs 1,200 cash.
    const cart = { ...localToCart(serverToLocal(asOrder(server))), lines: [...opened().lines, openLine("Naan", 20000)] };
    const r = await payOrder(cart, [cash(120000)], 0);
    expect(r.local).toMatchObject({ total_minor: 120000, paid_minor: 120000, status: "paid" });
    expect(r.change_minor).toBe(0);
    expect(h.queued.map((q) => q.type)).toEqual(["order_update", "payment"]);
    expect((h.queued[0].payload.lines as unknown[]).length).toBe(2);
  });

  it("queues its payments on their own, never inside an order_update for the same order", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.queued.push({ type: "order_update", id: server.id, payload: { lines: [] } }); // sent to the kitchen while offline
    h.online = false;
    const r = await payOrder(opened(), [cash(100000)], 0);
    expect(r.local.status).toBe("paid");
    expect(h.queued.map((q) => q.type)).toEqual(["order_update", "payment"]);
    expect(h.queued[0].payload.payments).toBeUndefined(); // Sync::Push ignores payments inside an order_update
  });

  it("keeps a product discount the server's copy holds in its discount figure", async () => {
    // 10% off the product, worked out by the server: its copy has Rs 100 of discount and lines without the discount fields.
    server = fresh([["Karahi", 100000]]);
    const stored: LocalOrder = { ...serverToLocal(asOrder(server)), discount_minor: 10000, total_minor: 90000 };
    h.rows.set(server.id, stored);
    // The till's cart has the product's discount on the line again (attachDiscounts), so the screen shows Rs 900.
    const cart = { ...localToCart(stored), lines: localToCart(stored).lines.map((l) => ({ ...l, discount_value: 10, discount_type: "percent" as const })) };
    expect(screenDue(cart, ["cash"])).toBe(90000);
    h.online = false;
    const r = await payOrder(cart, [cash(90000)], 0);
    expect(r.local).toMatchObject({ total_minor: 90000, paid_minor: 90000, status: "paid" });
  });
});

describe("payOrder before the internet is known to answer", () => {
  // Review item 15: Wi-Fi up, internet down, navigator.onLine true: Pay waited on a 60 s push and then a 20 s save.
  it("probes /health once when nothing recent says the server answers, and goes offline at once when it does not", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.reach = "unknown";
    h.health = false;
    const r = await payOrder(opened(), [cash(100000)], 0);
    expect(h.calls).toEqual(["probe"]);
    expect(r.offline).toBe(true);
    expect(r.local.status).toBe("paid");
    expect(h.queued.map((q) => q.type)).toEqual(["payment"]);
  });

  it("carries on online when the probe answers, and gives the pre-payment save 8 s rather than the usual 20", async () => {
    server = fresh([["Karahi", 100000]]);
    h.reach = "unknown";
    const cart = { ...opened(), lines: [...opened().lines, openLine("Naan", 20000)] };
    const r = await payOrder(cart, [cash(120000)], 0, undefined, { shownDue: screenDue(cart, ["cash"]) });
    expect(h.calls).toEqual(["probe", "save", "pay"]);
    expect(h.timeouts).toEqual([8000]);
    expect(r.offline).toBe(false);
  });
});

describe("payOrder saves only what the server lacks", () => {
  it("skips the save when the cart matches the stored order, a dispatched delivery included", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    const r = await payOrder(opened(), [cash(100000)], 0, undefined, { shownDue: 100000 });
    expect(h.calls).toEqual(["pay"]);
    expect(r.local.status).toBe("paid");
    server = fresh([["Karahi", 100000]], { status: "dispatched" });
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    const d = await payOrder(opened(), [cash(100000)], 0, undefined, { shownDue: 100000 });
    expect(h.calls).toEqual(["pay", "pay"]);
    expect(d.local.status).toBe("paid");
  });

  // orders-money#1: dispatched deliveries are editable since WP-B, but Pay never saved one, so the account picked on the
  // payment screen was ignored and the original customer's khata charged.
  it("saves a dispatched delivery whose customer was changed on the payment screen", async () => {
    server = fresh([["Karahi", 100000]], { status: "dispatched" });
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    const bodies: Record<string, unknown>[] = [];
    const serve = h.handler!;
    h.handler = (path, opts) => { if (opts.method === "PATCH") bodies.push(opts.body as Record<string, unknown>); return serve(path, opts); };
    await payOrder({ ...opened(), customer: { id: "cust-Y", name: "Office account", phone: null } }, [cash(100000)], 0, undefined, { shownDue: 100000 });
    expect(h.calls).toEqual(["save", "pay"]);
    expect(bodies[0]).toMatchObject({ customer_id: "cust-Y" });
  });

  // orders-money#0, web-till#1: the stored copy matched the cart because the till wrote it with the offline edit, so Pay
  // skipped the save and the server took the payment against its old total, handing back the Naan as change.
  it("saves first while an offline edit of the order is still queued, then drops that overtaken update", async () => {
    server = fresh([["Karahi", 100000]]);
    const tills: LocalOrder = { ...serverToLocal(asOrder(server)), lines: [...serverToLocal(asOrder(server)).lines, openLine("Naan", 30000)], total_minor: 130000 };
    h.rows.set(server.id, tills);
    h.queued.push({ type: "order_update", id: server.id, payload: { lines: [] } });
    const cart = localToCart(tills);
    expect(screenDue(cart, ["cash"])).toBe(130000);
    const r = await payOrder(cart, [cash(130000, 150000)], 0, undefined, { shownDue: 130000 });
    expect(h.calls).toEqual(["save", "pay"]);
    expect(server.items.map((i) => i.name)).toEqual(["Karahi", "Naan"]);
    expect(server.paid_minor).toBe(130000);
    expect(r.change_minor).toBe(20000);
    expect(h.queued).toEqual([]); // replayed on the paid order it would be refused and flag it Rejected
  });

  it("saves first while an offline edit of the order waits in Attention", async () => {
    server = fresh([["Karahi", 100000]]);
    const tills: LocalOrder = { ...serverToLocal(asOrder(server)), lines: [...serverToLocal(asOrder(server)).lines, openLine("Naan", 30000)] };
    h.rows.set(server.id, tills);
    h.attention.set(server.id, { id: server.id, type: "order_update", code: "approval.required" });
    await payOrder(localToCart(tills), [cash(130000)], 0, undefined, { shownDue: 130000 });
    expect(h.calls).toEqual(["save", "pay"]);
    expect(server.paid_minor).toBe(130000);
  });

  it("keeps a queued update that carries a completion, or one being pushed right now", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.queued.push({ type: "order_update", id: server.id, payload: { lines: [], complete: true } });
    await saveOrder({ ...opened(), notes: "no onions" });
    expect(h.queued).toHaveLength(1);
    h.queued[0] = { type: "order_update", id: server.id, payload: { lines: [] }, status: "sending" };
    await saveOrder({ ...opened(), notes: "extra raita" });
    expect(h.queued).toHaveLength(1);
  });

  it("opens an order with a queued offline edit from the till's copy, not the server's", async () => {
    server = fresh([["Karahi", 100000]]);
    const tills: LocalOrder = { ...serverToLocal(asOrder(server)), lines: [...serverToLocal(asOrder(server)).lines, openLine("Naan", 30000)] };
    h.rows.set(server.id, tills);
    h.queued.push({ type: "order_update", id: server.id, payload: { lines: [] } });
    const cart = await loadOrderForEdit(server.id); // a GET would throw here: the stand-in server has no such route
    expect(cart.lines.map((l) => l.name)).toEqual(["Karahi", "Naan"]);
  });

  // Leftovers of 7 Nov 2026 (L3): the till's copy carried no reopen state, so a reopened order edited offline opened
  // again as an ordinary one: lines removable without DELETE_ORDER_ITEM, Place unpaid offered, no Save and pay.
  it("opens a reopened order with a queued offline edit still reopened, on its original method", async () => {
    server = fresh([["Karahi", 100000]], { status: "served", paid_minor: 100000, methods: { easypaisa: 100000 }, reopened_at: "2026-10-13T11:00:00Z", reopen_count: 2 });
    await storeServerOrder(asOrder(server)); // as reopenOrder stores it
    const reopened = opened();
    h.online = false;
    const saved = await saveOrder({ ...reopened, lines: [...reopened.lines, openLine("Naan", 30000)] });
    expect(saved.offline).toBe(true);
    expect(h.queued.map((q) => q.type)).toEqual(["order_update"]);
    h.online = true;
    const cart = await loadOrderForEdit(server.id); // from the till's copy: a GET would throw here
    expect(cart.lines.map((l) => l.name)).toEqual(["Karahi", "Naan"]);
    expect(cart).toMatchObject({ reopened: true, reopen_count: 2, paid_minor: 100000, payment_method_summary: "easypaisa:100000" });
    // Completed since, the same copy opens as a plain order: reopened means open again after a completion.
    h.rows.set(server.id, { ...(h.rows.get(server.id) as LocalOrder), status: "closed", open: 0 });
    expect(localToCart(h.rows.get(server.id) as LocalOrder).reopened).toBe(false);
  });

  // Leftovers of 7 Nov 2026 (L3, item 6): the copy an offline edit stored was a fresh order's: Unpaid, no receipt
  // number, today's day, the cashier signed in now. The Orders card read Unpaid for a paid order, a reprint offline
  // had no receipt number or barcode, and a reopened order whose total went up was offered a refund of all it was
  // paid (refundOffer reads an open order without a receipt number as one never completed), which the server refuses.
  describe("the till's copy after an offline edit", () => {
    const reopenedPaid = () => {
      server = fresh([["Karahi", 100000]], { status: "served", paid_minor: 100000, methods: { cash: 100000 }, reopened_at: "2026-10-13T11:00:00Z", reopen_count: 1 });
      return { ...asOrder(server), receipt_number: "261013-MAIN-7", taken_by_membership_id: "m-taker" } as Order;
    };

    it("keeps a paid order paid, with its receipt, day and taker, when the edit leaves what is due as it was", async () => {
      await storeServerOrder(reopenedPaid());
      h.online = false;
      const { local } = await saveOrder({ ...opened(), notes: "no onions" });
      expect(local).toMatchObject({ payment_status: "paid", paid_minor: 100000, total_minor: 100000, receipt_number: "261013-MAIN-7", business_day: "2026-10-13", membership_id: "m-taker", reopened_at: "2026-10-13T11:00:00Z" });
      expect(h.rows.get(server.id)).toMatchObject({ payment_status: "paid", receipt_number: "261013-MAIN-7", notes: "no onions" });
      expect(refundOffer(local)).toBeNull();
      expect(buildLocalReceipt(local, true).receipt_number).toBe("261013-MAIN-7");
    });

    it("follows an edit that changes what is due: part-paid above what was paid, as the server answers it", async () => {
      await storeServerOrder(reopenedPaid());
      h.online = false;
      const cart = opened();
      const { local, cart: next } = await saveOrder({ ...cart, lines: [...cart.lines, openLine("Naan", 30000)] });
      expect(local).toMatchObject({ payment_status: "partial", paid_minor: 100000, total_minor: 130000, receipt_number: "261013-MAIN-7", business_day: "2026-10-13" });
      expect(refundOffer(local)).toBeNull(); // nothing paid above the total: no refund while it is open
      expect(screenDue(next, ["cash"])).toBe(30000);
      // A part-paid order stays part-paid through an edit that leaves its total.
      server = fresh([["Karahi", 100000]], { status: "served", paid_minor: 40000, methods: { cash: 40000 } });
      await storeServerOrder(asOrder(server));
      const again = await saveOrder({ ...opened(), notes: "less salt" });
      expect(again.local).toMatchObject({ payment_status: "partial", paid_minor: 40000, total_minor: 100000 });
    });
  });

  it("still saves a changed note, and names the save as the step that failed", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    await payOrder({ ...opened(), notes: "no onions" }, [cash(100000)], 0, undefined, { shownDue: 100000 });
    expect(h.calls).toEqual(["save", "pay"]);
    const serve = h.handler!;
    h.handler = (path, opts) => { if (opts.method === "PATCH") throw new ApiError("day.locked", "The day is closed", 409); return serve(path, opts); };
    server = fresh([["Karahi", 100000]]);
    const e = await payOrder({ ...opened(), notes: "no onions" }, [cash(100000)], 0).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(payStep(e)).toBe("save");
    expect(payStep(new Error("x"))).toBe("payment");
  });
});

describe("saveOrder on a queued order whose push is in flight (web-till#3)", () => {
  // patchQueued refuses a record being pushed; saveOrder ignored that, so the Naan added at Pay never reached the
  // server, and the Rs 1,500 cash met a Rs 1,000 order: Rs 500 handed back as change.
  const queuedOrder = () => {
    server = fresh([["Karahi", 100000]]);
    const local: LocalOrder = { ...serverToLocal(asOrder(server)), local_only: true, till_serial: "T1-001", label: "T1-001" };
    h.rows.set(server.id, local);
    h.queued.push({ type: "order", id: server.id, payload: { lines: [], status: "placed", till_serial: "T1-001" }, status: "sending" });
    return { ...localToCart(local), lines: [...localToCart(local).lines, openLine("Naan", 50000)] };
  };
  const pushEnds = (accepted: boolean, ms = 50) => setTimeout(() => {
    if (accepted) {
      h.queued.splice(h.queued.findIndex((q) => q.id === server.id), 1);
      h.rows.set(server.id, { ...(h.rows.get(server.id) as LocalOrder), local_only: false }); // markSynced
    } else h.queued.find((q) => q.id === server.id)!.status = "pending";
  }, ms);

  it("waits for the push, then updates the order the server now has, with the lines the cart added", async () => {
    const cart = queuedOrder();
    pushEnds(true);
    const r = await saveOrder(cart, { place: true });
    expect(h.calls).toEqual(["save"]); // a PATCH: POST /orders would answer the order unchanged
    expect(server.items.map((i) => i.name)).toEqual(["Karahi", "Naan"]);
    expect(r).toMatchObject({ offline: false, cart: { local_only: false } });
  });

  it("puts the lines on the record when the push failed and the record waits again", async () => {
    const cart = queuedOrder();
    pushEnds(false);
    const r = await saveOrder(cart);
    expect(r.offline).toBe(true);
    expect((h.queued[0].payload.lines as { open_item?: { name: string } }[]).map((l) => l.open_item?.name)).toEqual(["Karahi", "Naan"]);
  });

  it("takes a patch the queue holds for a record in flight at once", async () => {
    const cart = queuedOrder();
    h.patchWhileSending = true;
    const r = await saveOrder(cart);
    expect(r.offline).toBe(true);
    expect((h.queued[0].payload.lines as unknown[]).length).toBe(2);
  });

  it("says so, and keeps nothing as saved, when the push is still out after the wait", async () => {
    vi.useFakeTimers();
    try {
      const cart = queuedOrder();
      const out = saveOrder(cart).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(9000);
      expect(await out).toMatchObject({ code: "sync.sending" });
      expect(h.queued[0].payload.lines).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it("updates rather than creates a queued order whose push was accepted before the save began", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, { ...serverToLocal(asOrder(server)), till_serial: "T1-001" }); // accepted: local_only false
    const cart: Cart = { ...localToCart(serverToLocal(asOrder(server))), local_only: true, lines: [...opened().lines, openLine("Naan", 50000)] };
    await saveOrder(cart);
    expect(h.calls).toEqual(["save"]);
    expect(server.items.map((i) => i.name)).toEqual(["Karahi", "Naan"]);
  });
});

describe("an offline staff meal by a cashier without orders.staff_meal (QA K8)", () => {
  // It asked for no PIN, printed Paid and was refused at sync as approval.required.
  const draft = (): Cart => ({
    id: "sm-2", saved: false, local_only: false, status: "draft", order_type: "dine_in", lines: [openLine("Chai", 10000)], customer: null, table_id: null, table_code: null,
    guest_name: "", covers: null, notes: "", is_staff_meal: true, staff_meal_reason: "Rider", label: null, client_created_at: "2026-11-06T10:00:00Z",
  });

  it("is refused on the till: nothing queued, nothing marked paid", async () => {
    h.permissions = ["orders.create", "payments.take"];
    h.online = false;
    const e = await payOrder(draft(), [], 0).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "staff_meal.offline" });
    expect(payStep(e)).toBe("complete");
    expect(h.queued).toEqual([]);
    expect(h.rows.get("sm-2")).toBeUndefined();
    await expect(saveOrder(draft(), { place: true })).rejects.toMatchObject({ code: "staff_meal.offline" });
  });

  it("lets a line be added to a queued staff meal a manager marked: the sync checks the record's creator", async () => {
    h.permissions = ["orders.create", "payments.take"];
    h.online = false;
    h.rows.set("sm-2", { ...cartToLocal(draft(), "placed"), till_serial: "T1-009", label: "T1-009" });
    h.queued.push({ type: "order", id: "sm-2", payload: { is_staff_meal: true, lines: [] } });
    const r = await saveOrder({ ...draft(), saved: true, local_only: true, lines: [...draft().lines, openLine("Naan", 5000)] });
    expect(r.offline).toBe(true);
    expect((h.queued[0].payload.lines as unknown[]).length).toBe(2);
  });

  it("still closes offline an order the server already holds as a staff meal (a manager approved it online)", async () => {
    h.permissions = ["orders.create", "payments.take"];
    server = fresh([["Chai", 10000]]);
    h.rows.set(server.id, { ...serverToLocal(asOrder(server)), is_staff_meal: true, staff_meal_reason: "Rider" });
    h.online = false;
    const r = await payOrder({ ...opened(), is_staff_meal: true, staff_meal_reason: "Rider" }, [], 0);
    expect(r.local.status).toBe("paid");
    expect(h.queued[0]).toMatchObject({ type: "order_update", payload: { complete: true } });
  });
});

describe("payOrder on a staff meal", () => {
  // Review item 5: Pay on a staff meal posted { payments: [] }, which the server refuses; the first client hit it on 30 Oct.
  const draft = (): Cart => ({
    id: "sm-1", saved: false, local_only: false, status: "draft", order_type: "dine_in", lines: [openLine("Chai", 10000)], customer: null, table_id: null, table_code: null,
    guest_name: "", covers: null, notes: "", is_staff_meal: true, staff_meal_reason: "Ali, lunch", label: null, client_created_at: "2026-11-06T10:00:00Z",
  });

  it("online: saves the order placed, completes it instead of paying, and takes the server's receipt", async () => {
    server = fresh([["Chai", 10000]], { status: "draft" });
    const r = await payOrder({ ...opened(), is_staff_meal: true, staff_meal_reason: "Ali, lunch" }, [], 0, undefined, { shownDue: 0 });
    expect(h.calls).toEqual(["save", "place", "complete", "receipt"]);
    expect(r).toMatchObject({ offline: false, change_minor: 0 });
    expect(r.local.status).toBe("paid");
    expect(r.receipt).toMatchObject({ receipt_number: "R-7" });
  });

  it("offline: marks the local copy paid and queues the order with complete: true", async () => {
    h.online = false;
    const r = await payOrder(draft(), [], 0);
    expect(r.offline).toBe(true);
    expect(r.local).toMatchObject({ status: "paid", payment_status: "paid", total_minor: 0, paid_minor: 0, is_staff_meal: true });
    expect(h.queued.map((q) => q.type)).toEqual(["order"]);
    expect(h.queued[0].payload).toMatchObject({ complete: true, status: "placed", is_staff_meal: true });
  });

  it("offline on an order the server already has: the queued update carries complete: true", async () => {
    server = fresh([["Chai", 10000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.online = false;
    const r = await payOrder({ ...opened(), is_staff_meal: true, staff_meal_reason: "Ali" }, [], 0);
    expect(r.local.status).toBe("paid");
    expect(h.queued.map((q) => q.type)).toEqual(["order_update"]);
    expect(h.queued[0].payload).toMatchObject({ complete: true, is_staff_meal: true });
  });
});

describe("payOrder on a reopened order with nothing left to pay (QA T5)", () => {
  // Reopened, a line taken off: the total fell to what was paid and Pay sat disabled at Rs 0, the order stuck open.
  const reopenedPaid = (over: Partial<ServerOrder> = {}) => fresh([["Karahi", 80000]], { status: "served", paid_minor: 80000, methods: { cash: 80000 }, reopened_at: "2026-10-13T11:00:00Z", reopen_count: 1, ...over });

  it("saves it and completes it instead of posting an empty payment list, and takes the server's receipt", async () => {
    server = reopenedPaid();
    const cart = opened();
    expect(screenDue(cart, ["cash"])).toBe(0);
    const r = await payOrder(cart, [], 0, undefined, { shownDue: 0 });
    expect(h.calls).toEqual(["save", "complete", "receipt"]);
    expect(r).toMatchObject({ offline: false, change_minor: 0 });
    expect(r.local.status).toBe("paid");
    expect(r.receipt).toMatchObject({ receipt_number: "R-7" });
  });

  it("shows the server's figure instead of completing when the server still has money due", async () => {
    server = reopenedPaid({ hidden_minor: 5000 });
    const err = await payOrder(opened(), [], 0, undefined, { shownDue: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TotalChangedError);
    expect(err).toMatchObject({ fromMinor: 0, toMinor: 5000 });
    expect(h.calls).toEqual(["save"]);
  });

  it("names completion as the failed step when the server wants the excess refunded first", async () => {
    server = reopenedPaid({ paid_minor: 100000, methods: { cash: 100000 } });
    const serve = h.handler!;
    h.handler = (path, opts) => {
      if (path.endsWith("/complete")) throw new ApiError("order.overpaid", "#7 was paid Rs 1,000 against a total of Rs 800. Refund Rs 200 before completing it.", 409);
      return serve(path, opts);
    };
    const e = await payOrder(opened(), [], 0, undefined, { shownDue: 0 }).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "order.overpaid" });
    expect(payStep(e)).toBe("complete");
    expect(server.paid_minor).toBe(100000);
  });

  it("needs the internet: nothing is queued, since the sync queue completes only staff meals", async () => {
    server = reopenedPaid();
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.online = false;
    const e = await payOrder(opened(), [], 0).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "offline" });
    expect(payStep(e)).toBe("complete");
    expect(h.queued).toEqual([]);
  });
});

describe("the Orders screen's actions", () => {
  const bodies: Record<string, unknown>[] = [];
  beforeEach(() => {
    bodies.length = 0;
    server = fresh([["Karahi", 100000]], { status: "paid", paid_minor: 100000, methods: { cash: 100000 } });
    const serve = h.handler!;
    h.handler = (path, opts) => {
      if (path.endsWith("/refunds")) { bodies.push(opts.body as Record<string, unknown>); return { order: asOrder(server) }; }
      if (path.endsWith("/reopen")) { bodies.push((opts.body ?? {}) as Record<string, unknown>); server.status = "served"; server.reopened_at = "2026-10-13T11:00:00Z"; return asOrder(server); }
      return serve(path, opts);
    };
  });

  it("refunds with the id the dialog made, every try (web-till#5)", async () => {
    await refundOrder("o-1", 50000, "cash", "Cold", undefined, "refund-1");
    await refundOrder("o-1", 50000, "cash", "Cold", undefined, "refund-1");
    expect(bodies.map((b) => b.refund_id)).toEqual(["refund-1", "refund-1"]);
  });

  it("sends a manager's PIN with a reopen (QA T11)", async () => {
    await reopenOrder("o-1", "4321");
    expect(bodies[0]).toEqual({ approver_pin: "4321" });
  });

  it("completes an open order paid in full and takes the server's receipt (QA T5)", async () => {
    server.status = "served";
    const r = await completeOrder("o-1");
    expect(h.calls).toEqual(["complete", "receipt"]);
    expect(r.local.status).toBe("paid");
    expect(r.receipt).toMatchObject({ receipt_number: "R-7" });
  });

  it("finds the till's copy by the till serial an offline receipt carries, from any day (QA T12)", async () => {
    h.rows.set("a", { ...serverToLocal(asOrder(server)), id: "a", label: "#12", till_serial: "T1-007", business_day: "2026-11-01", created_at: "2026-11-01T10:00:00Z" });
    h.rows.set("b", { ...serverToLocal(asOrder(server)), id: "b", label: "#13", till_serial: "T1-0070", created_at: "2026-11-02T10:00:00Z" });
    expect((await findLocalOrder(" t1-007 "))?.id).toBe("a");
    expect(await findLocalOrder("T1-008")).toBeNull();
  });
});

describe("applyServerDiscount (QA T10)", () => {
  // A discount above the cashier's limit needs the manager's PIN on the discount request itself, and a line discount
  // needs the line's server id, which a line added since the last save gets only from this save.
  it("hands the call the cart as saved and the manager's PIN", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    const fn = vi.fn(async () => asOrder(server));
    await applyServerDiscount({ ...opened(), lines: [...opened().lines, openLine("Naan", 5000)] }, fn, { approver_pin: "4321" });
    expect(h.calls).toEqual(["save"]);
    const [id, ctx] = fn.mock.calls[0] as unknown as [string, { saved: Cart; approver_pin?: string }];
    expect(id).toBe("o-1");
    expect(ctx.approver_pin).toBe("4321");
    expect(ctx.saved.lines.map((l) => [l.name, !!l.id])).toEqual([["Karahi", true], ["Naan", true]]);
  });
});

describe("payOrder with a manager's PIN (roles QA, 6 Nov 2026)", () => {
  it("sends the PIN with the payment it approves, not only with the save before it", async () => {
    server = fresh([["Karahi", 100000]]);
    const bodies: Record<string, unknown>[] = [];
    const serve = h.handler!;
    h.handler = (path, opts) => { if (path.endsWith("/payments")) bodies.push(opts.body as Record<string, unknown>); return serve(path, opts); };
    await payOrder({ ...opened(), notes: "no onions" }, [cash(100000)], 0, "4321", { shownDue: 100000 });
    expect(bodies[0]).toMatchObject({ approver_pin: "4321" });
    await payOrder(opened(), [cash(100000)], 0, undefined, { shownDue: 100000 }).catch(() => undefined);
    expect(bodies[1] ?? {}).not.toHaveProperty("approver_pin");
  });
});

describe("payOrder offline with a tip over two payments", () => {
  // Review item 14: each queued payment carried the whole tip and Payments::Processor added it per record (Rs 50 became Rs 100).
  it("puts the tip on the first queued payment only", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    h.online = false;
    const r = await payOrder(opened(), [cash(65000), card(40000)], 5000);
    expect(r.local).toMatchObject({ status: "paid", tip_minor: 5000, total_minor: 105000, paid_minor: 105000 });
    expect(h.queued.filter((q) => q.type === "payment").map((q) => q.payload.tip_minor)).toEqual([5000, 0]);
  });
});

describe("payOrder when the server takes a payment but answers too late", () => {
  it("queues the payment under the id the server already has, so it is not recorded twice", async () => {
    server = fresh([["Karahi", 100000]]);
    const serve = h.handler!;
    const sentIds: string[] = [];
    h.handler = (path, opts) => {
      const out = serve(path, opts);
      if (path.endsWith("/payments")) {
        sentIds.push(...(opts.body as { payments: { id: string }[] }).payments.map((p) => p.id));
        throw new ApiError("network", "Request timed out", 0);
      }
      return out;
    };
    const cart = opened();
    const r = await payOrder(cart, [cash(40000)], 0, undefined, { shownDue: screenDue(cart, ["cash"]) });
    expect(r.offline).toBe(true);
    expect(server.paid_minor).toBe(40000);
    expect(sentIds).toHaveLength(1);
    expect(h.queued.filter((q) => q.type === "payment").map((q) => q.id)).toEqual(sentIds);
  });
});

describe("an offline khata sale for a regular customer", () => {
  // 18 Oct 2026: offline, the till charged Rs 4,114 to Sadia's khata; the server took her 10% regular discount off and
  // asked for Rs 3,703, refused the payment as overpaid and left the order unpaid. The till now takes it off itself.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const line = (key: string, price: number): CartLine => ({ key, product_id: key, name: key, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: 16, tax_inclusive: false });
  const cart = (): Cart => ({
    id: "khata-1", saved: false, local_only: false, status: "draft", order_type: "dine_in", lines: [line("half", 120_000), line("full", 220_000)],
    customer: { id: "sadia", name: "Sadia Akhtar", phone: "+923001807130", balance_minor: 194_500, credit_limit_minor: null }, table_id: null, table_code: null,
    guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: new Date().toISOString(),
  });

  it("queues the khata payment at the server's figure and adds it to her saved balance", async () => {
    h.online = false;
    Object.assign(h.settings, { "charges.service_charge.value": 5, service_charge_order_types: ["dine_in"], total_rounding_minor: 100 });
    h.tiers = [{ id: "t3", name: "Back within 3 days", within_days: 3, kind: "percent", value: 10, min_order_minor: 0, excluded_product_ids: [], excluded_category_ids: [], excluded_order_types: [], active: true, archived_at: null }];
    const saved = toCachedCustomer({ id: "sadia", name: "Sadia Akhtar", phone: "+923001807130", khata_no: "32", status: "active", is_walk_in: false, balance_minor: 194_500, credit_limit_minor: null, orders_count: 4, last_order_at: yesterday } as never);
    useCustomerStore.setState({ list: [saved], byId: new Map([["sadia", saved]]), loaded: true });

    const shown = regularPricing(cart()); // what the payment screen shows (the customer came from the saved list)
    const due = payableTotals(shown, { settings: h.settings, cash: false }).total_minor;
    expect(due).toBe(370_300);
    const r = await payOrder(cart(), [{ method_code: "khata", amount_minor: due }]);
    expect(r.offline).toBe(true);
    expect(r.local).toMatchObject({ total_minor: 370_300, paid_minor: 370_300, status: "paid", discount_minor: 34_000 });
    const order = h.queued.find((q) => q.type === "order")!;
    expect(order.payload).toMatchObject({ customer_id: "sadia", payments: [expect.objectContaining({ method_code: "khata", amount_minor: 370_300 })] });
    expect(useCustomerStore.getState().byId.get("sadia")).toMatchObject({ balance_minor: 194_500 + 370_300, orders_count: 5 });
  });

  // QA K11: the offline account receipt had no "Account balance" line; the online one does.
  it("prints what she owes now on the receipt, from her saved balance", async () => {
    h.online = false;
    const saved = toCachedCustomer({ id: "sadia", name: "Sadia Akhtar", phone: "+923001807130", khata_no: "32", status: "active", is_walk_in: false, balance_minor: 194_500, credit_limit_minor: null, orders_count: 4, last_order_at: null } as never);
    useCustomerStore.setState({ list: [saved], byId: new Map([["sadia", saved]]), loaded: true });
    const due = payableTotals(cart(), { settings: h.settings, cash: false }).total_minor;
    const r = await payOrder(cart(), [{ method_code: "khata", amount_minor: due }]);
    expect(r.receipt.khata).toEqual({ balance_minor: 194_500 + due });
    // A cash sale for the same customer prints no account line.
    const byCash = await payOrder({ ...cart(), id: "khata-2" }, [{ method_code: "cash", amount_minor: due, tendered_minor: due }]);
    expect(byCash.receipt.khata).toBeNull();
  });

  // Leftovers of 7 Nov 2026 (L3, item 9): the server keeps a regular discount a manager took off off the order
  // (regular_discount_removed_at), the till's copy did not know it, and offline the till priced the order 10% under.
  it("keeps a regular discount a manager took off off the order offline, through an edit", async () => {
    h.tiers = [{ id: "t3", name: "Back within 3 days", within_days: 3, kind: "percent", value: 10, min_order_minor: 0, excluded_product_ids: [], excluded_category_ids: [], excluded_order_types: [], active: true, archived_at: null }];
    const saved = toCachedCustomer({ id: "sadia", name: "Sadia Akhtar", phone: "+923001807130", khata_no: "32", status: "active", is_walk_in: false, balance_minor: 0, credit_limit_minor: null, orders_count: 4, last_order_at: yesterday } as never);
    useCustomerStore.setState({ list: [saved], byId: new Map([["sadia", saved]]), loaded: true });
    server = fresh([["Karahi", 100000]], { status: "served" });
    await storeServerOrder({ ...asOrder(server), customer_id: "sadia", customer_name: "Sadia Akhtar", regular_discount_removed_at: "2026-10-13T10:30:00Z" } as Order);
    h.online = false;
    const open = localToCart(h.rows.get(server.id) as LocalOrder);
    expect(open.regular_discount_removed_at).toBe("2026-10-13T10:30:00Z");
    expect(payableTotals(regularPricing(open), { settings: h.settings, cash: false }).total_minor).toBe(100000); // the server's price
    const { local } = await saveOrder({ ...open, lines: [...open.lines, openLine("Naan", 30000)] });
    expect(local).toMatchObject({ total_minor: 130000, discount_minor: 0, regular_discount_removed_at: "2026-10-13T10:30:00Z" });
    expect(localToCart(h.rows.get(server.id) as LocalOrder).regular_discount_removed_at).toBe("2026-10-13T10:30:00Z");
  });

  it("leaves the discount to the server while online", () => {
    h.tiers = [{ id: "t3", name: "Back within 3 days", within_days: 3, kind: "percent", value: 10, min_order_minor: 0, excluded_product_ids: [], excluded_category_ids: [], excluded_order_types: [], active: true, archived_at: null }];
    expect(regularPricing({ ...cart(), customer: { ...cart().customer!, last_order_at: yesterday } }).discounts ?? []).toEqual([]);
  });
});

describe("saveOrder carries the staff-meal flag on an order the server already has (first client report, 30 Oct 2026)", () => {
  beforeEach(() => { server = fresh([["Karahi", 125600]]); });
  it("sends it on PATCH both ways, as a boolean, and takes the server's answer into the cart", async () => {
    const bodies: Record<string, unknown>[] = [];
    const base = h.handler!;
    h.handler = (path, opts) => {
      const o = base(path, opts) as Order;
      if (opts.method !== "PATCH") return o;
      const b = opts.body as Record<string, unknown>;
      bodies.push(b);
      // Orders::Pricing: a staff meal totals zero and keeps its reason; charged normally it goes back to the full total.
      return { ...o, is_staff_meal: !!b.is_staff_meal, staff_meal_reason: (b.staff_meal_reason as string | null) ?? null, total_minor: b.is_staff_meal ? 0 : o.total_minor };
    };
    const on = await saveOrder({ ...opened(), is_staff_meal: true, staff_meal_reason: "Chef lunch" });
    expect(bodies.at(-1)).toMatchObject({ is_staff_meal: true, staff_meal_reason: "Chef lunch" });
    expect(on.offline).toBe(false);
    expect(on.cart.is_staff_meal).toBe(true);
    expect(on.cart.staff_meal_reason).toBe("Chef lunch");
    const off = await saveOrder({ ...on.cart, is_staff_meal: false, staff_meal_reason: "" });
    expect(bodies.at(-1)).toMatchObject({ is_staff_meal: false, staff_meal_reason: null });
    expect(off.cart.is_staff_meal).toBe(false);
    expect(off.cart.staff_meal_reason).toBe("");
  });
  it("queues it with the offline update", async () => {
    h.online = false;
    const r = await saveOrder({ ...opened(), is_staff_meal: true, staff_meal_reason: "Rider meal" });
    expect(r.offline).toBe(true);
    expect(r.cart.is_staff_meal).toBe(true);
    expect(h.queued.at(-1)).toMatchObject({ type: "order_update", id: "o-1", payload: { is_staff_meal: true, staff_meal_reason: "Rider meal" } });
  });
});

describe("a summary row from GET /orders (review R2)", () => {
  it("updates the status and money but keeps the lines, discounts and charges the till already holds", async () => {
    server = fresh([["Karahi", 100000]], { discounts: [{ id: "d-1", kind: "voucher", value: 100, amount_minor: 10000, reason: null, order_item_id: null }] });
    const cached: LocalOrder = { ...serverToLocal(asOrder(server)), service_charge_percent: 0, tax_choice: "none" };
    h.rows.set(server.id, cached);
    // What OrderSerializers.summary leaves out of the full order.
    const row: Record<string, unknown> = { ...asOrder(server), status: "paid", paid_minor: 90000 };
    for (const k of ["items", "discounts", "service_charge_percent", "service_charge_fixed_minor", "delivery_charge_percent", "tax_choice", "tax_rate_id", "staff_meal_reason"]) delete row[k];
    const stored = await storeServerOrder(row as unknown as Order);
    expect(stored).toMatchObject({ status: "paid", paid_minor: 90000, service_charge_percent: 0, tax_choice: "none" });
    expect(stored.lines.map((l) => l.name)).toEqual(["Karahi"]);
    expect(stored.order_discounts).toEqual(cached.order_discounts);
    expect(h.rows.get(server.id)).toMatchObject({ lines: cached.lines, status: "paid" });
  });

  it("keeps the server's item count, so the Orders card can say how many items an order has", async () => {
    server = fresh([["Karahi", 100000], ["Naan", 2500]]);
    const row: Record<string, unknown> = { ...asOrder(server), item_count: 2 };
    delete row.items;
    expect((await storeServerOrder(row as unknown as Order)).item_count).toBe(2);
    delete row.item_count;
    expect((await storeServerOrder(row as unknown as Order)).item_count).toBe(2); // an older server: the last count stays
    expect(serverToLocal(asOrder(server)).item_count).toBe(2); // a whole order counts its live lines
  });

  it("takes the server's lines from a whole order", async () => {
    server = fresh([["Karahi", 100000]]);
    h.rows.set(server.id, serverToLocal(asOrder(server)));
    server.items.push({ id: "item-2", name: "Naan", unit_price_minor: 2500, quantity: 2 });
    expect((await storeServerOrder(asOrder(server))).lines.map((l) => l.name)).toEqual(["Karahi", "Naan"]);
  });
});

// T3/F3: a delivery's address stays on the order through saves and reloads, and goes when the server drops it.
describe("a delivery's address on the till's copy", () => {
  it("takes the server's address, keeps the zone the till quoted for it, and puts both on the cart", () => {
    server = fresh([["Karahi", 100000]]);
    const prev: LocalOrder = { ...serverToLocal(asOrder(server)), address_id: "a1", address_text: "House 12, Phase 5 DHA", zone_name: "DHA" };
    const local = serverToLocal({ ...asOrder(server), address_id: "a1", address_text: "House 12, Phase 5 DHA, Lahore" } as Order, prev);
    expect(local).toMatchObject({ address_id: "a1", address_text: "House 12, Phase 5 DHA, Lahore", zone_name: "DHA" });
    expect(localToCart(local)).toMatchObject({ address_id: "a1", address_text: "House 12, Phase 5 DHA, Lahore", zone_name: "DHA" });
  });

  it("clears the address when the server has none (the customer changed), and keeps the till's when an older server says nothing", () => {
    server = fresh([["Karahi", 100000]]);
    const prev: LocalOrder = { ...serverToLocal(asOrder(server)), address_id: "a1", address_text: "House 12", zone_name: "DHA" };
    expect(serverToLocal({ ...asOrder(server), address_id: null } as Order, prev)).toMatchObject({ address_id: null, address_text: null, zone_name: null });
    const older = serverToLocal(asOrder(server), prev); // no address_id key at all
    expect(older).toMatchObject({ address_id: "a1", address_text: "House 12", zone_name: "DHA" });
  });

  it("shows the address a website guest typed, which has no saved address behind it (sync-auth#6)", () => {
    server = fresh([["Karahi", 100000]]);
    const guest = serverToLocal({ ...asOrder(server), address_id: null, address_text: "House 9, Lahore" } as Order);
    expect(guest).toMatchObject({ address_id: null, address_text: "House 9, Lahore", zone_name: null });
    expect(localToCart(guest).address_text).toBe("House 9, Lahore");
  });
});

describe("the bill preview and the offline receipt (QA T13)", () => {
  // "Tax 16% on Rs 1,090" for a bill with Rs 100 off: the base before the discount, where the server states the base after.
  it("state the tax base after the order's discount, as the server's receipt does", () => {
    const taxed: CartLine = { key: "k", product_id: "p", name: "Karahi", unit_price_minor: 109000, quantity: 1, modifiers: [], tax_rate: 16, tax_inclusive: false };
    const cart: Cart = {
      id: "bill-1", saved: false, local_only: false, status: "draft", order_type: "takeaway", lines: [taxed], customer: null, table_id: null, table_code: null, guest_name: "", covers: null,
      notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: "2026-11-06T10:00:00Z",
      discount_minor: 10000, discounts: [{ id: "d-1", kind: "voucher", value: 100, amount_minor: 10000, reason: "Voucher EID-1", order_item_id: null }],
    };
    const r = buildLocalReceipt(cartToLocal(cart, "draft"));
    expect(r.totals.tax_lines).toEqual([{ rate: 16, inclusive: false, taxable_minor: 99000, tax_minor: 15840 }]);
    expect(r.totals.tax_minor).toBe(15840);
  });
});

describe("offline labels (review R29)", () => {
  const takeaway = (id: string): Cart => ({
    id, saved: false, local_only: false, status: "draft", order_type: "takeaway", lines: [openLine("Chai", 15000)], customer: null, table_id: null, table_code: null,
    guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: new Date().toISOString(),
  });

  it("gives two offline saves made at the same moment a label each", async () => {
    h.online = false;
    const [a, b] = await Promise.all([saveOrder(takeaway("new-a")), saveOrder(takeaway("new-b"))]);
    expect([a.local.label, b.local.label].sort()).toEqual(["T1-001", "T1-002"]);
    expect(h.queued.map((q) => q.payload.till_serial).sort()).toEqual(["T1-001", "T1-002"]);
    expect(h.kv.get("till_serial_seq")).toBe(2);
  });

  it("carries on from the stored counter", async () => {
    h.online = false;
    h.kv.set("till_serial_seq", 41);
    expect((await saveOrder(takeaway("new-c"))).local.label).toBe("T1-042");
  });
});
