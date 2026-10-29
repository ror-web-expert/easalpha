import { describe, expect, it } from "vitest";
import { figureTone, initials, marginLabel, marginTone, orderTypeLabel, profitTone, shareOfCost, tileHue } from "./catalog-grid-helpers";

describe("catalog grid helpers", () => {
  it("names order types for people", () => {
    expect(orderTypeLabel("dine_in")).toBe("Dine-in");
    expect(orderTypeLabel("walk_in")).toBe("Walk-in");
    expect(orderTypeLabel("drive_thru")).toBe("Drive Thru");
  });

  it("gives a no-photo tile a stable colour and initials", () => {
    expect(tileHue("Chicken Karahi")).toBe(tileHue("Chicken Karahi"));
    expect(tileHue("Chai")).toBeGreaterThanOrEqual(0);
    expect(tileHue("Chai")).toBeLessThan(360);
    expect(initials("Chicken Karahi (full)")).toBe("CK");
    expect(initials("chai")).toBe("C");
    expect(initials("  ")).toBe("?");
  });

  it("colours the margin badge by profit and the food-cost target, and hides it without a recipe", () => {
    expect(marginTone(null)).toBeNull();
    expect(marginTone({ cost_minor: 0, margin_percent: null, food_cost_percent: null, over_target: false, variant_name: null })).toBeNull();
    expect(marginTone({ cost_minor: 10_000, margin_percent: 77.8, food_cost_percent: 22.2, over_target: false, variant_name: null })).toBe("success");
    expect(marginTone({ cost_minor: 20_000, margin_percent: 55.6, food_cost_percent: 44.4, over_target: true, variant_name: null })).toBe("warning");
    expect(marginTone({ cost_minor: 50_000, margin_percent: -11.1, food_cost_percent: 111.1, over_target: true, variant_name: null })).toBe("danger");
    expect(marginLabel({ cost_minor: 10_000, margin_percent: 77.8, food_cost_percent: 22.2, over_target: false, variant_name: null })).toBe("78% margin");
    expect(marginLabel(undefined)).toBeNull();
    expect(figureTone(null, false)).toBe("neutral");
    expect(figureTone(0, false)).toBe("danger");
    expect(figureTone(30, true)).toBe("warning");
    expect(profitTone(null)).toBe("neutral");
    expect(profitTone(1)).toBe("success");
    expect(profitTone(-1)).toBe("danger");
  });

  it("splits the ingredient cost into whole-percent shares", () => {
    const lines = [ { item_name: "Chicken", quantity: "150", unit_code: "g", cost_minor: 7_500 }, { item_name: "Bun", quantity: "1", unit_code: "pcs", cost_minor: 2_500 } ];
    expect(shareOfCost(lines)).toEqual([ 75, 25 ]);
    expect(shareOfCost([])).toEqual([]);
    expect(shareOfCost([ { item_name: "Free", quantity: "1", unit_code: "pcs", cost_minor: 0 } ])).toEqual([ 0 ]);
  });
});
