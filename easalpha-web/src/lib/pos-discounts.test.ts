import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { batchSendable, discountLabel, discountLocked, discountRows, optionAvailability, optionGives, ratingWord, valueLabel, voucherCode, voucherError } from "./pos-discounts";

const line = (kind: string, reason: string | null, amount_minor = 10000, value = 100) => ({ id: `${kind}-1`, kind, reason, amount_minor, value, order_item_id: null });

describe("discountLabel", () => {
  it("labels each kind from the server's reason", () => {
    expect(discountLabel(line("voucher", "Voucher EID-7F2A (Eid 2026)"))).toBe("Voucher EID-7F2A (Eid 2026)");
    expect(discountLabel(line("regular", "Regular discount: Ordered this week"))).toBe("Regular discount: Ordered this week");
    expect(discountLabel(line("loyalty", "120 points: Free tea"))).toBe("Loyalty: 120 points: Free tea");
    expect(discountLabel(line("loyalty", "50 loyalty points"))).toBe("Loyalty: 50 loyalty points");
    expect(discountLabel(line("promotion", "Friday deal"))).toBe("Promotion: Friday deal");
    expect(discountLabel(line("percent", "Staff friend", 500, 10))).toBe("10% discount (Staff friend)");
    expect(discountLabel(line("fixed", null))).toBe("Discount");
  });
  it("falls back to a plain label when the reason is missing", () => {
    expect(discountLabel(line("voucher", null))).toBe("Voucher");
    expect(discountLabel(line("regular", null))).toBe("Regular discount");
    expect(discountLabel(line("regular", "7 days"))).toBe("Regular discount: 7 days");
    expect(discountLabel(line("loyalty", ""))).toBe("Loyalty points");
  });
  it("locks only the regular discount for the cashier", () => {
    expect(discountLocked(line("regular", null))).toBe(true);
    expect(discountLocked(line("voucher", null))).toBe(false);
    expect(discountLocked(line("loyalty", null))).toBe(false);
  });
  it("reads the voucher code out of the line", () => {
    expect(voucherCode(line("voucher", "Voucher EID-7F2A (Eid 2026)"))).toBe("EID-7F2A");
    expect(voucherCode(line("voucher", null))).toBeNull();
    expect(voucherCode(line("regular", "Voucher X"))).toBeNull();
  });
});

describe("discountRows", () => {
  it("shows one row per line and the product discounts as Item discounts", () => {
    const rows = discountRows([line("regular", "Regular discount: Yesterday", 5000), line("voucher", "Voucher ABC (Launch)", 20000)], 30000);
    expect(rows.map((r) => [r.label, r.amount_minor, r.locked])).toEqual([["Item discounts", 5000, true], ["Regular discount: Yesterday", 5000, true], ["Voucher ABC (Launch)", 20000, false]]);
    expect(rows[2].id).toBe("voucher-1");
  });
  it("keeps a single Discount row when the order has no lines, and nothing at zero", () => {
    expect(discountRows([], 1500)).toEqual([{ key: "all", label: "Discount", amount_minor: 1500, kind: "item", locked: true, id: null }]);
    expect(discountRows(undefined, 0)).toEqual([]);
    expect(discountRows([line("voucher", "Voucher A", 0)], 0)).toEqual([]);
  });
});

