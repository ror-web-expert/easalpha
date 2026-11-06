import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, Product } from "@/lib/types";

// Review of 6 Nov 2026, R1: a price-embedded scale label charges its printed price on the till, on the receipt and in
// the order the sync queue carries to the server (Orders::Builder prices it the same: spec/requests/api/v1/scale_labels_spec.rb).
// Rs 50 and Rs 100 labels of Rs 1,200/kg mithai used to come to 0.042 kg = Rs 50.40 and 0.083 kg = Rs 99.60.
const h = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  queued: [] as { type: string; id: string; payload: Record<string, unknown> }[],
  products: [] as unknown[],
}));

// db.kv and db.transaction: the offline till serial is read and written in one read-write transaction (R29).
const kv = new Map<string, unknown>();
vi.mock("@/lib/db", () => ({
  db: {
    orders: { get: async (id: string) => h.rows.get(id), put: async (o: { id: string }) => void h.rows.set(o.id, o) },
    kv: { get: async (key: string) => (kv.has(key) ? { key, value: kv.get(key) } : undefined), put: async (row: { key: string; value: unknown }) => void kv.set(row.key, row.value) },
    transaction: (_mode: string, _table: unknown, fn: () => Promise<unknown>) => fn(),
  },
  kvGet: async () => null,
  kvSet: async () => undefined,
}));
vi.mock("@/lib/sync", () => ({
  isOnline: () => false,
  reachabilityUnknown: () => false,
  probeHealth: async () => false,
  noteNetworkFailure: () => {},
  isQueued: async (id: string) => h.queued.some((r) => r.id === id),
  processQueue: async () => undefined,
  patchQueued: async (id: string, patch: (p: Record<string, unknown>) => Record<string, unknown>, type?: string) => {
    const r = h.queued.find((q) => q.id === id);
    if (!r || (type && r.type !== type)) return false;
    r.payload = patch(r.payload);
    return true;
  },
  enqueue: async (r: { type: string; id: string; payload: Record<string, unknown> }) => { h.queued.push(r); },
}));
vi.mock("@/store/catalog", () => ({ useCatalogStore: { getState: () => ({ catalog: { business: { name: "Mithai House", currency: "PKR", settings: {} }, regular_discount_tiers: [], products: h.products }, paymentMethods: [] }) } }));
vi.mock("@/store/device", () => ({ useDeviceStore: { getState: () => ({ device: null, branch: null, session: null, business: null }) } }));

import { findBarcode, withCheckDigit, type ScaleConfig } from "./barcode";
import { computeTotals, editLine, labelPrice, labelWeight, lineAmount, lineTotals, repriceLines, toLineInput, withLabel, type CartLine } from "./pricing";
import { payOrder, saveOrder, serverToLocal } from "./pos-actions";
import { receiptLines } from "./print";
import { unitPriceNote } from "./receipt-format";
import { useCartStore, type Cart } from "@/store/cart";

const scale: ScaleConfig = { enabled: true, prefixes: ["21"], itemDigits: 5, value: "price", decimals: 0 };
const mithai = {
  id: "mithai", category_id: "c1", name: "Gulab jamun", name_ur: null, description: null, sku: null, image_key: null, base_price_minor: 120_000, tax_rate_id: null,
  is_favourite: false, show_online: true, active: true, sold_by_weight: true, weight_unit: "kg", allergens: null, dietary_tags: null, station_id: null, sort_order: 0,
  archived_at: null, updated_at: "2026-11-06T00:00:00Z", variants: [], modifier_group_ids: [], barcodes: [{ id: "b1", code: "12345", variant_id: null, quantity: "1" }],
  prices: [{ id: "pr1", product_id: "mithai", variant_id: null, order_type: "delivery", branch_id: null, price_minor: 130_000 }],
} as unknown as Product;
const naan = { ...mithai, id: "naan", name: "Naan", base_price_minor: 5_000, sold_by_weight: false, weight_unit: null, prices: [], barcodes: [{ id: "b2", code: "77", variant_id: null, quantity: "1" }] } as unknown as Product;

