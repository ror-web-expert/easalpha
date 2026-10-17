import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Catalog, Product } from "@/lib/types";
import { ItemGrid } from "./item-grid";

const product = (id: string, name: string, over: Partial<Product> = {}): Product => ({
  id, category_id: "c1", name, name_ur: null, description: null, sku: null, image_key: null, base_price_minor: 50000, tax_rate_id: null,
  is_favourite: false, show_online: true, active: true, sold_by_weight: false, weight_unit: null, allergens: null, dietary_tags: null,
  station_id: null, sort_order: 0, archived_at: null, updated_at: "2026-10-01T00:00:00Z", ...over,
});
const catalog = {
  generated_at: "2026-10-13T00:00:00Z", business: { id: "b1", name: "Cafe", currency: "PKR", time_zone: "Asia/Karachi", settings: {} }, branch: null,
  tax_rates: [], stations: [], menus: [], modifier_groups: [], deals: [], promotions: [], since: null,
  categories: [{ id: "c1", menu_id: "m1", name: "Mains", name_ur: null, image_key: null, sort_order: 0, show_online: true, station_id: null, product_count: 2, archived_at: null }],
  products: [product("p1", "Chicken Karahi", { is_favourite: true }), product("p2", "Doodh Patti")],
} as unknown as Catalog;

function renderGrid() {
  const onProduct = vi.fn();
  const onCode = vi.fn(() => false);
  render(<ItemGrid catalog={catalog} orderType="takeaway" onProduct={onProduct} onDeal={vi.fn()} onOpenItem={vi.fn()} canOpenItem onCode={onCode} />);
  return { onProduct, onCode, box: screen.getByPlaceholderText("Search items (F2)") };
}

afterEach(() => { document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove()); });

describe("ItemGrid search Enter", () => {
  it("ignores Enter on an empty box, so a scanner's late Enter does not add the first favourite", () => {
    const { onProduct, onCode, box } = renderGrid();
    expect(screen.getByText("Chicken Karahi")).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onProduct).not.toHaveBeenCalled();
    expect(onCode).not.toHaveBeenCalled();
  });

  it("adds the first match for typed text when it is not a code", () => {
    const { onProduct, onCode, box } = renderGrid();
    fireEvent.change(box, { target: { value: "patti" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onCode).toHaveBeenCalledWith("patti");
    expect(onProduct).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
    expect(box).toHaveValue("");
  });

  it("adds nothing behind an open dialog or sheet", () => {
    const { onProduct, onCode, box } = renderGrid();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    fireEvent.change(box, { target: { value: "8964000123456" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onCode).not.toHaveBeenCalled();
    expect(onProduct).not.toHaveBeenCalled();
  });
});

describe("tiles, quick add and the opening category (reviews 3.4 to 3.6)", () => {
  it("opens the biggest category when Favourites would not fill a row", async () => {
    const { startCategory } = await import("./item-grid");
    const cats = [{ id: "a" }, { id: "b" }];
    const prods = [{ category_id: "a" }, { category_id: "b" }, { category_id: "b" }, { category_id: "b" }];
    expect(startCategory(2, 4, cats, prods)).toBe("b");
    expect(startCategory(4, 4, cats, prods)).toBe("fav");
    expect(startCategory(0, 4, [], [])).toBe("fav");
  });

  it("offers quick add only when every choice is optional", async () => {
    const { canQuickAdd } = await import("./item-grid");
    const groups = [{ id: "g1", required: false, min_select: 0 }, { id: "g2", required: true, min_select: 1 }] as unknown as Catalog["modifier_groups"];
    expect(canQuickAdd(product("x", "Tea"), groups)).toBe(false); // no dialog at all: a plain tap already adds it
    expect(canQuickAdd(product("x", "Tea", { modifier_group_ids: ["g1"] }), groups)).toBe(true);
    expect(canQuickAdd(product("x", "Tea", { modifier_group_ids: ["g1", "g2"] }), groups)).toBe(false);
  });

  it("draws no placeholder art for a product without a photo, and the quick add button adds in one tap", () => {
    const groups = [{ id: "g1", name: "Extras", required: false, min_select: 0, max_select: null, sort_order: 0, modifiers: [] }];
    const cat2 = { ...catalog, modifier_groups: groups, products: [product("p3", "Zinger", { modifier_group_ids: ["g1"] })] } as unknown as Catalog;
    const onQuickAdd = vi.fn();
    const onProduct = vi.fn();
    const { container } = render(<ItemGrid catalog={cat2} orderType="takeaway" onProduct={onProduct} onDeal={vi.fn()} onOpenItem={vi.fn()} canOpenItem={false} onQuickAdd={onQuickAdd} />);
    expect(container.querySelector("svg path[d^='M16 7']")).toBeNull();
    expect(screen.getAllByText("Zinger")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Quick add Zinger" }));
    expect(onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "p3" }));
    expect(onProduct).not.toHaveBeenCalled();
  });
});
