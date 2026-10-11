import { describe, expect, it } from "vitest";
import { cleanItems, kindLabel, moveItem, nextItemKey, progressPct, runStatus, sameItems } from "./checklists-helpers";

describe("progressPct", () => {
  it("rounds to a whole percentage and never exceeds 100", () => {
    expect(progressPct(0, 6)).toBe(0);
    expect(progressPct(1, 3)).toBe(33);
    expect(progressPct(6, 6)).toBe(100);
    expect(progressPct(7, 6)).toBe(100);
  });
  it("is 0 for an empty checklist", () => {
    expect(progressPct(0, 0)).toBe(0);
  });
});

describe("runStatus", () => {
  it("tells complete, in progress and not started apart", () => {
    expect(runStatus({ completed_at: "2026-10-11T04:00:00Z", done_count: 6 })).toBe("complete");
    expect(runStatus({ completed_at: null, done_count: 2 })).toBe("in_progress");
    expect(runStatus({ completed_at: null, done_count: 0 })).toBe("not_started");
  });
});

describe("template editing", () => {
  const items = [{ key: "item_1", label: "Count the float" }, { key: "item_2", label: "Switch on" }, { key: "item_3", label: "Check fridges" }];
  it("labels kinds in plain English", () => {
    expect(kindLabel("opening")).toBe("Opening");
    expect(kindLabel("closing")).toBe("Closing");
  });
  it("picks a key no item already uses", () => {
    expect(nextItemKey(items)).toBe("item_4");
    expect(nextItemKey([{ key: "item_1", label: "a" }, { key: "item_4", label: "b" }])).toBe("item_3");
    expect(nextItemKey([{ key: "item_2", label: "a" }])).toBe("item_3");
    expect(nextItemKey([])).toBe("item_1");
  });
  it("moves an item up or down and leaves the ends alone", () => {
    expect(moveItem(items, 1, -1).map((i) => i.key)).toEqual(["item_2", "item_1", "item_3"]);
    expect(moveItem(items, 1, 1).map((i) => i.key)).toEqual(["item_1", "item_3", "item_2"]);
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 1, 1)).not.toBe(items);
  });
  it("trims labels and drops blank rows before saving", () => {
    expect(cleanItems([{ key: "item_1", label: "  Count  " }, { key: "item_2", label: "   " }])).toEqual([{ key: "item_1", label: "Count" }]);
  });
  it("detects unsaved changes", () => {
    expect(sameItems(items, [...items])).toBe(true);
    expect(sameItems(items, moveItem(items, 0, 1))).toBe(false);
    expect(sameItems(items, items.slice(0, 2))).toBe(false);
    expect(sameItems(items, items.map((i, n) => (n === 0 ? { ...i, label: "Changed" } : i)))).toBe(false);
  });
});
