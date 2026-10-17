import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PaymentMethod } from "@/lib/types";
import type { Cart } from "@/store/cart";
import type { CartLine } from "@/lib/pricing";

const h = vi.hoisted(() => ({ state: {} as Record<string, unknown>, api: vi.fn() }));
vi.mock("@/store/catalog", () => ({ useCatalogStore: Object.assign((sel: (s: Record<string, unknown>) => unknown) => sel(h.state), { getState: () => h.state }) }));
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")), api: (...a: unknown[]) => h.api(...a) }));

import { PaymentDialog } from "./payment-dialog";

const method = (code: string, kind: string, name: string, sort_order: number): PaymentMethod =>
  ({ id: `m-${code}`, code, name, kind, payment_account_id: null, active: true, works_offline: true, needs_reference: false, sort_order });
const line = (name: string, price: number): CartLine => ({ key: name, id: name, name, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false });
const order = (over: Partial<Cart> = {}): Cart => ({
  id: "o-1", saved: true, local_only: false, status: "placed", order_type: "takeaway", lines: [line("Karahi", 125600)], customer: null, table_id: null, table_code: null,
  guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: "#7", client_created_at: "2026-10-13T10:00:00Z", ...over,
});
/** The money figure shown beside a label in the totals block. */
const figure = (label: string) => screen.getAllByText(label).map((el) => el.nextElementSibling).find((n) => n?.classList.contains("tabular"))?.textContent;

beforeEach(() => {
  h.api.mockReset();
  h.state = {
    catalog: { business: { currency: "PKR", settings: { cash_rounding: 10, "modules.customer_accounts": true } }, tax_rates: [] },
    paymentMethods: [method("cash", "cash", "Cash", 0), method("card", "card", "Card", 1), method("khata", "khata", "Khata (account)", 2)],
  };
});

describe("PaymentDialog totals", () => {
  it("rounds the first cash payment only", () => {
    render(<PaymentDialog open onClose={() => {}} cart={order()} onPay={vi.fn()} busy={false} />);
    expect(figure("Total due")).toBe("Rs 1,260");
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(figure("Total due")).toBe("Rs 1,256");
  });

  it("asks for the rest of a rounded total by cash or by card, and passes the amount due it showed", async () => {
    const onPay = vi.fn(async () => {});
    render(<PaymentDialog open onClose={() => {}} cart={order({ paid_minor: 50000, rounding_minor: 400 })} onPay={onPay} busy={false} />);
    expect(figure("Amount due")).toBe("Rs 760");
    expect(figure("Rounding")).toBe("Rs 4");
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(figure("Amount due")).toBe("Rs 760");
    fireEvent.click(screen.getByRole("button", { name: /Pay Rs 760/ }));
    await waitFor(() => expect(onPay).toHaveBeenCalledWith([{ method_code: "card", amount_minor: 76000, tendered_minor: undefined, reference: undefined }], 0, 76000));
  });

  it("keeps a tip taken with an earlier payment in the total", () => {
    render(<PaymentDialog open onClose={() => {}} cart={order({ lines: [line("Karahi", 100000), line("Naan", 20000)], paid_minor: 110000, tip_minor: 10000, reopened: true })} onPay={vi.fn()} busy={false} />);
    expect(figure("Amount due")).toBe("Rs 200");
    expect(figure("Tip")).toBe("Rs 100");
    expect(figure("Total")).toBe("Rs 1,300");
  });
});

describe("PaymentDialog khata line", () => {
  it("shows only the name for a customer that came with the order, then fetches the account", async () => {
    h.api.mockResolvedValue({ id: "c-1", name: "Ali Raza", phone: "+923001112233", balance_minor: 450000, credit_limit_minor: 500000 });
    const onCustomer = vi.fn();
    const cart = order({ customer: { id: "c-1", name: "Customer", phone: null } });
    const { rerender } = render(<PaymentDialog open onClose={() => {}} cart={cart} onPay={vi.fn()} busy={false} onCustomer={onCustomer} />);
    fireEvent.click(screen.getByRole("button", { name: "Khata (account)" }));
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.queryByText(/owes nothing|no limit|after this sale/)).toBeNull();
    await waitFor(() => expect(onCustomer).toHaveBeenCalledWith({ id: "c-1", name: "Ali Raza", phone: "+923001112233", balance_minor: 450000, credit_limit_minor: 500000 }));
    expect(h.api).toHaveBeenCalledWith("/customers/c-1", { auth: "pos" });
    // Once the page puts the figures on the cart, the line and the limit warning appear.
    rerender(<PaymentDialog open onClose={() => {}} cart={{ ...cart, customer: onCustomer.mock.calls[0][0] }} onPay={vi.fn()} busy={false} onCustomer={onCustomer} />);
    expect(screen.getByText(/owes Rs 4,500 · limit Rs 5,000/)).toBeInTheDocument();
    expect(screen.getByText(/passes the limit of Rs 5,000 by Rs 756/)).toBeInTheDocument();
    expect(h.api).toHaveBeenCalledTimes(1);
  });
});
