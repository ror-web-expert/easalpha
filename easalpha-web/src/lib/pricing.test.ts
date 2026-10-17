import { describe, expect, it } from "vitest";
import { attachDiscounts, computeTotals, displaySettings, lineDiscount, lineTotals, productDiscountFields, type CartLine } from "./pricing";
import type { Catalog, Product } from "./types";

// Mirrors easalpha-api Product#discount_minor_for and Orders::Pricing: the product discount comes off the line first,
// is capped at the line subtotal, and is skipped when the cashier overrode the price.
const line = (p: Partial<CartLine> = {}): CartLine => ({ key: "k", product_id: "p1", name: "Biryani", unit_price_minor: 50000, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false, ...p });

describe("lineDiscount", () => {
  it("takes a percentage of the line subtotal", () => {
    expect(lineDiscount(line({ discount_value: "10", discount_type: "percent", quantity: 2 }), 100000)).toBe(10000);
  });
  it("rounds the percentage like the server (half up)", () => {
    expect(lineDiscount(line({ discount_value: "12.5", discount_type: "percent" }), 333)).toBe(42);
  });
  it("takes a rupee amount per unit", () => {
    expect(lineDiscount(line({ discount_value: "50", discount_type: "amount", quantity: 3 }), 150000)).toBe(15000);
  });
  it("is capped at the line subtotal", () => {
    expect(lineDiscount(line({ discount_value: "1000", discount_type: "amount" }), 50000)).toBe(50000);
  });
  it("is skipped when the price was overridden", () => {
    expect(lineDiscount(line({ discount_value: "10", discount_type: "percent", price_override_minor: 40000 }), 40000)).toBe(0);
  });
  it("is zero for no, zero or bad values", () => {
    expect(lineDiscount(line(), 50000)).toBe(0);
    expect(lineDiscount(line({ discount_value: "0", discount_type: "percent" }), 50000)).toBe(0);
    expect(lineDiscount(line({ discount_value: "-5", discount_type: "amount" }), 50000)).toBe(0);
    expect(lineDiscount(line({ discount_value: "abc", discount_type: "amount" }), 50000)).toBe(0);
  });
});

describe("lineTotals with a product discount", () => {
  it("taxes the discounted base (exclusive tax)", () => {
    const t = lineTotals(line({ unit_price_minor: 10000, discount_value: "10", discount_type: "percent", tax_rate: 17 }));
    expect(t.line_subtotal_minor).toBe(10000);
    expect(t.line_discount_minor).toBe(1000);
    expect(t.line_tax_minor).toBe(1530);
    expect(t.line_total_minor).toBe(10530);
  });
  it("keeps the total at the discounted base for inclusive tax", () => {
    const t = lineTotals(line({ unit_price_minor: 10000, discount_value: "10", discount_type: "percent", tax_rate: 17, tax_inclusive: true }));
    expect(t.line_total_minor).toBe(9000);
    expect(t.line_tax_minor).toBe(Math.round(9000 - 9000 / 1.17));
  });
  it("includes modifiers in the base the percentage applies to", () => {
    const t = lineTotals(line({ unit_price_minor: 10000, modifiers: [{ modifier_id: "m", name: "Extra", price_minor: 2000, quantity: 1 }], quantity: 2, discount_value: "50", discount_type: "percent" }));
    expect(t.line_subtotal_minor).toBe(24000);
    expect(t.line_discount_minor).toBe(12000);
  });
});

describe("computeTotals", () => {
  const lines = [
    line({ key: "a", unit_price_minor: 10000, quantity: 2, discount_value: "10", discount_type: "percent" }), // 20000, -2000
    line({ key: "b", product_id: "p2", unit_price_minor: 5000, quantity: 1 }), // 5000
  ];
  it("sums product discounts into discount_minor and charges service on the net", () => {
    const t = computeTotals(lines, { orderType: "dine_in", settings: { service_charge_percent: 10 } });
    expect(t.subtotal_minor).toBe(25000);
    expect(t.discount_minor).toBe(2000);
    expect(t.service_charge_minor).toBe(2300);
    expect(t.total_minor).toBe(25000 - 2000 + 2300);
  });
  it("applies an order-level discount after the product discount, allocated over what is left", () => {
    const t = computeTotals(lines, { orderType: "walk_in", discount_minor: 2300 });
    expect(t.discount_minor).toBe(4300);
    expect(t.total_minor).toBe(25000 - 4300);
  });
  it("caps the order-level discount at the discounted subtotal", () => {
    const t = computeTotals(lines, { orderType: "walk_in", discount_minor: 99999 });
    expect(t.discount_minor).toBe(25000);
    expect(t.total_minor).toBe(0);
  });
  it("ignores cancelled lines", () => {
    const t = computeTotals([...lines, line({ key: "c", unit_price_minor: 999, status: "cancelled", discount_value: "10", discount_type: "percent" })], { orderType: "walk_in" });
    expect(t.subtotal_minor).toBe(25000);
    expect(t.discount_minor).toBe(2000);
  });
});

describe("product discount helpers", () => {
  const product = (p: Partial<Product>): Product => ({ id: "p1", category_id: "c", name: "X", name_ur: null, description: null, sku: null, image_key: null, base_price_minor: 100, tax_rate_id: null, is_favourite: false, show_online: true, active: true, sold_by_weight: false, weight_unit: null, allergens: null, dietary_tags: null, station_id: null, sort_order: 0, archived_at: null, updated_at: "", ...p });
  it("copies a positive discount and defaults the type to percent", () => {
    expect(productDiscountFields(product({ discount_value: "5", discount_type: "amount" }))).toEqual({ discount_value: "5", discount_type: "amount" });
    expect(productDiscountFields(product({ discount_value: "5" }))).toEqual({ discount_value: "5", discount_type: "percent" });
    expect(productDiscountFields(product({ discount_value: "0", discount_type: "percent" }))).toEqual({ discount_value: null, discount_type: null });
    expect(productDiscountFields(null)).toEqual({ discount_value: null, discount_type: null });
  });
  it("attaches discounts to lines that came without them", () => {
    const catalog = { products: [product({ id: "p1", discount_value: "10", discount_type: "percent" })] } as unknown as Catalog;
    const [withIt, open, kept] = attachDiscounts([line(), line({ product_id: undefined, open_item: { name: "Open", price_minor: 1 } }), line({ discount_value: null })], catalog);
    expect(withIt.discount_value).toBe("10");
    expect(open.discount_value).toBeUndefined();
    expect(kept.discount_value).toBeNull();
  });
});

describe("displaySettings", () => {
  it("defaults to 4 columns with images and prices", () => {
    expect(displaySettings(undefined)).toEqual({ images: true, columns: 4, showPrices: true, tileSize: "small" });
  });
  it("reads the dotted keys and clamps columns to 3-6", () => {
    expect(displaySettings({ "catalog.display.columns": 8, "catalog.display.images": false, "catalog.display.show_prices": false })).toEqual({ images: false, columns: 6, showPrices: false, tileSize: "small" });
    expect(displaySettings({ "catalog.display.tile_size": "large" }).tileSize).toBe("large");
    expect(displaySettings({ "catalog.display.tile_size": "huge" }).tileSize).toBe("small");
    expect(displaySettings({ "catalog.display.columns": "2" }).columns).toBe(3);
    expect(displaySettings({ "catalog.display.columns": "x" }).columns).toBe(4);
  });
});
