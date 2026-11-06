import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZReportView } from "./z-report";
import type { ZReport } from "@/lib/types";

const z: ZReport = {
  shift_id: "s1", business_day: "2026-11-06", opened_at: "2026-11-06T08:00:00Z", closed_at: "2026-11-06T16:00:00Z", cashier: "Ali",
  orders: { total: 3, paid: 3, voided: 0, open: 0, staff_meals: 0 },
  sales: { gross_minor: 16_000, discount_minor: 0, service_charge_minor: 0, tax_minor: 2_560, rounding_minor: 0, tips_minor: 0, net_minor: 18_560 },
  by_payment_method: { cash: 18_560 }, by_order_type: { walk_in: 18_560 },
  refunds: { count: 1, amount_minor: 2_000 }, voids: { count: 0, amount_minor: 0 }, discounts: { count: 0, amount_minor: 0 },
  cash: { opening_minor: 100_000, cash_sales_minor: 18_500, cash_refunds_minor: 2_000, khata_collected_minor: 5_000, cash_in_minor: 0, cash_out_minor: 0, drops_minor: 20_000, payouts_minor: 1_500,
          expenses_minor: 3_000, expected_minor: 97_000, counted_minor: 96_700, over_short_minor: -300 },
  khata: { collected_minor: 5_000, on_account_minor: 0 }, movements: [],
};

describe("ZReportView (QA T7, B8)", () => {
  it("shows every drawer row of the shift, Expected, and the count with its short", () => {
    render(<ZReportView z={z} currency="PKR" />);
    for (const [label, value] of [["Cash refunds", "-Rs 20"], ["Khata collected", "Rs 50"], ["Drops to safe", "-Rs 200"], ["Payouts", "-Rs 15"], ["Expenses", "-Rs 30"], ["Counted", "Rs 967"], ["Short", "Rs 3"]]) {
      expect(screen.getByText(label).nextSibling).toHaveTextContent(value);
    }
    expect(screen.getByText("Expected").nextSibling).toHaveTextContent("Rs 970");
  });

  it("hides Expected and the over or short on a blind screen, but keeps the rows", () => {
    render(<ZReportView z={z} currency="PKR" hideExpected />);
    expect(screen.queryByText("Expected")).toBeNull();
    expect(screen.queryByText("Short")).toBeNull();
    expect(screen.getByText("Drops to safe")).toBeInTheDocument();
  });
});
