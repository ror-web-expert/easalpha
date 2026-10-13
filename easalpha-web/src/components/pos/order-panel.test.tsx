import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Cart } from "@/store/cart";
import type { CartLine } from "@/lib/pricing";
import { OrderPanel } from "./order-panel";

const line = (name: string, price: number): CartLine => ({ key: name, id: name, name, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false });
const order = (over: Partial<Cart> = {}): Cart => ({
  id: "o-1", saved: true, local_only: false, status: "placed", order_type: "takeaway", lines: [line("Karahi", 125600)], customer: null, table_id: null, table_code: null,
  guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: "#7", client_created_at: "2026-10-13T10:00:00Z", ...over,
});
const panel = (cart: Cart, extra: { onPlaceUnpaid?: () => void } = {}) => render(
  <OrderPanel cart={cart} currency="PKR" settings={{ cash_rounding: 10 }} onQty={vi.fn()} onEditLine={vi.fn()} onOverride={vi.fn()} onRemove={vi.fn()} onCustomer={vi.fn()} onTable={vi.fn()}
    onNotes={vi.fn()} onStaffMeal={vi.fn()} onHold={vi.fn()} onSend={vi.fn()} onPay={vi.fn()} onNew={vi.fn()} canOverride {...extra} />,
);
const figure = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe("OrderPanel", () => {
  it("counts the rounding and tip earlier payments stored in what is still due", () => {
    panel(order({ paid_minor: 50000, rounding_minor: 400, tip_minor: 5000 }));
    expect(figure("Cash rounding")).toBe("Rs 4");
    expect(figure("Tip")).toBe("Rs 50");
    expect(figure("Total")).toBe("Rs 1,310");
    expect(figure("Due")).toBe("Rs 810");
  });

  it("draws Place unpaid after Pay on a short screen, so Hold, Kitchen and Pay share one row", () => {
    panel(order(), { onPlaceUnpaid: vi.fn() });
    const unpaid = screen.getByRole("button", { name: /Place unpaid/ });
    expect(unpaid.className).toContain("[@media(max-height:700px)]:order-last");
    expect(unpaid.className).toContain("[@media(max-height:700px)]:col-span-3");
    expect(screen.getByRole("button", { name: /^Pay/ }).className).toContain("[@media(max-height:700px)]:col-span-1");
  });
});

describe("OrderPanel heading", () => {
  it("calls a saved but unplaced order a new order instead of 'draft draft'", () => {
    panel(order({ label: "draft", status: "draft" }));
    expect(screen.getByText("New order")).toBeInTheDocument();
    expect(screen.getByText("not placed")).toBeInTheDocument();
    expect(screen.queryByText("draft")).toBeNull();
  });
});
