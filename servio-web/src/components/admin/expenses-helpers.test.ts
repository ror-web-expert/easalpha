import { describe, expect, it } from "vitest";
import type { Expense, ExpenseCategory, PaymentMethod, TaxRate } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { expenseTotals, pdfRow, sourceLabel, splitCategory, subcategoriesOf, totalsFooter } from "./expenses-helpers";
import {
  chargeAmount, chargeDisplay, deliveryChargeDefault, deliveryChargeFields, linkedTaxRate, resolveDeliveryCharge, resolveServiceCharge,
  serviceChargeDefault, serviceChargeFields, taxRateLabel, totalsWithCharges,
} from "@/lib/pos-charges";

const cat = (id: string, name: string, children: ExpenseCategory[] = [], parent_id: string | null = null): ExpenseCategory =>
  ({ id, name, parent_id, full_name: parent_id ? `Parent / ${name}` : name, sort_order: 0, archived_at: null, children });
const expense = (amount_minor: number, voided = false, extra: Partial<Expense> = {}): Expense =>
  ({ id: "e", number: 1, label: "EXP-1", branch_id: "b", category_id: "c", category: "Utilities / Gas", amount_minor, method_code: "cash", payment_account_id: null, shift_id: null,
    receipt_key: null, paid_to: "SSGC", note: null, spent_on: "2026-10-10", business_day: "2026-10-10", source: "till", by_membership_id: null, voided_at: voided ? "2026-10-10T10:00:00Z" : null, void_reason: null, created_at: "", ...extra });

describe("subcategoriesOf", () => {
  const cats = [cat("u", "Utilities", [cat("g", "Gas", [], "u"), cat("e", "Electricity", [], "u"), { ...cat("x", "Old", [], "u"), archived_at: "2026-01-01" }]), cat("r", "Rent")];
  it("returns the live children of the chosen category", () => {
    expect(subcategoriesOf(cats, "u").map((c) => c.name)).toEqual(["Gas", "Electricity"]);
  });
  it("is empty without a category, for a leaf category or for an unknown id", () => {
    expect(subcategoriesOf(cats, "")).toEqual([]);
    expect(subcategoriesOf(cats, "r")).toEqual([]);
    expect(subcategoriesOf(cats, "zz")).toEqual([]);
    expect(subcategoriesOf(undefined, "u")).toEqual([]);
  });
});

describe("sourceLabel and splitCategory", () => {
  it("names the SPEC sources and falls back to title case", () => {
    expect(sourceLabel("admin")).toBe("Admin");
    expect(sourceLabel("till")).toBe("Till");
    expect(sourceLabel("payroll_sync")).toBe("Payroll sync");
    expect(sourceLabel("rider_float")).toBe("Rider float");
    expect(sourceLabel("something_else")).toBe("Something Else");
    expect(sourceLabel(null)).toBe("-");
  });
  it("splits a full category name into category and subcategory", () => {
    expect(splitCategory("Utilities / Gas")).toEqual({ category: "Utilities", subcategory: "Gas" });
    expect(splitCategory("Rent")).toEqual({ category: "Rent", subcategory: null });
    expect(splitCategory(null)).toEqual({ category: "", subcategory: null });
  });
});

describe("totals footer", () => {
  it("sums live rows, averages them and reports voided rows separately", () => {
    const rows = [expense(150000), expense(50000), expense(99900, true)];
    expect(expenseTotals(rows)).toEqual({ count: 2, total_minor: 200000, voided_count: 1, voided_minor: 99900 });
    const footer = totalsFooter(rows);
    expect(footer[0]).toMatch(/^Total .*2,000.* across 2 expenses$/);
    expect(footer[1]).toMatch(/^Average .*1,000/);
    expect(footer[2]).toMatch(/^1 voided .*999.* not included$/);
  });
  it("handles no rows", () => {
    expect(totalsFooter([])).toEqual([expect.stringMatching(/across 0 expenses$/)]);
  });
  it("builds a PDF row with the category split and the void state", () => {
    const row = pdfRow(expense(12345, true));
    expect(row).toMatchObject({ label: "EXP-1", category: "Utilities", subcategory: "Gas", method: "Cash", source: "Till", paid_to: "SSGC", status: "Voided" });
    expect(String(row.amount)).toBe(formatMoney(12345));
  });
});

