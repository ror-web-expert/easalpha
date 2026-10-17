import { describe, expect, it } from "vitest";
import { ACCENT, SERIES, STATUS_TONES, barColor, breakdownColor, lineColor, seriesColor, statusColor } from "./series";

describe("chart series colours", () => {
  it("follows the palette order navy, orange, teal, amber, pink, green, violet, red and wraps after eight", () => {
    expect(SERIES).toHaveLength(8);
    expect(seriesColor(0)).toBe("var(--chart-1)");
    expect(seriesColor(1)).toBe("var(--chart-2)");
    expect(seriesColor(8)).toBe("var(--chart-1)");
  });
  it("draws a lone line in navy and a lone bar in orange, several series in palette order", () => {
    expect(lineColor(0, 1)).toBe("var(--chart-1)");
    expect(barColor(0, 1)).toBe(ACCENT);
    expect([0, 1, 2].map((i) => barColor(i, 3))).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]);
    expect([0, 1].map((i) => lineColor(i, 2))).toEqual(["var(--chart-1)", "var(--chart-2)"]);
  });
  it("tones statuses by state and ignores case, underscores and counts", () => {
    expect(statusColor("Completed")).toBe(STATUS_TONES.success);
    expect(statusColor("paid")).toBe(STATUS_TONES.success);
    expect(statusColor("Preparing")).toBe(STATUS_TONES.warning);
    expect(statusColor("Dispatched")).toBe(STATUS_TONES.info);
    expect(statusColor("cancelled (3)")).toBe(STATUS_TONES.danger);
    expect(statusColor("refunded")).toBe(STATUS_TONES.danger);
    expect(statusColor("Complimentary")).toBe(STATUS_TONES.note);
    expect(statusColor("un_paid".replace("_", ""))).toBe(STATUS_TONES.note);
    expect(statusColor("Cash")).toBeUndefined();
  });
  it("breakdown rows use the palette unless colorBy is status and the label is a known state", () => {
    expect(breakdownColor("Beverages", 2)).toBe("var(--chart-3)");
    expect(breakdownColor("Completed", 0, "palette")).toBe("var(--chart-1)");
    expect(breakdownColor("Completed", 0, "status")).toBe(STATUS_TONES.success);
    expect(breakdownColor("Cash", 1, "status")).toBe("var(--chart-2)");
  });
});

describe("endAtLastData", () => {
  it("nulls only the trailing empty rows, keeping zeros in the middle", async () => {
    const { endAtLastData, allZero } = await import("./series");
    const rows = [{ d: "1", a: 5, b: 0 }, { d: "2", a: 0, b: 0 }, { d: "3", a: 0, b: 2 }, { d: "4", a: 0, b: 0 }, { d: "5", a: 0, b: 0 }];
    const out = endAtLastData(rows, ["a", "b"]);
    expect(out.map((r) => r.a)).toEqual([5, 0, 0, null, null]);
    expect(out.map((r) => r.b)).toEqual([0, 0, 2, null, null]);
    expect(out[4].d).toBe("5");
    const full = rows.slice(0, 3);
    expect(endAtLastData(full, ["a", "b"])).toBe(full);
    expect(allZero(rows.slice(3), ["a", "b"])).toBe(true);
    expect(allZero(rows, ["a", "b"])).toBe(false);
  });
});