describe("voucherError", () => {
  it("maps each API code to a title and keeps the server's message", () => {
    expect(voucherError(new ApiError("voucher.invalid", "This voucher code does not exist", 404))).toEqual({ title: "Voucher not found", message: "This voucher code does not exist" });
    expect(voucherError(new ApiError("voucher.used", "This voucher was already redeemed", 409)).title).toBe("Voucher already used");
    expect(voucherError(new ApiError("voucher.customer", "This voucher belongs to another customer", 409)).title).toBe("Wrong customer");
    expect(voucherError(new ApiError("voucher.expired", "This voucher expired on 2026-10-01", 409))).toEqual({ title: "Voucher expired", message: "This voucher expired on 2026-10-01" });
    expect(voucherError(new ApiError("voucher.exhausted", "This voucher has reached its usage limit", 409)).title).toBe("Voucher limit reached");
    expect(voucherError(new ApiError("voucher.min_spend", "This voucher needs a spend of Rs 1500", 409))).toEqual({ title: "Below the minimum spend", message: "This voucher needs a spend of Rs 1500" });
    expect(voucherError(new ApiError("voucher.already", "A voucher is already applied to this order", 409)).title).toBe("Voucher already applied");
  });
  it("uses the local text when the server sent no message, and a generic title for unknown codes", () => {
    expect(voucherError(new ApiError("voucher.min_spend", "", 409)).message).toBe("The order is below this voucher's minimum spend.");
    expect(voucherError(new ApiError("permission.denied", "You may not apply discounts", 403))).toEqual({ title: "Could not apply the voucher", message: "You may not apply discounts" });
    expect(voucherError(new ApiError("network", "Cannot reach the server", 0)).message).toMatch(/needs the internet/);
    expect(voucherError(new Error("boom")).message).toBe("boom");
  });
});

describe("redemption options", () => {
  const option = { id: "o1", name: "Free tea", points: 120, kind: "free_item", value: 0, product_id: "p1", product_name: "Green tea", active: true, sort_order: 1 };
  const ctx = { points: 200, hasCustomer: true, alreadyRedeemed: false, online: true, productIds: ["p1"] };
  it("is available when the customer has the points and the item is on the order", () => {
    expect(optionAvailability(option, ctx)).toEqual({ ok: true, reason: null });
  });
  it("is disabled when the customer lacks the points, with the shortfall shown", () => {
    expect(optionAvailability(option, { ...ctx, points: 80 })).toEqual({ ok: false, reason: "Needs 120 points (has 80)" });
    expect(optionAvailability(option, { ...ctx, points: null }).ok).toBe(false);
  });
  it("needs a customer, the internet, one redemption per order and the free item on the order", () => {
    expect(optionAvailability(option, { ...ctx, hasCustomer: false }).reason).toBe("Attach a customer first");
    expect(optionAvailability(option, { ...ctx, online: false }).reason).toBe("Needs the internet");
    expect(optionAvailability(option, { ...ctx, alreadyRedeemed: true }).reason).toBe("Points already redeemed on this order");
    expect(optionAvailability(option, { ...ctx, productIds: ["p2"] }).reason).toBe("Add Green tea to the order first");
    expect(optionAvailability({ ...option, active: false }, ctx).reason).toBe("Switched off");
    expect(optionAvailability({ ...option, kind: "fixed", product_id: null }, { ...ctx, productIds: ["p2"] }).ok).toBe(true);
  });
  it("says what an option gives", () => {
    expect(optionGives(option)).toBe("Free Green tea");
    expect(optionGives({ kind: "percent", value: 10, product_name: null })).toBe("10% off");
    expect(optionGives({ kind: "fixed", value: 150, product_name: null })).toBe("Rs 150 off");
    expect(valueLabel("fixed", 500)).toBe("Rs 500 off");
    expect(valueLabel("fixed", 5, "USD")).toBe("$5.00 off");
  });
});

describe("batchSendable", () => {
  it("allows only active, unexpired personal batches", () => {
    expect(batchSendable({ kind: "personal", active: true, expired: false })).toBe(true);
    expect(batchSendable({ kind: "personal", active: false, expired: false })).toBe(false);
    expect(batchSendable({ kind: "personal", active: true, expired: true })).toBe(false);
    expect(batchSendable({ kind: "public", active: true, expired: false })).toBe(false);
  });
});

describe("ratingWord", () => {
  it("maps 1 to 5 to the SPEC words and anything else to Pending", () => {
    expect([1, 2, 3, 4, 5].map(ratingWord)).toEqual(["Poor", "Fair", "Good", "Very good", "Excellent"]);
    expect(ratingWord(null)).toBe("Pending");
    expect(ratingWord(0)).toBe("Pending");
    expect(ratingWord(6)).toBe("Pending");
    expect(ratingWord(3.5)).toBe("Pending");
  });
});
