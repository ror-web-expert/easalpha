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
  queued: [] as { type: string; id: string; payload: Record<string, unknown> }[],
  calls: [] as string[],
  handler: null as null | ((path: string, opts: { method?: string; body?: unknown }) => unknown),
}));

vi.mock("@/lib/db", () => ({
  db: { orders: { get: async (id: string) => h.rows.get(id), put: async (o: { id: string }) => void h.rows.set(o.id, o) } },
  kvGet: async () => null,
  kvSet: async () => undefined,
}));
// The queue keeps one record per id, as db.queue does; patchQueued only merges into a record of the given type.
vi.mock("@/lib/sync", () => ({
  isOnline: () => h.online,
  isQueued: async (id: string) => h.queued.some((r) => r.id === id),
  processQueue: async () => undefined,
  patchQueued: async (id: string, patch: (p: Record<string, unknown>) => Record<string, unknown>, type?: string) => {
    const r = h.queued.find((q) => q.id === id);
    if (!r || (type && r.type !== type)) return false;
    r.payload = patch(r.payload);
    return true;
  },
  enqueue: async (r: { type: string; id: string; payload: Record<string, unknown> }) => {
    const i = h.queued.findIndex((q) => q.id === r.id);
    if (i >= 0) h.queued.splice(i, 1);
    h.queued.push(r);
  },
}));
vi.mock("@/store/catalog", () => ({ useCatalogStore: { getState: () => ({ catalog: { business: { name: "Test Cafe", currency: "PKR", settings: h.settings } } }) } }));
vi.mock("@/store/device", () => ({ useDeviceStore: { getState: () => ({ device: null, branch: null, session: null, business: null }) } }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: async (path: string, opts: { method?: string; body?: unknown } = {}) => h.handler!(path, opts) };
});

import { ApiError } from "@/lib/api";
import { localToCart, payOrder, reopenFields, serverToLocal, TotalChangedError } from "./pos-actions";
import { defaultPaymentMethod, payableTotals, roundsCash } from "./pos-rules";

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

/** Payments::Processor#call: all or nothing, like its transaction. */
function takePayments(o: ServerOrder, body: { payments: PaymentInput[]; tip_minor: number }): PaymentResult {
  const next: ServerOrder = JSON.parse(JSON.stringify(o));
  if (body.tip_minor > 0) next.tip_minor += body.tip_minor;
  const step = Math.trunc(Number(h.settings.cash_rounding ?? 0)) * 100;
  if (step > 0 && body.payments.some((p) => p.method_code === "cash") && next.paid_minor === 0) {
    const before = total(next) - next.rounding_minor;
    next.rounding_minor = Math.floor((before + step / 2) / step) * step - before;
  }
  const due = total(next) - next.paid_minor;
  let taken = 0;
  let change = 0;
  const created = body.payments.map((p) => {
    if (!(p.amount_minor > 0)) throw new ApiError("payment.amount", "Amount must be positive", 400);
    const remaining = due - taken;
    if (p.amount_minor > remaining && p.method_code !== "cash") throw new ApiError("payment.overpaid", "Payment exceeds the amount due", 409);
    const applied = Math.min(p.amount_minor, remaining);
    if (applied <= 0) throw new ApiError("payment.overpaid", "Order is already paid", 409);
    const tendered = p.method_code === "cash" ? Math.max(p.tendered_minor ?? 0, p.amount_minor) : null;
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
const screenDue = (cart: Cart, codes: string[], tip = 0) => Math.max(0, payableTotals(cart, { settings: h.settings, tip_minor: tip, cash: roundsCash(codes) }).total_minor - (cart.paid_minor ?? 0));

beforeEach(() => {
  h.rows.clear();
  h.queued.length = 0;
  h.calls.length = 0;
  h.online = true;
  for (const k of Object.keys(h.settings)) delete h.settings[k];
  h.handler = (path, opts) => {
    const [, id, action] = /^\/orders\/([^/]+)(?:\/(\w+))?$/.exec(path) ?? [];
    if (id === server.id && opts.method === "PATCH" && !action) {
      h.calls.push("save");
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
    const byCard = await payOrder(opened(), [card(125600)], 0, undefined, { shownDue: screenDue(opened(), ["card"]) });
    expect(byCard.local).toMatchObject({ status: "paid", total_minor: 125600, rounding_minor: 0 });
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
