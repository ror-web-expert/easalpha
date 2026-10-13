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
