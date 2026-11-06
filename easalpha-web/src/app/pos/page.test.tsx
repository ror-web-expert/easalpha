import { forwardRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";

// The sell screen with its heavy children stubbed: what matters here is the paused flag it hands the barcode scanner.
const h = vi.hoisted(() => ({
  paused: [] as boolean[],
  hold: (() => Promise.resolve({})) as () => Promise<unknown>,
  approvalOpen: false,
  /** The labels the screen gave the manager PIN dialog. */
  labels: [] as (string | undefined)[],
  /** Permission codes the signed-in cashier lacks. */
  lacks: [] as string[],
  router: { replace: () => {}, push: vi.fn() },
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
  return { useDeviceStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }), usePosCan: () => (...codes: string[]) => codes.some((c) => !h.lacks.includes(c)) };
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
  OpenItemDialog: () => null, PriceOverrideDialog: () => null, TablePicker: () => null,
  StaffMealDialog: ({ open, onConfirm }: { open: boolean; onConfirm: (reason: string) => void }) => (open ? <button onClick={() => onConfirm("Rider")}>Confirm staff meal</button> : null),
}));
vi.mock("@/components/pos/payment-dialog", () => ({
  PaymentDialog: ({ open, onPay }: { open: boolean; onPay: (p: unknown[], tip: number, due: number) => Promise<void> }) => (open ? <button onClick={() => void onPay([{ method_code: "cash", amount_minor: 10000, tendered_minor: 10000 }], 0, 10000)}>Pay now</button> : null),
}));
vi.mock("@/components/pos/receipt-dialog", () => ({ ReceiptDialog: ({ receipt }: { receipt: unknown }) => (receipt ? <div>Receipt on screen</div> : null) }));
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: (pin?: string) => Promise<unknown>, label?: string) => { h.labels.push(label); return fn(); }, dialog: null, open: h.approvalOpen }) }));
vi.mock("@/lib/pos-actions", () => ({
  holdOrder: () => h.hold(), payOrder: vi.fn(), saveOrder: vi.fn(), loadOrderForEdit: vi.fn(), completeUnpaid: vi.fn(), applyTaxChoice: vi.fn(),
  applyServerDiscount: vi.fn(), syncForPayment: vi.fn(), TotalChangedError: class extends Error {}, regularPricing: (c: unknown) => c, payStep: () => "payment",
}));

import PosPage from "./page";
import { useCartStore } from "@/store/cart";
import { useSyncStore } from "@/store/sync";
import { ApiError } from "@/lib/api";
import { payOrder, saveOrder } from "@/lib/pos-actions";

const paused = () => h.paused[h.paused.length - 1];