/** Rs <rupees> label for the mithai, as the scale prints it (prefix 21, item 12345, whole rupees). */
const label = (rupees: number) => withCheckDigit(`2112345${String(rupees).padStart(5, "0")}`);
/** The line the sell screen adds for a scan (page.tsx addPicked). */
function scanned(code: string): Omit<CartLine, "key"> {
  const m = findBarcode([mithai, naan], code, { scale })!;
  const line = { product_id: m.product.id, variant_id: null, name: m.product.name, unit_price_minor: m.product.base_price_minor, quantity: m.quantity, modifiers: [], tax_rate: 0, tax_inclusive: false };
  return m.labelPriceMinor ? withLabel(line, m.labelPriceMinor) : line;
}
const asLine = (l: Omit<CartLine, "key">, key = "k1"): CartLine => ({ ...l, key });
const freshCart = (lines: CartLine[]): Cart => ({ ...useCartStore.getState().cart, lines, order_type: "takeaway", saved: false, local_only: false, status: "draft" });

beforeEach(() => {
  h.rows.clear();
  h.queued.length = 0;
  h.products = [mithai, naan];
  useCartStore.getState().clear();
});

describe("the weight a label stands for", () => {
  it("is label / unit price to 3 decimals, halves up, as Orders::Builder.label_weight", () => {
    expect(labelWeight(5_000, 120_000)).toBe(0.042);
    expect(labelWeight(10_000, 120_000)).toBe(0.083);
    expect(labelWeight(45_000, 120_000)).toBe(0.375);
    expect(labelWeight(6, 12_000)).toBe(0.001); // exactly half a gram rounds up
    expect(labelWeight(5, 12_000)).toBe(0);
    expect(labelWeight(5_000, 0)).toBe(0);
  });
});

describe("scanning a price label", () => {
  it("charges Rs 50 and Rs 100 exactly on a product sold by weight", () => {
    const m50 = findBarcode([mithai], label(50), { scale });
    expect(m50).toMatchObject({ quantity: 0.042, labelPriceMinor: 5_000, via: "scale" });
    expect(findBarcode([mithai], label(100), { scale })).toMatchObject({ quantity: 0.083, labelPriceMinor: 10_000 });
    const lines = [asLine(scanned(label(50)), "a"), asLine(scanned(label(100)), "b")];
    expect(lines.map(lineAmount)).toEqual([5_000, 10_000]);
    expect(computeTotals(lines, { orderType: "takeaway" })).toMatchObject({ subtotal_minor: 15_000, total_minor: 15_000 });
    // Taxed like any line, on the label price.
    expect(lineTotals({ ...lines[0], tax_rate: 16 })).toMatchObject({ line_subtotal_minor: 5_000, line_tax_minor: 800, line_total_minor: 5_800 });
  });

  it("keeps a product not sold by weight on unit price times quantity", () => {
    const m = findBarcode([naan], withCheckDigit("210007700150"), { scale }); // Rs 150 of Rs 50 naan
    expect(m).toMatchObject({ quantity: 3, labelPriceMinor: null });
  });

  it("never merges label lines, and a changed quantity or a price override prices the line by weight again", () => {
    const cart = useCartStore.getState();
    cart.addLine(scanned(label(50)));
    cart.addLine(scanned(label(50)));
    let lines = useCartStore.getState().cart.lines;
    expect(lines.map((l) => [l.quantity, lineAmount(l)])).toEqual([[0.042, 5_000], [0.042, 5_000]]);
    useCartStore.getState().setQty(lines[0].key, 1.042);
    useCartStore.getState().updateLine(lines[1].key, { price_override_minor: 100_000 });
    lines = useCartStore.getState().cart.lines;
    expect(lines.map((l) => [l.label_price_minor, lineAmount(l)])).toEqual([[null, 125_040], [null, 4_200]]);
  });

  it("keeps the price when the size or order type changes the unit price, and works the weight out again", () => {
    const l = asLine(scanned(label(50)));
    expect(editLine(l, { unit_price_minor: 130_000, quantity: l.quantity })).toMatchObject({ label_price_minor: 5_000, quantity: 0.038 });
    expect(editLine(l, { notes: "box it" })).toMatchObject({ label_price_minor: 5_000, quantity: 0.042 });
    const [delivery] = repriceLines([l], "delivery", { products: [mithai] } as never);
    expect([delivery.unit_price_minor, delivery.quantity, lineAmount(delivery)]).toEqual([130_000, 0.038, 5_000]);
  });

  it("sends the label to the server, and null for a line priced by weight", () => {
    const l = asLine(scanned(label(50)));
    expect(toLineInput(l)).toMatchObject({ product_id: "mithai", quantity: 0.042, label_price_minor: 5_000 });
    expect(toLineInput({ ...l, label_price_minor: null }).label_price_minor).toBeNull();
    expect(labelPrice({ ...l, price_override_minor: 1 })).toBeNull();
  });

  it("reads the label back from the server's order", () => {
    const order = { id: "o1", items: [{ id: "i1", product_id: "mithai", variant_id: null, deal_id: null, name: "Gulab jamun", unit_price_minor: 120_000, quantity: "0.042", modifiers: [], open_item: false, price_overridden: false, label_price_minor: 5_000, tax_rate: 0, tax_inclusive: false, station_id: null, status: "pending", sent_at: null, notes: null }] } as unknown as Order;
    const [line] = serverToLocal(order).lines;
    expect([line.label_price_minor, lineAmount(line)]).toEqual([5_000, 5_000]);
  });
});

