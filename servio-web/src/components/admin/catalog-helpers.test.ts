import { describe, expect, it } from "vitest";
import {
  CONSUMABLE_ORDER_TYPES, copyAllOrderTypes, copyOrderType, consumablesToInputs, detectImportSource, discountLabel, discountPayload, discountProblem, discountedPriceMinor,
  imageProblem, menuExportFileName, moveItem, type ConsumableRow,
} from "./catalog-helpers";

describe("discount field", () => {
  it("accepts a blank value, a percentage up to 100 and an amount up to the base price", () => {
    expect(discountProblem("", "percent", 50000)).toBeNull();
    expect(discountProblem("10", "percent", 50000)).toBeNull();
    expect(discountProblem("100", "percent", 50000)).toBeNull();
    expect(discountProblem("500", "amount", 50000)).toBeNull();
  });

  it("rejects non-numbers, negatives, percentages above 100 and amounts above the base price", () => {
    expect(discountProblem("ten", "percent", 50000)).toMatch(/number/);
    expect(discountProblem("-5", "amount", 50000)).toMatch(/negative/);
    expect(discountProblem("101", "percent", 50000)).toMatch(/100%/);
    expect(discountProblem("600", "amount", 50000)).toMatch(/base price/);
  });

  it("formats the label as % or Rs and hides zero or missing discounts", () => {
    expect(discountLabel("10", "percent")).toBe("10%");
    expect(discountLabel("12.50", "percent")).toBe("12.5%");
    expect(discountLabel("50.00", "amount")).toBe("Rs 50");
    expect(discountLabel("0", "percent")).toBe("");
    expect(discountLabel(null, null)).toBe("");
  });

  it("computes the discounted price and never goes below zero", () => {
    expect(discountedPriceMinor(50000, "10", "percent")).toBe(45000);
    expect(discountedPriceMinor(50000, "50", "amount")).toBe(45000);
    expect(discountedPriceMinor(1000, "50", "amount")).toBe(0);
    expect(discountedPriceMinor(50000, null, null)).toBe(50000);
  });

  it("sends null for both fields when the discount is cleared", () => {
    expect(discountPayload("", "percent")).toEqual({ discount_value: null, discount_type: null });
    expect(discountPayload("0", "amount")).toEqual({ discount_value: null, discount_type: null });
    expect(discountPayload(" 15 ", "percent")).toEqual({ discount_value: "15", discount_type: "percent" });
  });
});

const row = (order_type: string, item: string, variant_id = "", quantity = "1"): ConsumableRow =>
  ({ key: `${order_type}-${item}-${variant_id}`, variant_id, order_type, stock_item_id: item, item_name: item, quantity, unit_id: "u1", unit_code: "pc" });

describe("consumables copy", () => {
  it("copy all order types repeats the source rows under every order type", () => {
    const rows = [row("takeaway", "box"), row("takeaway", "bag", "v1", "2"), row("delivery", "fuel")];
    const out = copyAllOrderTypes(rows, "takeaway");
    expect(out).toHaveLength(2 * CONSUMABLE_ORDER_TYPES.length);
    for (const ot of CONSUMABLE_ORDER_TYPES) {
      const mine = out.filter((r) => r.order_type === ot);
      expect(mine.map((r) => r.stock_item_id)).toEqual(["box", "bag"]);
      expect(mine[1].variant_id).toBe("v1");
      expect(mine[1].quantity).toBe("2");
    }
    expect(out.some((r) => r.stock_item_id === "fuel")).toBe(false);
    expect(new Set(out.map((r) => r.key)).size).toBe(out.length);
  });

  it("copy to one order type replaces only that type's rows", () => {
    const rows = [row("takeaway", "box"), row("delivery", "fuel"), row("dine_in", "napkin")];
    const out = copyOrderType(rows, "takeaway", "delivery");
    expect(out.filter((r) => r.order_type === "delivery").map((r) => r.stock_item_id)).toEqual(["box"]);
    expect(out.filter((r) => r.order_type === "dine_in").map((r) => r.stock_item_id)).toEqual(["napkin"]);
    expect(out.filter((r) => r.order_type === "takeaway")).toHaveLength(1);
    expect(copyOrderType(rows, "takeaway", "takeaway")).toBe(rows);
  });

  it("only complete rows are sent, with blank variant as null", () => {
    const rows = [row("takeaway", "box"), { ...row("takeaway", ""), stock_item_id: "" }, row("takeaway", "bag", "v1", "0")];
    expect(consumablesToInputs(rows)).toEqual([{ variant_id: null, order_type: "takeaway", stock_item_id: "box", quantity: "1", unit_id: "u1" }]);
  });
});

describe("import source detection", () => {
  it("recognises EasAlpha's own export by its format field", () => {
    expect(detectImportSource(JSON.stringify({ format: "servio_json", version: 1, menus: [] }))).toBe("servio_json");
  });

  it("treats any other JSON as an ArfaPOS export", () => {
    expect(detectImportSource(JSON.stringify({ categories: [{ name: "Burgers", items: [{ name: "Zinger", price: 450 }] }] }))).toBe("arfapos_json");
    expect(detectImportSource("[{\"name\": \"x\"}]")).toBe("arfapos_json");
    expect(detectImportSource("{ not json")).toBe("arfapos_json");
  });

  it("treats non-JSON text as CSV", () => {
    expect(detectImportSource("category,name,price\nBurgers,Zinger,450")).toBe("csv");
    expect(detectImportSource("")).toBe("csv");
  });
});

describe("misc", () => {
  it("names the menu download by date", () => {
    expect(menuExportFileName(new Date(2026, 9, 10))).toBe("servio-menu-2026-10-10.json");
    expect(menuExportFileName(new Date(2026, 0, 5))).toBe("servio-menu-2026-01-05.json");
  });

  it("checks image type and size like the API", () => {
    expect(imageProblem({ type: "image/png", size: 1000, name: "a.png" })).toBeNull();
    expect(imageProblem({ type: "image/gif", size: 1000, name: "a.gif" })).toMatch(/PNG, JPG or WEBP/);
    expect(imageProblem({ type: "image/jpeg", size: 6 * 1024 * 1024, name: "a.jpg" })).toMatch(/5 MB/);
  });

  it("moveItem reorders without mutating", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});
