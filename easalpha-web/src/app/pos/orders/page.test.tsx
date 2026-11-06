import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  api: null as null | ((path: string, query?: Record<string, unknown>) => Promise<unknown>),
  /** Permission codes the signed-in cashier lacks. */
  lacks: [] as string[],
  /** The PIN the manager types in the approval dialog, and the labels the screen gave it. */
  pin: undefined as string | undefined,
  labels: [] as (string | undefined)[],
  findLocal: (async () => null) as (code: string) => Promise<LocalOrder | null>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => h.router, useSearchParams: () => h.params }));
vi.mock("@/store/device", () => {
  const state = { branch: { day_end_time: "02:01" }, session: { permissions: [] } };
  return { useDeviceStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }), usePosCan: () => (...codes: string[]) => codes.some((c) => !h.lacks.includes(c)) };
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
vi.mock("@/components/pos/receipt-dialog", () => ({ ReceiptDialog: ({ receipt }: { receipt: { receipt_number?: string } | null }) => (receipt ? <div>Receipt {receipt.receipt_number}</div> : null) }));
vi.mock("@/components/pos/dialogs", () => ({ ReasonDialog: () => null }));
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: (pin?: string) => Promise<unknown>, label?: string) => { h.labels.push(label); return fn(h.pin); }, dialog: null }) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (path: string, opts?: { query?: Record<string, unknown> }) => h.api!(path, opts?.query) }));
vi.mock("@/lib/pos-actions", () => ({
  listLocalOrders: () => h.listLocal(),
  refreshOrdersFromServer: () => h.refreshServer(),
  storeServerOrder: async (o: Order) => { h.stored.push(o); return asLocal(o); },
  serverToLocal: (o: Order) => asLocal(o),
  findLocalOrder: (code: string) => h.findLocal(code),
  fetchReceipt: vi.fn(), refundOrder: vi.fn(), reopenOrder: vi.fn(), resumeOrder: vi.fn(), voidOrder: vi.fn(), completeOrder: vi.fn(),
}));

/** Enough of the till's copy for the dialog: the lines come from the order's items, as serverToLocal makes them. */
function asLocal(o: Order): LocalOrder {
  return {
    id: o.id, label: o.label, status: o.status, order_type: o.order_type, payment_status: o.payment_status, total_minor: o.total_minor, paid_minor: o.paid_minor, created_at: o.created_at,
    receipt_number: o.receipt_number, till_serial: o.till_serial ?? null, business_day: o.business_day, payments: [], payment_method_summary: o.payment_method_summary ?? null,
    lines: (o.items ?? []).map((i) => ({ key: i.id, name: i.name, unit_price_minor: i.unit_price_minor, quantity: Number(i.quantity), modifiers: [], tax_rate: 0, tax_inclusive: false })),
  } as unknown as LocalOrder;
}

const summary = { id: "o-9", label: "#42", status: "paid", order_type: "takeaway", payment_status: "paid", total_minor: 250000, paid_minor: 250000, created_at: "2026-11-05T13:00:00Z", receipt_number: "261105-MAIN-42", item_count: 2 } as unknown as Order;
const full = { ...summary, items: [{ id: "i-1", name: "Chicken karahi", unit_price_minor: 200000, quantity: "1", status: "pending" }, { id: "i-2", name: "Naan", unit_price_minor: 25000, quantity: "2", status: "pending" }], discounts: [] } as unknown as Order;

import OrdersPage from "./page";
import { completeOrder, refundOrder, reopenOrder } from "@/lib/pos-actions";
import { businessDayFor } from "@/lib/business-day";
import { ApiError } from "@/lib/api";

const refreshButton = () => screen.getByRole("button", { name: /Refresh/ });

beforeEach(() => {
  h.scanner.enabled.length = 0;
  h.scanner.onScan = null;
  h.stored.length = 0;
  h.lacks = [];
  h.pin = undefined;
  h.labels.length = 0;
  h.findLocal = async () => null;
  vi.mocked(refundOrder).mockReset();
  vi.mocked(reopenOrder).mockReset();
  vi.mocked(completeOrder).mockReset();
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

const today = businessDayFor("02:01");
const row = (over: Partial<LocalOrder> = {}): LocalOrder => ({ ...asLocal(full), business_day: today, ...over }) as LocalOrder;
async function openRow(o: LocalOrder) {
  h.listLocal = async () => [o];
  render(<OrdersPage />);
  fireEvent.click(screen.getByRole("tab", { name: /All/ }));
  fireEvent.click(await screen.findByText(o.label && o.label !== "draft" ? o.label : /^(Held|Draft) /));
}

describe("Refund and Reopen for a cashier (QA T11)", () => {
  // They were hidden from a role without orders.refund or REOPEN_ORDER, so not even a manager's PIN could do them.
  it("shows both on a paid order and sends the manager's PIN with the reopen", async () => {
    h.lacks = ["orders.refund", "shifts.any", "REOPEN_ORDER"];
    h.pin = "4321";
    vi.mocked(reopenOrder).mockResolvedValue({ label: "#42" } as never);
    await openRow(row());
    expect(screen.getByRole("button", { name: /^Refund/ })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Reopen/ })); });
    expect(reopenOrder).toHaveBeenCalledWith("o-9", "4321");
    expect(h.labels.at(-1)).toBe("Reopen #42");
  });
});

