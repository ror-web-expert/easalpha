import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalOrder } from "@/lib/db";
import type { Order } from "@/lib/types";

// The till's Orders screen with the stores, the API and the till actions stubbed: what matters here is what a receipt
// scan stores and opens (review R2) and how the Refresh button and the scanner behave around a refresh (review R31).
const h = vi.hoisted(() => ({
  router: { replace: () => {}, push: () => {} },
  params: new URLSearchParams(),
  scanner: { enabled: [] as boolean[], onScan: null as null | ((code: string) => void) },
  listLocal: (async () => []) as () => Promise<LocalOrder[]>,
  refreshServer: (async () => undefined) as () => Promise<void>,
  stored: [] as Order[],
  api: null as null | ((path: string) => Promise<unknown>),
}));

vi.mock("next/navigation", () => ({ useRouter: () => h.router, useSearchParams: () => h.params }));
vi.mock("@/store/device", () => {
  const state = { branch: { day_end_time: "02:01" }, session: { permissions: [] } };
  return { useDeviceStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }), usePosCan: () => () => true };
});
vi.mock("@/store/catalog", () => {
  const state = { paymentMethods: [], catalog: { business: { currency: "PKR", settings: {} } } };
  return { useCatalogStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});
vi.mock("@/lib/barcode", () => ({ scannerConfig: () => ({ enabled: true, beep: false }) }));
vi.mock("@/components/pos/scanner", () => ({
  useBarcodeScanner: (o: { enabled: boolean; onScan: (code: string) => void }) => { h.scanner.enabled.push(o.enabled); h.scanner.onScan = o.onScan; },
  playScanTone: () => {},
}));
vi.mock("@/lib/sync", () => ({ isOnline: () => true }));
vi.mock("@/lib/print", () => ({ hasPrinter: () => false, printJob: vi.fn(), receiptLines: () => [] }));
vi.mock("@/components/pos/shell", () => ({ PosShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/pos/receipt-dialog", () => ({ ReceiptDialog: () => null }));
vi.mock("@/components/pos/dialogs", () => ({ ReasonDialog: () => null }));
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: (pin?: string) => Promise<unknown>) => fn(), dialog: null }) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (path: string) => h.api!(path) }));
vi.mock("@/lib/pos-actions", () => ({
  listLocalOrders: () => h.listLocal(),
  refreshOrdersFromServer: () => h.refreshServer(),
  storeServerOrder: async (o: Order) => { h.stored.push(o); return asLocal(o); },
  serverToLocal: (o: Order) => asLocal(o),
  fetchReceipt: vi.fn(), refundOrder: vi.fn(), reopenOrder: vi.fn(), resumeOrder: vi.fn(), voidOrder: vi.fn(),
}));

/** Enough of the till's copy for the dialog: the lines come from the order's items, as serverToLocal makes them. */
function asLocal(o: Order): LocalOrder {
  return {
    id: o.id, label: o.label, status: o.status, order_type: o.order_type, payment_status: o.payment_status, total_minor: o.total_minor, paid_minor: o.paid_minor, created_at: o.created_at,
    receipt_number: o.receipt_number, lines: (o.items ?? []).map((i) => ({ key: i.id, name: i.name, unit_price_minor: i.unit_price_minor, quantity: Number(i.quantity), modifiers: [], tax_rate: 0, tax_inclusive: false })),
  } as unknown as LocalOrder;
}

const summary = { id: "o-9", label: "#42", status: "paid", order_type: "takeaway", payment_status: "paid", total_minor: 250000, paid_minor: 250000, created_at: "2026-11-05T13:00:00Z", receipt_number: "261105-MAIN-42", item_count: 2 } as unknown as Order;
const full = { ...summary, items: [{ id: "i-1", name: "Chicken karahi", unit_price_minor: 200000, quantity: "1", status: "pending" }, { id: "i-2", name: "Naan", unit_price_minor: 25000, quantity: "2", status: "pending" }], discounts: [] } as unknown as Order;

import OrdersPage from "./page";

const refreshButton = () => screen.getByRole("button", { name: /Refresh/ });

beforeEach(() => {
  h.scanner.enabled.length = 0;
  h.scanner.onScan = null;
  h.stored.length = 0;
  h.listLocal = async () => [];
  h.refreshServer = async () => undefined;
  h.api = async (path) => {
    if (path === "/orders") return { data: [summary] };
    if (path === "/orders/o-9") return full;
    throw new Error(`unexpected ${path}`);
  };
});

describe("a scanned receipt from another day (review R2)", () => {
  it("fetches the whole order, stores it and lists what was sold", async () => {
    render(<OrdersPage />);
    await act(async () => h.scanner.onScan!("261105-MAIN-42"));
    expect(await screen.findByText("Order #42")).toBeInTheDocument();
    expect(h.stored).toEqual([full]);
    expect(screen.getByText(/Chicken karahi/)).toBeInTheDocument();
    expect(screen.getByText(/2 × Naan/)).toBeInTheDocument();
    expect(screen.queryByText("Line details not cached on this till.")).toBeNull();
  });

  it("still opens the order from the summary row when the whole order cannot be fetched", async () => {
    h.api = async (path) => { if (path === "/orders") return { data: [summary] }; throw new Error("timeout"); };
    render(<OrdersPage />);
    await act(async () => h.scanner.onScan!("261105-MAIN-42"));
    expect(await screen.findByText("Order #42")).toBeInTheDocument();
    expect(h.stored).toEqual([summary]);
  });
});

describe("Refresh and the scanner (review R31)", () => {
  it("stops spinning when the till's own storage cannot be read", async () => {
    h.listLocal = async () => { throw new Error("The database is not open (private window)"); };
    render(<OrdersPage />);
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    await act(async () => refreshButton().click());
    await waitFor(() => expect(refreshButton()).toBeEnabled());
  });

  it("keeps taking scans while the list refreshes", async () => {
    let finish = () => {};
    h.refreshServer = () => new Promise<void>((resolve) => { finish = resolve; });
    render(<OrdersPage />);
    await waitFor(() => expect(refreshButton()).toBeDisabled()); // the first refresh is running
    expect(h.scanner.enabled.at(-1)).toBe(true);
    await act(async () => finish());
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    expect(h.scanner.enabled.at(-1)).toBe(true);
  });
});