beforeEach(() => {
  h.paused.length = 0;
  h.approvalOpen = false;
  h.labels.length = 0;
  h.lacks = [];
  h.hold = () => Promise.resolve({});
  h.router.push.mockClear();
  vi.mocked(saveOrder).mockReset();
  vi.mocked(payOrder).mockReset();
  useSyncStore.setState({ status: "online" });
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

describe("F4 and F5 while a save runs", () => {
  // Review: F4 and F5 bypassed busy, so a double F5 sent twice and showed a false error.
  it("do nothing, like the disabled buttons, so a second press never holds or sends twice", async () => {
    render(<PosPage />);
    fireEvent.click(screen.getByText("Add tea"));
    let finish = () => {};
    let holds = 0;
    h.hold = () => { holds++; return new Promise((resolve) => { finish = () => resolve({}); }); };
    fireEvent.keyDown(window, { key: "F4" });
    fireEvent.keyDown(window, { key: "F4" });
    fireEvent.keyDown(window, { key: "F5" });
    expect(holds).toBe(1);
    expect(saveOrder).not.toHaveBeenCalled();
    await act(async () => finish());
  });
});

describe("a paid order and its receipt", () => {
  const paid = () => ({ receipt: { order: { label: "T1-001" } }, change_minor: 0, offline: true, local: { status: "paid", paid_minor: 10000, total_minor: 10000, label: "T1-001" }, cart: {} });
  async function payTea() {
    render(<PosPage />);
    fireEvent.click(screen.getByText("Add tea"));
    const paidId = useCartStore.getState().cart.id;
    vi.mocked(payOrder).mockResolvedValue(paid() as never);
    fireEvent.keyDown(window, { key: "F8" });
    await act(async () => { fireEvent.click(await screen.findByText("Pay now")); });
    await screen.findByText("Receipt on screen");
    return paidId;
  }

  // QA T9: the cart was cleared only when the receipt closed, so a reload or an auto-lock with the receipt on screen
  // brought the paid order back to be sold again.
  it("leaves the cart the moment it is paid, while the receipt stays on screen", async () => {
    const paidId = await payTea();
    expect(useCartStore.getState().cart.lines).toEqual([]);
    expect(useCartStore.getState().cart.id).not.toBe(paidId);
  });

  // web-till#2: F4 or F5 over the receipt of an offline sale held or sent the paid order again, unpaid.
  it("takes no F4, F5 or F8 while the receipt is open", async () => {
    let holds = 0;
    h.hold = () => { holds++; return Promise.resolve({}); };
    await payTea();
    fireEvent.keyDown(window, { key: "F4" });
    fireEvent.keyDown(window, { key: "F5" });
    fireEvent.keyDown(window, { key: "F8" });
    expect(holds).toBe(0);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(payOrder).toHaveBeenCalledTimes(1);
  });

  it("starts a new order when the server answers that the order is already closed", async () => {
    render(<PosPage />);
    fireEvent.click(screen.getByText("Add tea"));
    const closedId = useCartStore.getState().cart.id;
    vi.mocked(saveOrder).mockRejectedValue(new ApiError("order.closed", "This order is already paid and closed", 409));
    await act(async () => { fireEvent.keyDown(window, { key: "F5" }); });
    expect(useCartStore.getState().cart.lines).toEqual([]);
    expect(useCartStore.getState().cart.id).not.toBe(closedId);
  });
});

describe("a staff meal offline (QA K8)", () => {
  it("is refused at once for a cashier without orders.staff_meal, and the order stays charged", async () => {
    h.lacks = ["orders.staff_meal"];
    useSyncStore.setState({ status: "offline" });
    render(<PosPage />);
    fireEvent.click(screen.getByText("Add tea"));
    fireEvent.click(screen.getByTitle(/^Staff meal: the bill/));
    await act(async () => { fireEvent.click(screen.getByText("Confirm staff meal")); });
    expect(useCartStore.getState().cart.is_staff_meal).toBe(false);
    expect(saveOrder).not.toHaveBeenCalled();
  });
});

describe("the manager PIN dialog's title (QA T6)", () => {
  // "Approve: Send to kitchen" for a Rs 250 to Rs 1 price override never said what the PIN approved.
  it("names the price override at send and at pay", async () => {
    vi.mocked(saveOrder).mockResolvedValue({ cart: { label: "#7" }, offline: false } as never);
    render(<PosPage />);
    fireEvent.click(screen.getByText("Add tea"));
    const key = useCartStore.getState().cart.lines[0].key;
    act(() => useCartStore.getState().updateLine(key, { price_override_minor: 100 }));
    await act(async () => { fireEvent.keyDown(window, { key: "F5" }); });
    expect(h.labels.at(-1)).toBe("Send to kitchen: Tea Rs 100 to Rs 1");
    fireEvent.click(screen.getByText("Add tea"));
    const k2 = useCartStore.getState().cart.lines[0].key;
    act(() => useCartStore.getState().updateLine(k2, { price_override_minor: 100 }));
    vi.mocked(payOrder).mockRejectedValue(new Error("stop"));
    fireEvent.keyDown(window, { key: "F8" });
    await act(async () => { fireEvent.click(await screen.findByText("Pay now")); });
    expect(h.labels.at(-1)).toBe("Take payment: Tea Rs 100 to Rs 1");
  });
});
