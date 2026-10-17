import { describe, expect, it } from "vitest";
import { billRows, cashSuggestions } from "./bill";
import { computeTotals, lineAmount, roundToStep, type CartLine } from "./pricing";
import { totalsWithCharges } from "./pos-charges";
import { payableTotals } from "./pos-rules";

const line = (p: Partial<CartLine>): CartLine => ({ key: p.key ?? "k", name: "Item", unit_price_minor: 60000, quantity: 1, modifiers: [], tax_rate: 16, tax_inclusive: false, ...p });
const settings = { service_charge_percent: 5, service_charge_order_types: ["walk_in"], total_rounding_minor: 100 };
const sum = (rows: { amount_minor: number; info?: boolean }[]) => rows.filter((r) => !r.info).reduce((s, r) => s + r.amount_minor, 0);

describe("bill lines add up to the subtotal (review 0.1)", () => {
  const cases: [string, CartLine[]][] = [
    ["one item", [line({ key: "a" })]],
    ["several items", [line({ key: "a" }), line({ key: "b", unit_price_minor: 55000 })]],
    ["quantity above one", [line({ key: "a", quantity: 3 }), line({ key: "b", unit_price_minor: 55000, quantity: 2 })]],
    ["a priced modifier", [line({ key: "a", modifiers: [{ modifier_id: "m", name: "Extra hot", price_minor: 2000, quantity: 1 }], quantity: 2 })]],
    ["a line discount", [line({ key: "a", discount_value: "10", discount_type: "percent" }), line({ key: "b", unit_price_minor: 55000 })]],
    ["an inclusive tax", [line({ key: "a", tax_inclusive: true }), line({ key: "b", unit_price_minor: 55000 })]],
  ];
  for (const [name, lines] of cases) {
    it(name, () => {
      const t = computeTotals(lines, { orderType: "walk_in" });
      expect(lines.reduce((s, l) => s + lineAmount(l), 0)).toBe(t.subtotal_minor);
    });
  }
  it("a line shows unit price times quantity, not the price with tax", () => {
    expect(lineAmount(line({}))).toBe(60000);
    expect(lineAmount(line({ quantity: 2, modifiers: [{ modifier_id: "m", name: "Extra hot", price_minor: 2000, quantity: 1 }] }))).toBe(124000);
  });
});

describe("one rounded total (review 0.2)", () => {
  const lines = [line({ key: "a", name: "Seekh Kabab (4 pcs)" }), line({ key: "b", name: "Chicken Tikka", unit_price_minor: 55000 })];
  it("the review's bill: Rs 1,391.50 is Rs 1,392 everywhere, and the shown lines add up to it", () => {
    const t = totalsWithCharges(lines, { order_type: "walk_in" }, { settings });
    expect(t).toMatchObject({ subtotal_minor: 115000, service_charge_minor: 5750, tax_minor: 18400, rounding_minor: 50, total_minor: 139200 });
    const rows = billRows(t);
    expect(rows.map((r) => [r.label, r.amount_minor])).toEqual([["Subtotal", 115000], ["Service charge", 5800], ["Tax", 18400]]);
    expect(sum(rows)).toBe(t.total_minor);
  });
  it("change is tendered minus the rounded total for every note", () => {
    const due = payableTotals({ lines, order_type: "walk_in", is_staff_meal: false }, { settings, cash: true }).total_minor;
    expect(due).toBe(139200);
    for (const [tendered, change] of [[140000, 800], [150000, 10800], [200000, 60800], [500000, 360800]]) expect(tendered - due).toBe(change);
  });
  it("cash rounding to Rs 5 goes on top of the whole-rupee total, and the bill still balances", () => {
    const t = payableTotals({ lines, order_type: "walk_in", is_staff_meal: false }, { settings: { ...settings, cash_rounding: 5 }, cash: true });
    expect(t).toMatchObject({ total_minor: 139000, cash_rounding_minor: -200, rounding_minor: -150 });
    const rows = billRows(t);
    expect(rows.find((r) => r.key === "rounding")?.amount_minor).toBe(-200);
    expect(sum(rows)).toBe(139000);
  });
  it("never shows a fraction of a rupee: a discount, a charge and tax with paisa still add up", () => {
    const t = totalsWithCharges([line({ key: "a", unit_price_minor: 57500, discount_value: "10", discount_type: "percent" })], { order_type: "walk_in" }, { settings });
    expect(t.total_minor % 100).toBe(0);
    const rows = billRows(t);
    for (const r of rows) expect(Math.abs(r.amount_minor) % 100).toBe(0);
    expect(sum(rows)).toBe(t.total_minor);
  });
  it("shows inclusive tax for information only", () => {
    const t = totalsWithCharges([line({ tax_inclusive: true, unit_price_minor: 58000 })], { order_type: "dine_in" }, { settings });
    const rows = billRows(t);
    expect(rows.find((r) => r.key === "tax-included")).toMatchObject({ info: true, amount_minor: 8000 });
    expect(rows.find((r) => r.key === "tax")).toBeUndefined();
    expect(sum(rows)).toBe(58000);
  });
  it("keeps paisa when the business turns rounding off", () => {
    expect(totalsWithCharges(lines, { order_type: "walk_in" }, { settings: { ...settings, total_rounding_minor: 0 } }).total_minor).toBe(139150);
    expect(roundToStep(139150, 100)).toBe(139200);
    expect(roundToStep(139149, 100)).toBe(139100);
  });
});

describe("quick cash buttons (review 0.3)", () => {
  it("start at the exact total and follow real notes", () => {
    expect(cashSuggestions(139200)).toEqual([139200, 140000, 150000, 200000, 500000]);
    expect(cashSuggestions(52200)).toEqual([52200, 55000, 60000, 100000, 500000]);
    expect(cashSuggestions(50000)).toEqual([50000, 100000, 500000]);
    expect(cashSuggestions(720000)).toEqual([720000, 750000, 800000, 1000000, 1500000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});