describe("service charge: percent vs fixed", () => {
  const percentSettings = { "charges.service_charge.mode": "percent", "charges.service_charge.value": 10, "charges.service_charge.order_types": ["dine_in", "walk_in"] };
  const fixedSettings = { "charges.service_charge.mode": "fixed", "charges.service_charge.value": 150, "charges.service_charge.order_types": ["dine_in"] };
  it("pre-fills the percent default only for covered order types", () => {
    expect(serviceChargeDefault(percentSettings, "dine_in")).toEqual({ mode: "percent", value: 10 });
    expect(serviceChargeDefault(percentSettings, "delivery").value).toBe(0);
  });
  it("pre-fills a fixed default in minor units", () => {
    expect(serviceChargeDefault(fixedSettings, "dine_in")).toEqual({ mode: "fixed", value: 15000 });
  });
  it("falls back to the legacy keys and treats blank or zero as disabled", () => {
    expect(serviceChargeDefault({ service_charge_percent: "5", service_charge_order_types: ["dine_in"] }, "dine_in")).toEqual({ mode: "percent", value: 5 });
    expect(serviceChargeDefault({ "charges.service_charge.value": "" }, "dine_in").value).toBe(0);
    expect(serviceChargeDefault({ "charges.service_charge.value": 0 }, "dine_in").value).toBe(0);
  });
  it("computes the amount on the net and displays each mode", () => {
    expect(chargeAmount({ mode: "percent", value: 10 }, 123450)).toBe(12345);
    expect(chargeAmount({ mode: "percent", value: 12.5 }, 100001)).toBe(12500);
    expect(chargeAmount({ mode: "fixed", value: 15000 }, 123450)).toBe(15000);
    expect(chargeAmount({ mode: "fixed", value: 0 }, 123450)).toBe(0);
    expect(chargeDisplay({ mode: "percent", value: 10 })).toBe("10%");
    expect(chargeDisplay({ mode: "fixed", value: 15000 })).toBe("Rs 150");
    expect(chargeDisplay({ mode: "fixed", value: 15050 })).toBe("Rs 150.50");
    expect(chargeDisplay({ mode: "percent", value: 0 })).toBe("");
  });
  it("lets the cashier override or remove the charge per order", () => {
    expect(resolveServiceCharge({ order_type: "dine_in" }, percentSettings)).toEqual({ mode: "percent", value: 10 });
    expect(resolveServiceCharge({ order_type: "dine_in", service_charge_percent: 5, service_charge_fixed_minor: 0 }, percentSettings)).toEqual({ mode: "percent", value: 5 });
    expect(resolveServiceCharge({ order_type: "dine_in", service_charge_percent: 0, service_charge_fixed_minor: 20000 }, percentSettings)).toEqual({ mode: "fixed", value: 20000 });
    expect(resolveServiceCharge({ order_type: "dine_in", service_charge_percent: 0, service_charge_fixed_minor: 0 }, percentSettings).value).toBe(0);
    expect(serviceChargeFields({ mode: "fixed", value: 20000 })).toEqual({ service_charge_percent: 0, service_charge_fixed_minor: 20000 });
    expect(serviceChargeFields({ mode: "percent", value: 7 })).toEqual({ service_charge_percent: 7, service_charge_fixed_minor: 0 });
  });
  it("replaces the legacy percent in the local totals", () => {
    const lines = [{ key: "a", name: "Tea", unit_price_minor: 100000, quantity: 2, modifiers: [], tax_rate: 0, tax_inclusive: false }];
    const t = totalsWithCharges(lines, { order_type: "dine_in" }, { settings: fixedSettings });
    expect(t.service_charge_minor).toBe(15000);
    expect(t.total_minor).toBe(215000);
    const removed = totalsWithCharges(lines, { order_type: "dine_in", service_charge_percent: 0, service_charge_fixed_minor: 0 }, { settings: fixedSettings });
    expect(removed.service_charge_minor).toBe(0);
    expect(removed.total_minor).toBe(200000);
  });
});