describe("a refund pressed again after a timeout (web-till#5)", () => {
  it("sends the same refund id, so the server records it once", async () => {
    vi.mocked(refundOrder).mockRejectedValue(new ApiError("network", "Request timed out", 0));
    await openRow(row());
    fireEvent.click(screen.getByRole("button", { name: /^Refund/ }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Cold food" } });
    const press = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Refund Rs/ })); });
    await press();
    await press();
    const ids = vi.mocked(refundOrder).mock.calls.map((c) => c[5]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });
});

describe("a reopened order paid above its new total (QA T5)", () => {
  // Refunds needed a settled order and Void refused a paid one: the order stayed open, blocking the shift close.
  it("refunds the excess, then offers Complete, which closes it and shows the receipt", async () => {
    const overpaid = row({ status: "served", payment_status: "paid", total_minor: 200000, paid_minor: 250000 });
    vi.mocked(refundOrder).mockResolvedValue({ local: { ...overpaid, paid_minor: 200000 } } as never);
    vi.mocked(completeOrder).mockResolvedValue({ local: { ...overpaid, paid_minor: 200000, status: "closed" }, receipt: { receipt_number: "261105-MAIN-42" } } as never);
    await openRow(overpaid);
    expect(screen.queryByRole("button", { name: /Complete/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Refund overpaid/ }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Naan taken off" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Refund Rs 500/ })); });
    expect(refundOrder).toHaveBeenCalledWith("o-9", 50000, "cash", "Naan taken off", undefined, expect.any(String));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Complete/ })); });
    expect(completeOrder).toHaveBeenCalledWith("o-9");
    expect(await screen.findByText("Receipt 261105-MAIN-42")).toBeInTheDocument();
  });

  it("offers Complete at once when the total fell to exactly what was paid", async () => {
    await openRow(row({ status: "served", total_minor: 250000, paid_minor: 250000 }));
    expect(screen.getByRole("button", { name: /Complete/ })).toBeInTheDocument();
  });
});

describe("a receipt printed offline, scanned (QA T12)", () => {
  // Its barcode is the till serial: "Not a receipt" on Orders, an attach-this-code dialog on Sell.
  it("finds today's order by its till serial on this till", async () => {
    h.listLocal = async () => [row({ label: "#43", till_serial: "T1-007", receipt_number: "261105-MAIN-43" })];
    render(<OrdersPage />);
    await act(async () => h.scanner.onScan!("T1-007"));
    expect(await screen.findByText("Order #43")).toBeInTheDocument();
  });

  it("asks the server for it across days when the till does not have it, and opens only the exact till serial", async () => {
    const queries: unknown[] = [];
    const old = { ...summary, id: "o-8", label: "#12", till_serial: "T1-007", business_day: "2026-11-01" } as unknown as Order;
    h.api = async (path, query) => {
      if (path === "/orders") { queries.push(query); return { data: [{ ...summary, id: "o-x", till_serial: "T1-0071" }, old] }; }
      if (path === "/orders/o-8") return { ...old, items: [] };
      throw new Error(`unexpected ${path}`);
    };
    render(<OrdersPage />);
    await act(async () => h.scanner.onScan!("t1-007"));
    expect(await screen.findByText("Order #12")).toBeInTheDocument();
    expect(queries).toEqual([{ q: "t1-007", all_days: true }]);
  });

  it("opens an order that never reached the server from the till's own copy, whatever day it is from", async () => {
    h.findLocal = async () => row({ label: "T1-003", till_serial: "T1-003", business_day: "2026-11-01", local_only: true });
    render(<OrdersPage />);
    await act(async () => h.scanner.onScan!("T1-003"));
    expect(await screen.findByText("Order T1-003")).toBeInTheDocument();
  });
});

describe("a sale the server rejected (QA K10)", () => {
  it("reads Rejected with the reason, not Paid beside it, and is left out of the Paid tab", async () => {
    h.listLocal = async () => [row({ label: "T1-004", sync_status: "rejected", sync_error: "day.locked" }), row({ id: "o-2", label: "#5" })];
    render(<OrdersPage />);
    fireEvent.click(screen.getByRole("tab", { name: /All/ }));
    const card = (await screen.findByText("T1-004")).closest("button")!;
    expect(card).toHaveTextContent("Rejected");
    expect(card).toHaveTextContent("day.locked");
    expect(card).toHaveTextContent("Paid on this till only");
    expect(card.textContent).not.toMatch(/Paid(?! on this till)/);
    expect(screen.getByRole("tab", { name: /Paid/ })).toHaveTextContent(/1$/);
  });
});

describe("held orders (QA T13)", () => {
  it("are named by state and time, not all \"draft\"", async () => {
    h.listLocal = async () => [row({ label: "draft", status: "held", created_at: "2026-11-05T13:00:00Z" })];
    render(<OrdersPage />);
    expect(await screen.findByText(/^Held \d/)).toBeInTheDocument();
    expect(screen.queryByText("draft")).toBeNull();
  });
});
