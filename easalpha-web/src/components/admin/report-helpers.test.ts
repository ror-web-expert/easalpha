import { describe, expect, it } from "vitest";
import {
  buildCalendarGrid, columnsFor, flattenRow, flattenRows, hourLabel, marginTone, methodTotalsText, monthLabel, pctOf, revenueLines, shareWidth, shiftMonth,
  suggestionLabel, suggestionTone, taxAndTips, urgencyLabel, urgencyTone, weekColumn,
} from "./report-helpers";

describe("revenueLines", () => {
  it("runs from gross sales to net sales, the lines above Net sales adding up to it, with tax and tips beside it as not income", () => {
    // Finance::ProfitLoss for a day with a Rs 50 tip, a refund whose sales share is Rs 86.21 and Rs 2.80 of cash rounding.
    const r = { revenue_minor: 99120, gross_sales_minor: 90000, discounts_minor: 0, service_charge_minor: 0, delivery_charge_minor: 0, tips_minor: 5000,
      rounding_minor: -280, refunds_minor: 8621, net_sales_minor: 81099, tax_collected_minor: 13021 };
    const lines = revenueLines(r);
    expect(lines.map((l) => l.label)).toEqual(["Gross sales", "Discounts", "Service charge", "Delivery charge", "Rounding", "Refunds", "Net sales"]);
    const net = lines.at(-1)!;
    expect(net).toMatchObject({ minor: 81099, strong: true });
    expect(lines.slice(0, -1).reduce((s, l) => s + l.minor, 0)).toBe(net.minor);
    // What customers paid is net sales plus what was collected for others.
    const beside = taxAndTips(r);
    expect(beside.map((l) => l.label)).toEqual(["Tax collected", "Tips"]);
    expect(net.minor + beside.reduce((s, l) => s + l.minor, 0)).toBe(r.revenue_minor);
  });
});

describe("shareWidth", () => {
  it("clamps to the bar and keeps a sliver for small shares", () => {
    expect(shareWidth(0)).toBe("0%");
    expect(shareWidth(null)).toBe("0%");
    expect(shareWidth(0.4)).toBe("2%");
    expect(shareWidth(37.5)).toBe("37.5%");
    expect(shareWidth(140)).toBe("100%");
  });
  it("pctOf is zero on an empty total", () => {
    expect(pctOf(5, 0)).toBe(0);
    expect(pctOf(1, 3)).toBe(33.3);
  });
});

describe("calendar grid", () => {
  const day = (date: string, wday: number) => ({ date, wday, orders: 1, revenue_minor: 100 });
  it("is Monday first", () => {
    expect(weekColumn(1)).toBe(0);
    expect(weekColumn(0)).toBe(6);
  });
  it("pads leading blanks by the first weekday and fills the last week", () => {
    // 1 Oct 2026 is a Thursday (wday 4): three blanks before it.
    const days = Array.from({ length: 31 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, (4 + i) % 7));
    const grid = buildCalendarGrid(days);
    expect(grid[0].slice(0, 3)).toEqual([null, null, null]);
    expect(grid[0][3]?.date).toBe("2026-10-01");
    expect(grid.every((r) => r.length === 7)).toBe(true);
    expect(grid.length).toBe(5);
    expect(grid[4][5]?.date).toBe("2026-10-31");
    expect(grid[4][6]).toBeNull();
  });
  it("needs no leading blanks when the month starts on Monday", () => {
    const grid = buildCalendarGrid([day("2026-06-01", 1), day("2026-06-02", 2)]);
    expect(grid[0][0]?.date).toBe("2026-06-01");
    expect(grid[0].filter(Boolean)).toHaveLength(2);
  });
  it("returns nothing for no days", () => {
    expect(buildCalendarGrid([])).toEqual([]);
  });
  it("shifts months across the year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("AI badges", () => {
  it("labels and tones each pricing suggestion", () => {
    expect(suggestionLabel("raise_price")).toBe("Raise price");
    expect(suggestionLabel("promote")).toBe("Promote");
    expect(suggestionLabel("review_cost")).toBe("Review cost");
    expect(suggestionLabel(null)).toBe("-");
    expect(suggestionTone("raise_price")).toBe("success");
    expect(suggestionTone("promote")).toBe("info");
    expect(suggestionTone("review_cost")).toBe("warning");
    expect(suggestionTone("ok")).toBe("neutral");
  });
  it("tones stock urgency", () => {
    expect(urgencyTone("critical")).toBe("danger");
    expect(urgencyTone("soon")).toBe("warning");
    expect(urgencyTone("ok")).toBe("success");
    expect(urgencyLabel("ok")).toBe("Covered");
  });
  it("tones margins", () => {
    expect(marginTone(null)).toBe("neutral");
    expect(marginTone(-3)).toBe("danger");
    expect(marginTone(10)).toBe("warning");
    expect(marginTone(35)).toBe("info");
    expect(marginTone(60)).toBe("success");
  });
  it("labels hours", () => {
    expect(hourLabel(0)).toBe("12am");
    expect(hourLabel(13)).toBe("1pm");
    expect(hourLabel(null)).toBe("-");
  });
});

describe("CSV flattening", () => {
  it("flattens nested objects, formats money and joins or counts arrays", () => {
    const flat = flattenRow({ batch: { name: "Eid", public_code: "EID10" }, amount_minor: 150000, tags: ["a", "b"], tickets: [{ kind: "x" }, { kind: "y" }], missing: null });
    expect(flat).toEqual({ batch_name: "Eid", batch_public_code: "EID10", amount_minor: "Rs 1,500", tags: "a, b", tickets: 2, missing: null });
  });
  it("builds readable headers from the union of keys", () => {
    const rows = flattenRows([{ name: "a", total_minor: 100 }, { name: "b", note: "x" }]);
    expect(columnsFor(rows)).toEqual([{ header: "Name", key: "name" }, { header: "Total", key: "total_minor" }, { header: "Note", key: "note" }]);
  });
  it("writes by-method totals largest first", () => {
    expect(methodTotalsText({ cash: 100, bank_transfer: 500 })).toBe("bank transfer Rs 5, cash Rs 1");
    expect(methodTotalsText(null)).toBe("");
  });
});
