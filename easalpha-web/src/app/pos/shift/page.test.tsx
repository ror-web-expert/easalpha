import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Shift } from "@/lib/types";

// The till's Shift screen with the stores and the till actions stubbed: who may act on the shift (roles QA, 6 Nov
// 2026: a waiter was offered Open shift and got "Missing permission"), and the drawer moves the till now has (QA B7).
const h = vi.hoisted(() => ({
  permissions: [] as string[],
  shift: null as Shift | null,
  status: "online",
  moves: [] as unknown[][],
  expenses: [] as unknown[],
}));

vi.mock("@/store/device", () => {
  const state = () => ({ session: { membership: { id: "m-ali" }, user: { name: "Ali" }, permissions: h.permissions } });
  return {
    useDeviceStore: Object.assign((sel: (s: ReturnType<typeof state>) => unknown) => sel(state()), { getState: state }),
    usePosCan: () => (...codes: string[]) => codes.some((c) => h.permissions.includes(c)),
  };
});
vi.mock("@/store/catalog", () => {
  const state = () => ({ shift: h.shift, catalog: { business: { currency: "PKR", settings: {} } } });
  return { useCatalogStore: Object.assign((sel: (s: ReturnType<typeof state>) => unknown) => sel(state()), { getState: state }) };
});
vi.mock("@/store/sync", () => ({ useSyncStore: (sel: (s: { status: string }) => unknown) => sel({ status: h.status }) }));
vi.mock("@/lib/pos-actions", () => ({
  loadCurrentShift: async () => h.shift,
  openShift: vi.fn(), closeShift: vi.fn(),
  cashMovement: async (...args: unknown[]) => { h.moves.push(args); return { offline: false }; },
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: async (path: string, opts?: { body?: unknown }) => {
    if (path === "/expenses/categories") return { data: [{ id: "u", name: "Utilities", parent_id: null, full_name: "Utilities", sort_order: 0, archived_at: null, children: [{ id: "g", name: "Gas", parent_id: "u", full_name: "Utilities / Gas", sort_order: 0, archived_at: null, children: null }] }] };
    if (path === "/expenses") { h.expenses.push(opts?.body); return { id: "e1", label: "EXP-1" }; }
    if (path === "/shifts/my_till") return null;
    throw new Error(`unexpected ${path}`);
  },
}));
vi.mock("@/lib/print", () => ({ printJob: vi.fn(), zReportLines: () => [] }));
vi.mock("@/components/pos/shell", () => ({ PosShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/admin/push-enable", () => ({ PushToggle: () => null }));
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: (pin?: string) => Promise<unknown>) => fn(), dialog: null }) }));

import ShiftPage from "./page";

const shiftOf = (cashier: string, name: string): Shift => ({
  id: "s-1", branch_id: "b", device_id: "d", cashier_membership_id: cashier, cashier_name: name, drawer_account_id: "da", business_day: "2026-11-06", status: "open", settlement_status: "pending",
  opened_at: "2026-11-06T09:00:00Z", closed_at: null, opening_cash_minor: 100_000, counted_cash_minor: null, approved_by_membership_id: null, close_note: null, movements: [],
});
const CASHIER = ["app.pos", "orders.create", "payments.take", "shifts.own", "cash.in_out", "expenses.manage"];
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ShiftPage /></QueryClientProvider>);

beforeEach(() => {
  h.permissions = CASHIER;
  h.shift = null;
  h.status = "online";
  h.moves.length = 0;
  h.expenses.length = 0;
});

describe("who may act on the shift (item 10)", () => {
  it("gives a waiter a read-only screen: no Open shift button and no drawer moves", () => {
    h.permissions = ["app.pos", "orders.create"];
    const { unmount } = show();
    expect(screen.getByText("No open shift")).toBeInTheDocument();
    expect(screen.getByText("A cashier or a manager opens the shift on this till.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open shift/ })).toBeNull();
    unmount();
    h.shift = shiftOf("m-sara", "Sara");
    show();
    expect(screen.getByText("Sara's shift on this till")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Drop to safe|Cash in|Close shift/ })).toBeNull();
  });

  it("lets a cashier open a shift, and on an open shift offers cash in and out, a drop, a payout, an expense and the close", () => {
    const { unmount } = show();
    expect(screen.getByRole("button", { name: /Open shift/ })).toBeInTheDocument();
    unmount();
    h.shift = shiftOf("m-ali", "Ali");
    show();
    for (const name of ["Cash in", "Cash out", "Drop to safe", "Payout", "Expense", "Close shift (blind count)"]) expect(screen.getByRole("button", { name: new RegExp(name.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
  });

  it("on another cashier's shift on this till: moves cash into it, but leaves the close to its cashier or a manager", () => {
    h.shift = shiftOf("m-sara", "Sara");
    show();
    expect(screen.getByText("Sara's shift on this till")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop to safe/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Close shift/ })).toBeNull();
  });
});

describe("drawer moves (QA B7)", () => {
  it("records a payout with who was paid and its category", async () => {
    h.shift = shiftOf("m-ali", "Ali");
    show();
    fireEvent.click(screen.getByRole("button", { name: /Payout/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "15" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Ice" } });
    fireEvent.change(within(dialog).getByLabelText("Paid to"), { target: { value: "Ice man" } });
    await waitFor(() => expect(within(dialog).getByRole("option", { name: "Utilities / Gas" })).toBeInTheDocument());
    fireEvent.change(within(dialog).getByLabelText("Category"), { target: { value: "g" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(h.moves).toHaveLength(1));
    expect(h.moves[0].slice(1)).toEqual(["payout", 1_500, "Ice", undefined, { category_id: "g", paid_to: "Ice man" }]);
  });

  it("records a drop to the safe with no payout fields", async () => {
    h.shift = shiftOf("m-ali", "Ali");
    show();
    fireEvent.click(screen.getByRole("button", { name: /Drop to safe/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Paid to")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "200" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Too much cash" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(h.moves).toHaveLength(1));
    expect(h.moves[0].slice(1)).toEqual(["drop", 20_000, "Too much cash", undefined, {}]);
  });

  it("records an expense from the drawer with its category, and needs the connection for it", async () => {
    h.shift = shiftOf("m-ali", "Ali");
    const { unmount } = show();
    fireEvent.click(screen.getByRole("button", { name: /Expense/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("option", { name: "Utilities / Gas" })).toBeInTheDocument());
    fireEvent.change(within(dialog).getByLabelText("Category"), { target: { value: "g" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "30" } });
    fireEvent.change(within(dialog).getByLabelText("Paid to"), { target: { value: "Gas shop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(h.expenses).toHaveLength(1));
    expect(h.expenses[0]).toMatchObject({ category_id: "g", amount_minor: 3_000, paid_to: "Gas shop", method_code: "cash" });
    unmount();
    h.status = "offline";
    show();
    expect(screen.getByRole("button", { name: /Expense/ })).toBeDisabled();
  });
});