describe("delivery charge", () => {
  it("defaults to a fixed rupee amount, or a percent when configured so, only on delivery orders", () => {
    expect(deliveryChargeDefault({ "charges.delivery_charge.value": 100 })).toEqual({ mode: "fixed", value: 10000 });
    expect(deliveryChargeDefault({ "charges.delivery_charge.mode": "percent", "charges.delivery_charge.value": 5 })).toEqual({ mode: "percent", value: 5 });
    expect(resolveDeliveryCharge({ order_type: "walk_in" }, { "charges.delivery_charge.value": 100 })).toBeNull();
    expect(resolveDeliveryCharge({ order_type: "delivery" }, { "charges.delivery_charge.value": 100 })).toEqual({ mode: "fixed", value: 10000 });
  });
  it("keeps a zone quote or cashier amount over the default and can be removed", () => {
    const s = { "charges.delivery_charge.value": 100 };
    expect(resolveDeliveryCharge({ order_type: "delivery", delivery_charge_minor: 25000 }, s)).toEqual({ mode: "fixed", value: 25000 });
    expect(resolveDeliveryCharge({ order_type: "delivery", delivery_charge_minor: 0, delivery_charge_percent: 0 }, s)?.value).toBe(0);
    expect(deliveryChargeFields({ mode: "percent", value: 5 })).toEqual({ delivery_charge_percent: 5, delivery_charge_minor: 0 });
    const lines = [{ key: "a", name: "Tea", unit_price_minor: 100000, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false }];
    expect(totalsWithCharges(lines, { order_type: "delivery", delivery_charge_percent: 5 }, { settings: s }).delivery_charge_minor).toBe(5000);
  });
});

describe("linkedTaxRate", () => {
  const rates: TaxRate[] = [
    { id: "r16", name: "Sales tax", rate: 16, inclusive: false, authority: "PRA", active: true, is_default: true, payment_account_id: "acc-cash" },
    { id: "r5", name: "Card rate", rate: 5, inclusive: false, authority: "PRA", active: true, is_default: false, payment_account_id: "acc-bank" },
    { id: "old", name: "Old", rate: 17, inclusive: false, authority: null, active: false, is_default: false, payment_account_id: "acc-wallet" },
  ];
  const method = (payment_account_id: string | null): PaymentMethod => ({ id: "m", code: "cash", name: "Cash", kind: "cash", payment_account_id, active: true, works_offline: true, needs_reference: false, sort_order: 0 });
  it("finds the active rate linked to the method's account", () => {
    expect(linkedTaxRate(method("acc-cash"), rates)?.id).toBe("r16");
    expect(linkedTaxRate(method("acc-bank"), rates)?.id).toBe("r5");
  });
  it("returns null when the method has no account, no rate is linked, or the linked rate is inactive", () => {
    expect(linkedTaxRate(method(null), rates)).toBeNull();
    expect(linkedTaxRate(method("acc-other"), rates)).toBeNull();
    expect(linkedTaxRate(method("acc-wallet"), rates)).toBeNull();
    expect(linkedTaxRate(null, rates)).toBeNull();
    expect(linkedTaxRate(method("acc-cash"), [])).toBeNull();
  });
  it("labels the segment with the name and rate", () => {
    expect(taxRateLabel(rates[0])).toBe("Sales tax 16%");
    expect(taxRateLabel({ name: "Reduced", rate: 2.5 })).toBe("Reduced 2.5%");
  });
});