describe("an offline label sale", () => {
  it("queues the label with the order, takes exactly the label price and prints the weight", async () => {
    const cart = freshCart([asLine(scanned(label(50)), "a"), asLine(scanned(label(100)), "b")]);
    const saved = await saveOrder(cart, { place: true });
    expect(saved.offline).toBe(true);
    const r = await payOrder(saved.cart, [{ method_code: "cash", amount_minor: 15_000, tendered_minor: 20_000 }]);
    expect(r.change_minor).toBe(5_000);
    expect(r.local).toMatchObject({ total_minor: 15_000, paid_minor: 15_000, payment_status: "paid" });

    const queued = h.queued.find((q) => q.type === "order")!;
    expect((queued.payload.lines as unknown[]).map((l) => (l as Record<string, unknown>).label_price_minor)).toEqual([5_000, 10_000]);
    expect(queued.payload.payments).toEqual([expect.objectContaining({ method_code: "cash", amount_minor: 15_000 })]);

    expect(r.receipt.lines.map((l) => [l.quantity, l.unit, l.label_price_minor, l.line_subtotal_minor])).toEqual([["0.042", "kg", 5_000, 5_000], ["0.083", "kg", 10_000, 10_000]]);
    const text = receiptLines(r.receipt).filter((l): l is { text: string } => "text" in l).map((l) => l.text);
    expect(text.find((t) => t.includes("Gulab jamun"))).toMatch(/Rs 50$/);
    expect(text).toContain("     0.042 kg @ Rs 1,200/kg, label price");
    expect(text.find((t) => t.startsWith("TOTAL"))).toMatch(/Rs 150$/);
  });
});

describe("unitPriceNote", () => {
  const money = (v: number) => `Rs ${v / 100}`;
  it("says each for a plain line, per unit for a weighed one, and names the label price", () => {
    expect(unitPriceNote({ quantity: "2", unit_price_minor: 50_000 }, money)).toBe("@ Rs 500 each");
    expect(unitPriceNote({ quantity: "1", unit_price_minor: 50_000 }, money)).toBeNull();
    expect(unitPriceNote({ quantity: "0.5", unit: "kg", unit_price_minor: 120_000 }, money)).toBe("0.5 kg @ Rs 1200/kg");
    expect(unitPriceNote({ quantity: "0.042", unit: "kg", unit_price_minor: 120_000, label_price_minor: 5_000 }, money)).toBe("0.042 kg @ Rs 1200/kg, label price");
  });
});
