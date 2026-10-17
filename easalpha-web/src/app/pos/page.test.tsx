import { forwardRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";

// The sell screen with its heavy children stubbed: what matters here is the paused flag it hands the barcode scanner.
const h = vi.hoisted(() => ({
  paused: [] as boolean[],
  hold: (() => Promise.resolve({})) as () => Promise<unknown>,
  approvalOpen: false,
  router: { replace: () => {}, push: () => {} },
  params: new URLSearchParams(),
  catalog: { business: { name: "Cafe", currency: "PKR", settings: {} }, branch: null, products: [], modifier_groups: [], deals: [], tax_rates: [], quick_add_items: [] },
  session: { user: { name: "Ayesha" }, permissions: ["orders.create", "payments.take"], membership: { id: "m-1", staff_type: "cashier" } },
}));
const product = (id: string, over: Partial<Product> = {}) => ({ id, name: id, base_price_minor: 10000, variants: [], modifier_group_ids: [], prices: [], station_id: null, active: true, archived_at: null, ...over }) as unknown as Product;
const tea = product("Tea");
const pizza = product("Pizza", { variants: [{ id: "v-1", name: "Small", price_minor: 90000 }] as Product["variants"] });

vi.mock("next/navigation", () => ({ useRouter: () => h.router, useSearchParams: () => h.params }));
vi.mock("@/store/catalog", () => {
  const state = { catalog: h.catalog, tables: [], refreshTables: () => {}, refresh: async () => {}, paymentMethods: [] };
  return { useCatalogStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});
vi.mock("@/store/device", () => {
  const state = { session: h.session };
  return { useDeviceStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }), usePosCan: () => () => true };
});
vi.mock("@/components/pos/scanner", () => ({
  useTillScanner: (o: { paused?: boolean }) => { h.paused.push(!!o.paused); return { lookupTyped: () => false, cameraButton: null, dialogs: null }; },
}));
vi.mock("@/components/pos/shell", () => ({ PosShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/pos/item-grid", () => ({
  ItemGrid: forwardRef<HTMLInputElement, { onProduct: (p: Product) => void }>(function ItemGrid({ onProduct }, ref) {
    return <div><input ref={ref} aria-label="Search" /><button onClick={() => onProduct(tea)}>Add tea</button><button onClick={() => onProduct(pizza)}>Add pizza</button></div>;
  }),
}));
vi.mock("@/components/pos/quick-add-bar", () => ({ QuickAddBar: () => null }));
vi.mock("@/components/pos/modifier-sheet", () => ({ ModifierSheet: ({ product: p, onClose }: { product: Product | null; onClose: () => void }) => (p ? <button onClick={onClose}>Close sheet</button> : null) }));
vi.mock("@/components/pos/dialogs", () => ({
  CustomerDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) => (open ? <button onClick={onClose}>Close customer</button> : null),
  OpenItemDialog: () => null, PriceOverrideDialog: () => null, StaffMealDialog: () => null, TablePicker: () => null,
}));
vi.mock("@/components/pos/payment-dialog", () => ({ PaymentDialog: () => null }));
vi.mock("@/components/pos/receipt-dialog", () => ({ ReceiptDialog: () => null }));
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: (pin?: string) => Promise<unknown>) => fn(), dialog: null, open: h.approvalOpen }) }));
vi.mock("@/lib/pos-actions", () => ({
  holdOrder: () => h.hold(), payOrder: vi.fn(), saveOrder: vi.fn(), loadOrderForEdit: vi.fn(), completeUnpaid: vi.fn(), applyTaxChoice: vi.fn(),
  applyServerDiscount: vi.fn(), syncForPayment: vi.fn(), TotalChangedError: class extends Error {}, regularPricing: (c: unknown) => c,
}));

import PosPage from "./page";
import { useCartStore } from "@/store/cart";

const paused = () => h.paused[h.paused.length - 1];

beforeEach(() => {
  h.paused.length = 0;
  h.approvalOpen = false;
  useCartStore.getState().reset("takeaway");
});

describe("the sell screen pauses the barcode scanner", () => {
  it("while the options sheet or a dialog is open", () => {
    render(<PosPage />);
    expect(paused()).toBe(false);
    fireEvent.click(screen.getByText("Add pizza"));
    expect(paused()).toBe(true);
    fireEvent.click(screen.getByText("Close sheet"));
    expect(paused()).toBe(false);
    fireEvent.keyDown(window, { key: "F3" });
    expect(paused()).toBe(true);
    fireEvent.click(screen.getByText("Close customer"));
    expect(paused()).toBe(false);
    fireEvent.click(screen.getByTitle("Order notes"));
    expect(paused()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(paused()).toBe(false);
  });

  it("while the manager PIN dialog is open", () => {
    const { rerender } = render(<PosPage />);
    expect(paused()).toBe(false);
    h.approvalOpen = true;
    rerender(<PosPage />);
    expect(paused()).toBe(true);
  });

  it("while a save runs, so a scanned item is not dropped when the cart is cleared", async () => {
    render(<PosPage />);
    fireEvent.click(screen.getByText("Add tea"));
    let finish = () => {};
    h.hold = () => new Promise((resolve) => { finish = () => resolve({}); });
    fireEvent.click(screen.getByRole("button", { name: /Hold/ }));
    expect(paused()).toBe(true);
    await act(async () => finish());
    expect(paused()).toBe(false);
    expect(useCartStore.getState().cart.lines).toEqual([]);
  });
});
