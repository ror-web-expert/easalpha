import { describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/pricing";
import { payableTotals } from "@/lib/pos-rules";
import { LOCAL_REGULAR_ID, regularDiscountFor, saleTime, tierAmount, withRegularDiscount } from "@/lib/pos-regular";
import type { RegularDiscountTier } from "@/lib/types";
import type { Cart } from "@/store/cart";

const line = (key: string, price: number, extra: Partial<CartLine> = {}): CartLine => ({ key, product_id: key, name: key, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: 16, tax_inclusive: false, ...extra });
const tier = (extra: Partial<RegularDiscountTier> = {}): RegularDiscountTier => ({ id: "t3", name: "Back within 3 days", within_days: 3, kind: "percent", value: 10, min_order_minor: 0, excluded_product_ids: [], excluded_category_ids: [], excluded_order_types: [], active: true, archived_at: null, ...extra });
const settings = { "charges.service_charge.value": 5, service_charge_order_types: ["dine_in"], total_rounding_minor: 100, "marketing.regular_discounts.enabled": true };
const now = new Date("2026-10-18T02:26:00+05:00");
const yesterday = new Date(now.getTime() - 86_400_000).toISOString();
const cart = (extra: Partial<Cart> = {}): Cart => ({
  id: "o1", saved: false, local_only: false, status: "draft", order_type: "dine_in", lines: [line("half", 120_000), line("full", 220_000)],
  customer: { id: "sadia", name: "Sadia Akhtar", phone: "+923001807130", last_order_at: yesterday, is_walk_in: false }, table_id: null, table_code: null,
  guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: now.toISOString(), ...extra,
});
const ctx = (extra = {}) => ({ apply: true, customer: { id: "sadia", is_walk_in: false, last_order_at: yesterday }, tiers: [tier()], settings, at: now, ...extra });

describe("regular discount on the till", () => {
  // The order from 18 Oct 2026: Chicken Karahi half and full, 5% service, 16% tax. The till charged Rs 4,114 to khata;
  // the server took 10% off for the regular customer and asked for Rs 3,703, so it refused the payment.
  it("prices the offline khata order at the server's Rs 3,703", () => {
    const priced = withRegularDiscount(cart(), ctx());
    expect(priced.discounts).toEqual([expect.objectContaining({ id: LOCAL_REGULAR_ID, kind: "regular", amount_minor: 34_000, reason: "Regular discount: Back within 3 days" })]);
    const t = payableTotals(priced, { settings, cash: false });
    expect(t).toMatchObject({ subtotal_minor: 340_000, discount_minor: 34_000, service_charge_minor: 15_300, total_minor: 370_300 });
    expect(payableTotals(cart(), { settings, cash: false }).total_minor).toBe(411_400); // what the till charged before
  });

  it("works it out again on every call instead of adding it twice, and follows the lines", () => {
    const once = withRegularDiscount(cart(), ctx());
    const twice = withRegularDiscount(once, ctx());
    expect(twice.discount_minor).toBe(34_000);
    expect(twice.discounts).toHaveLength(1);
    const more = withRegularDiscount({ ...twice, lines: [...twice.lines, line("drink", 10_000)] }, ctx());
    expect(more.discount_minor).toBe(35_000);
  });

  it("leaves the server's own regular discount alone and takes the till's off when the server prices the order", () => {
    const server = cart({ discount_minor: 30_000, discounts: [{ id: "d1", kind: "regular", value: 300, amount_minor: 30_000, reason: "Regular discount: Back within 3 days", order_item_id: null }] });
    expect(withRegularDiscount(server, ctx())).toBe(server);
    const mine = withRegularDiscount(cart({ discount_minor: 5_000, discounts: [{ id: "v1", kind: "voucher", value: 50, amount_minor: 5_000, reason: "Voucher X", order_item_id: null }] }), ctx());
    expect(mine.discount_minor).toBe(5_000 + 34_000);
    const online = withRegularDiscount(mine, ctx({ apply: false }));
    expect(online.discount_minor).toBe(5_000);
    expect(online.discounts?.map((d) => d.id)).toEqual(["v1"]);
  });

  it("gives nothing to walk-in, new, blocked or lapsed customers, or when the tiers are switched off", () => {
    const none = (extra: object) => regularDiscountFor({ lines: cart().lines, orderType: "dine_in", tiers: [tier()], settings, at: now, customer: { id: "sadia", is_walk_in: false, last_order_at: yesterday }, ...extra });
    expect(none({})?.amount_minor).toBe(34_000);
    expect(none({ customer: { id: "w", is_walk_in: true, last_order_at: yesterday } })).toBeNull();
    expect(none({ customer: { id: "new", is_walk_in: false, last_order_at: null } })).toBeNull();
    expect(none({ customer: null })).toBeNull();
    expect(none({ settings: { ...settings, "marketing.regular_discounts.blocked_customer_ids": ["sadia"] } })).toBeNull();
    expect(none({ settings: { ...settings, "marketing.regular_discounts.enabled": false } })).toBeNull();
    expect(none({ customer: { id: "sadia", last_order_at: new Date(now.getTime() - 5 * 86_400_000).toISOString() } })).toBeNull();
    expect(none({ tiers: [tier({ excluded_order_types: ["dine_in"] })] })).toBeNull();
    expect(none({ tiers: [tier({ active: false })] })).toBeNull();
    expect(none({ tiers: [tier({ min_order_minor: 400_000 })] })).toBeNull();
  });

  it("takes the smallest window that covers the gap and skips excluded products and categories", () => {
    const tiers = [tier({ id: "t30", name: "Month", within_days: 30, value: 5 }), tier({ id: "t7", name: "Week", within_days: 7, value: 8 }), tier()];
    const tenDays = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    expect(regularDiscountFor({ lines: cart().lines, orderType: "dine_in", tiers, settings, at: now, customer: { id: "a", last_order_at: yesterday } })?.tier.id).toBe("t3");
    expect(regularDiscountFor({ lines: cart().lines, orderType: "dine_in", tiers, settings, at: now, customer: { id: "a", last_order_at: tenDays } })).toMatchObject({ tier: { id: "t30" }, amount_minor: 17_000 });
    const lines = [line("half", 120_000), line("full", 220_000)];
    expect(regularDiscountFor({ lines, orderType: "dine_in", tiers: [tier({ excluded_product_ids: ["full"] })], settings, at: now, customer: { id: "a", last_order_at: yesterday } })?.amount_minor).toBe(12_000);
    expect(regularDiscountFor({ lines, orderType: "dine_in", tiers: [tier({ excluded_category_ids: ["karahi"] })], settings, at: now, customer: { id: "a", last_order_at: yesterday }, categoryOf: (id) => (id === "half" ? "karahi" : "other") })?.amount_minor).toBe(22_000);
  });

  it("bases the amount on the price after the product's own discount, and caps a fixed tier", () => {
    const lines = [line("burger", 100_000, { discount_type: "percent", discount_value: 20 })];
    expect(regularDiscountFor({ lines, orderType: "walk_in", tiers: [tier()], settings, at: now, customer: { id: "a", last_order_at: yesterday } })?.amount_minor).toBe(8_000);
    expect(tierAmount({ kind: "fixed", value: 150, min_order_minor: 0 }, 10_000)).toBe(10_000);
    expect(tierAmount({ kind: "fixed", value: 12.34, min_order_minor: 0 }, 10_000)).toBe(1_234);
    expect(tierAmount({ kind: "percent", value: 10.5, min_order_minor: 0 }, 12_345)).toBe(1_296);
    expect(tierAmount({ kind: "percent", value: 10, min_order_minor: 0 }, 12_345)).toBe(1_235);
  });

  it("counts recency to when the order was started, never later than now", () => {
    expect(saleTime({ client_created_at: "2026-10-17T10:00:00Z" }, now).toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(saleTime({ client_created_at: "2027-01-01T00:00:00Z" }, now)).toEqual(now);
    expect(saleTime({ client_created_at: "not a date" }, now)).toEqual(now);
  });
});
