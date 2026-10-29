import { describe, expect, it } from "vitest";
import { amountLine, diffLines, hourLabel, monthGrid, openOrdersPill, orderCode, paymentMethods, periodRange, reopenLine, specPaymentVariant, specStatusVariant, storyLines } from "./order-helpers";

describe("order story lines", () => {
  it("formats the item diff the way the SPEC shows it", () => {
    expect(diffLines({ added: [{ name: "Cold Drink (1.5 Ltr)", quantity: "1.0" }], removed: [{ name: "Chai", quantity: "1.0" }], changed: [{ name: "Chai", from: "2.0", to: "1.0" }] }))
      .toEqual(["+ Cold Drink (1.5 Ltr) × 1", "− Chai × 1", "Chai 2 → 1"]);
    expect(diffLines(null)).toEqual([]);
  });

  it("formats the money diff with formatMoney and skips it when the amount did not move", () => {
    expect(amountLine(98000, 123000)).toBe("amount due Rs 980 → Rs 1,230");
    expect(amountLine(98000, 98000)).toBeNull();
    expect(amountLine(null, 123000)).toBeNull();
  });

  it("puts the diff first, then the money line, then the note", () => {
    expect(storyLines({ diff: { added: [{ name: "Cold Drink", quantity: "1" }], removed: [], changed: [] }, amount_before: 98000, amount_after: 123000, note: "Customer asked" }))
      .toEqual(["+ Cold Drink × 1", "amount due Rs 980 → Rs 1,230", "Customer asked"]);
    expect(storyLines({ diff: null, amount_before: null, amount_after: null, note: null })).toEqual([]);
  });

  it("writes the reopen-and-edit header line", () => {
    expect(reopenLine(0, 0)).toBeNull();
    expect(reopenLine(1, 0)).toBe("Reopened 1 time");
    expect(reopenLine(2, 3)).toBe("Reopened 2 times and edited 3 times");
    expect(reopenLine(0, 1)).toBe("Edited 1 time");
  });
});

describe("badges and labels", () => {
  it("maps SPEC statuses to badge variants", () => {
    expect(specStatusVariant("pending")).toBe("warning");
    expect(specStatusVariant("preparing")).toBe("info");
    expect(specStatusVariant("ready")).toBe("success");
    expect(specStatusVariant("completed")).toBe("primary");
    expect(specStatusVariant("cancelled")).toBe("danger");
    expect(specStatusVariant("other")).toBe("neutral");
  });

  it("maps SPEC payment statuses to badge variants", () => {
    expect(specPaymentVariant("paid")).toBe("success");
    expect(specPaymentVariant("unpaid")).toBe("danger");
    expect(specPaymentVariant("account")).toBe("info");
    expect(specPaymentVariant("complimentary")).toBe("accent");
  });

  it("prefers the receipt number as the order code and parses the payment summary", () => {
    expect(orderCode({ receipt_number: "R-12", till_serial: "T-3" })).toBe("R-12");
    expect(orderCode({ receipt_number: null, till_serial: "T-3" })).toBe("T-3");
    expect(paymentMethods("cash:50000,card:20000")).toBe("Cash Rs 500, Card Rs 200");
    expect(paymentMethods(null)).toBe("");
  });

  it("builds the open-orders pill text", () => {
    expect(openOrdersPill(22, 80)).toBe("22 open orders today · 80 from previous days");
    expect(openOrdersPill(1, 0)).toBe("1 open order today");
    expect(openOrdersPill(0, 67)).toBe("67 open from earlier days");
  });
});

describe("dashboard period", () => {
  const today = "2026-10-10";
  it("turns each preset into the business-day range the API uses", () => {
    expect(periodRange("today", today)).toEqual({ from: "2026-10-10", to: "2026-10-10" });
    expect(periodRange("yesterday", today)).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(periodRange("7d", today)).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    expect(periodRange("30d", today)).toEqual({ from: "2026-09-11", to: "2026-10-10" });
    expect(periodRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(periodRange("custom", today, { from: "2026-02-01", to: "2026-02-10" })).toEqual({ from: "2026-02-01", to: "2026-02-10" });
  });

  it("labels hours in 12-hour form", () => {
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(9)).toBe("9 am");
    expect(hourLabel(13)).toBe("1 pm");
  });
});

describe("pending orders calendar", () => {
  it("lays out a month in Monday-first weeks with the open count on each day", () => {
    const weeks = monthGrid("2026-10-01", [{ day: "2026-10-10", count: 3 }, { day: "2026-09-30", count: 1 }]);
    expect(weeks.length).toBe(5);
    expect(weeks[0][0].day).toBe("2026-09-28");
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][2]).toEqual({ day: "2026-09-30", inMonth: false, count: 1 });
    const tenth = weeks.flat().find((c) => c.day === "2026-10-10");
    expect(tenth).toEqual({ day: "2026-10-10", inMonth: true, count: 3 });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});
