import { describe, expect, it } from "vitest";
import { billingCurrency, includedTills, planEstimate } from "./plan-price";

const pro = { price_pkr_minor: 4_999_00, price_usd_minor: 39_00, limits: { tills: 10, branches: 1 } };
const business = { price_pkr_minor: 8_999_00, price_usd_minor: 69_00, limits: { tills: null, branches: 20 } };

describe("plan estimate (matches Billing::Issuer)", () => {
  it("charges extra tills only beyond what the plan includes", () => {
    expect(planEstimate(pro, "monthly", 10)).toBe(4_999_00);
    expect(planEstimate(pro, "monthly", 12)).toBe(4_999_00 + 2 * 1_000_00);
    expect(planEstimate(pro, "yearly", 12)).toBe((4_999_00 + 2 * 1_000_00) * 10);
  });
  it("never charges extra tills on a plan with no till limit", () => {
    expect(includedTills(business)).toBeNull();
    expect(planEstimate(business, "monthly", 40)).toBe(8_999_00);
  });
  it("reads a plan that states no till limit as one till", () => {
    expect(includedTills({ limits: { branches: 1 } })).toBe(1);
  });
  it("bills a business outside Pakistan in dollars, $9 for each extra till", () => {
    expect(billingCurrency("PK")).toBe("PKR");
    expect(billingCurrency("AE")).toBe("USD");
    expect(planEstimate(pro, "monthly", 12, "USD")).toBe(39_00 + 2 * 9_00);
    expect(planEstimate(business, "yearly", 30, "USD")).toBe(69_00 * 10);
  });
});
