import { describe, expect, it } from "vitest";
import { zCashRows, zCashTotal } from "./z-report-rows";
import type { ZReportCash } from "./types";

// The shift the API's spec walks (drawer_shift_spec.rb): float, two cash sales and a delivery, a manager's refund,
// khata in and out, an expense, a drop, a payout, cash in and out.
const cash: ZReportCash = {
  opening_minor: 100_000, cash_sales_minor: 37_120, cash_refunds_minor: 2_000, khata_collected_minor: 5_000, khata_paid_out_minor: 1_000, cash_in_minor: 500, cash_out_minor: 700,
  drops_minor: 20_000, payouts_minor: 1_500, expenses_minor: 3_000, supplier_payments_minor: 0, supplier_refunds_minor: 0, rider_float_minor: 0, other_minor: 0,
  expected_minor: 114_420, counted_minor: 114_120, over_short_minor: -300,
};

describe("zCashRows (QA B8)", () => {
  it("lists every drawer row the shift had, money out as negative, adding up to Expected", () => {
    const rows = zCashRows(cash);
    expect(rows.map((r) => [r.label, r.minor])).toEqual([
      ["Opening", 100_000], ["Cash sales", 37_120], ["Cash refunds", -2_000], ["Khata collected", 5_000], ["Khata paid out", -1_000], ["Cash in", 500], ["Cash out", -700],
      ["Drops to safe", -20_000], ["Payouts", -1_500], ["Expenses", -3_000],
    ]);
    expect(zCashTotal(rows)).toBe(cash.expected_minor);
  });

  it("keeps the four usual rows on a quiet shift and shows a signed rider float or other row", () => {
    expect(zCashRows({ opening_minor: 0, cash_sales_minor: 0, cash_in_minor: 0, cash_out_minor: 0, expected_minor: 0, counted_minor: null, over_short_minor: null }).map((r) => r.label)).toEqual(["Opening", "Cash sales", "Cash in", "Cash out"]);
    const rows = zCashRows({ ...cash, rider_float_minor: -2_000, other_minor: 150 });
    expect(rows.find((r) => r.key === "rider_float_minor")?.minor).toBe(-2_000);
    expect(zCashTotal(rows)).toBe(cash.expected_minor - 2_000 + 150);
  });

  it("reads a Z report stored before the new rows: what it has still adds up", () => {
    const old = { opening_minor: 10_000, cash_sales_minor: 95_000, cash_in_minor: 0, cash_out_minor: 0, expected_minor: 105_000, counted_minor: 104_000, over_short_minor: -1_000 };
    expect(zCashTotal(zCashRows(old))).toBe(105_000);
    expect(zCashRows(null).map((r) => r.minor)).toEqual([0, 0, 0, 0]);
  });
});
