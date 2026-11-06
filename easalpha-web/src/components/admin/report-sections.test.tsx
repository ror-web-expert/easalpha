import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { GrandReport, Shift } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { GrandSections, ShiftsTable } from "@/components/admin/report-sections";

// The shifts report's net sales are after the refunds each shift made (GET /reports/shifts, leftovers of 7 Nov 2026):
// the sales and the refunds are shown beside them, so the figures add up on screen.
const shift = (over: Partial<Shift>): Shift => ({
  id: "s1", branch_id: "b1", device_id: null, cashier_membership_id: "m1", drawer_account_id: null, business_day: "2026-11-07", status: "closed",
  settlement_status: "pending", opened_at: "2026-11-07T09:00:00Z", closed_at: "2026-11-07T17:00:00Z", opening_cash_minor: 0, counted_cash_minor: 146_600,
  approved_by_membership_id: null, close_note: null, movements: [], expected_cash_minor: 146_600, over_short_minor: 0, cashier: "Asad",
  sales_minor: 156_600, refunds_minor: 10_000, net_sales_minor: 146_600, ...over,
});

const grand = (shifts: Shift[]): GrandReport => ({
  from: "2026-11-07", to: "2026-11-07", by_day: [], items: [], categories: [], cashiers: [], shifts,
  overview: { from: "2026-11-07", to: "2026-11-07", orders: 0, revenue_minor: 0, subtotal_minor: 0, discount_minor: 0, tax_minor: 0, service_charge_minor: 0, tips_minor: 0, refunds_minor: 0,
              average_order_minor: 0, voided: 0, voided_minor: 0, staff_meals: 0, open: 0, open_minor: 0, by_payment_method: {}, by_order_type: {}, by_source: {}, customers: 0 },
  voids: { count: 0, amount_minor: 0 }, discounts: { count: 0, amount_minor: 0, by_reason: {} },
} as unknown as GrandReport);

afterEach(cleanup);

describe("Shift sales, refunds and net sales", () => {
  it("lists each shift's sales, refunds and net sales in the shifts table", () => {
    render(<ShiftsTable rows={[shift({}), shift({ id: "s2", status: "open", sales_minor: 9_280, refunds_minor: 52_200, net_sales_minor: -42_920, counted_cash_minor: null, over_short_minor: null })]} />);
    const header = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(header).toEqual(["Cashier", "Opened", "Status", "Sales", "Refunds", "Net sales", "Expected", "Counted", "Over / short"]);
    const [, closed, open] = screen.getAllByRole("row");
    expect(within(closed).getAllByRole("cell").slice(3, 6).map((c) => c.textContent)).toEqual([formatMoney(156_600), formatMoney(10_000), formatMoney(146_600)]);
    expect(within(open).getAllByRole("cell").slice(3, 6).map((c) => c.textContent)).toEqual([formatMoney(9_280), formatMoney(52_200), formatMoney(-42_920)]);
  });

  it("shows the refunds on a Grand report shift card only when the shift made some", () => {
    render(<GrandSections g={grand([shift({}), shift({ id: "s2", cashier: "Bilal", sales_minor: 9_280, refunds_minor: 0, net_sales_minor: 9_280 })])} heading={false} />);
    const asad = screen.getByText("Asad · Closed").parentElement as HTMLElement;
    expect(within(asad).getByText("Sales").nextSibling?.textContent).toBe(formatMoney(156_600));
    expect(within(asad).getByText("Refunds").nextSibling?.textContent).toBe(formatMoney(10_000));
    expect(within(asad).getByText("Net sales").nextSibling?.textContent).toBe(formatMoney(146_600));
    const bilal = screen.getByText("Bilal · Closed").parentElement as HTMLElement;
    expect(within(bilal).queryByText("Refunds")).toBeNull();
    expect(within(bilal).getByText("Net sales").nextSibling?.textContent).toBe(formatMoney(9_280));
  });
});
