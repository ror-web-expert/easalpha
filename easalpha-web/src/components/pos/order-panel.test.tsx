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
const panel = (cart: Cart, extra: { onPlaceUnpaid?: () => void; onAddress?: () => void } = {}) => render(
  <OrderPanel cart={cart} currency="PKR" settings={{ cash_rounding: 10 }} onQty={vi.fn()} onEditLine={vi.fn()} onOverride={vi.fn()} onRemove={vi.fn()} onCustomer={vi.fn()} onTable={vi.fn()}
    onNotes={vi.fn()} onStaffMeal={vi.fn()} onHold={vi.fn()} onSend={vi.fn()} onPay={vi.fn()} onNew={vi.fn()} canOverride {...extra} />,
);
const figure = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe("OrderPanel", () => {
  it("counts the rounding and tip earlier payments stored in what is still due", () => {
    panel(order({ paid_minor: 50000, rounding_minor: 400, tip_minor: 5000 }));
    expect(figure("Rounding")).toBe("Rs 4");
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
    expect(screen.getByText(/not placed/i)).toBeInTheDocument();
    expect(screen.queryByText("draft")).toBeNull();
  });
});

// T3/F3: a delivery shows where it goes and its zone; the charge line names the zone.
describe("OrderPanel delivery address", () => {
  it("shows the address and zone of a delivery, opens the picker, and names the zone on the charge", () => {
    const onAddress = vi.fn();
    panel(order({ order_type: "delivery", address_id: "a1", address_text: "House 12, Phase 5 DHA", zone_name: "DHA", delivery_charge_minor: 15000, delivery_charge_percent: 0 }), { onAddress });
    const row = screen.getByRole("button", { name: /House 12, Phase 5 DHA/ });
    expect(row).toHaveTextContent("DHA");
    row.click();
    expect(onAddress).toHaveBeenCalled();
    expect(figure("Delivery (DHA)")).toBe("Rs 150");
  });

  it("asks for an address on a delivery without one", () => {
    panel(order({ order_type: "delivery" }), { onAddress: vi.fn() });
    expect(screen.getByRole("button", { name: /Delivery address/ })).toBeInTheDocument();
  });

  it("shows no address row on a takeaway", () => {
    panel(order(), { onAddress: vi.fn() });
    expect(screen.queryByRole("button", { name: /Delivery address/ })).toBeNull();
  });
});
