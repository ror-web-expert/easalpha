import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem, QueueItem } from "@/lib/db";

// The Attention page with the till's tables and the sync calls stubbed: what matters here is whose records a role sees
// and what the money note says.
const h = vi.hoisted(() => ({ attention: [] as AttentionItem[], queue: [] as QueueItem[], lacks: [] as string[], me: "m-cashier" }));

vi.mock("@/lib/db", () => ({
  db: {
    attention: { orderBy: () => ({ reverse: () => ({ toArray: async () => h.attention }) }) },
    queue: { orderBy: () => ({ toArray: async () => h.queue }) },
  },
}));
vi.mock("@/lib/sync", () => ({ dismissAttention: vi.fn(), retryAttention: vi.fn(), processQueue: vi.fn(), flushDismissals: vi.fn(async () => {}), isMoneyRecord: (a: AttentionItem) => a.type === "payment" || a.type === "customer_payment" }));
vi.mock("@/store/device", () => {
  const state = { session: { membership: { id: h.me } } };
  return { useDeviceStore: (sel: (s: typeof state) => unknown) => sel(state), usePosCan: () => (...codes: string[]) => codes.some((c) => !h.lacks.includes(c)) };
});
vi.mock("@/store/catalog", () => {
  const state = { catalog: { business: { currency: "PKR" } } };
  return { useCatalogStore: (sel: (s: typeof state) => unknown) => sel(state) };
});
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: () => Promise<unknown>) => fn(), dialog: null }) }));
vi.mock("@/components/pos/shell", () => ({ PosShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import AttentionPage from "./page";

const rejectedRecord = (id: string, type: string, by: string, over: Partial<AttentionItem> = {}): AttentionItem =>
  ({ id, type, code: "approval.required", message: `A manager with orders.staff_meal must approve this (${id})`, payload: { __membership_id: by, amount_minor: 50000 }, created_at: "2026-11-06T20:00:00Z", ...over }) as AttentionItem;

beforeEach(() => {
  h.lacks = [];
  h.attention = [];
  h.queue = [];
});

describe("Attention for a cashier without OFFLINE_ORDERS (QA K8)", () => {
  // The badge showed 1, yet the page was a lock screen: the cashier could not see why their staff meal was refused.
  it("lists the records they made, and only those", async () => {
    h.lacks = ["OFFLINE_ORDERS", "settings.manage"];
    h.attention = [rejectedRecord("mine-1", "order", "m-cashier"), rejectedRecord("theirs-1", "order", "m-other")];
    h.queue = [{ id: "q-mine", type: "payment", membership_id: "m-cashier", payload: {}, created_at: "2026-11-06T20:01:00Z", attempts: 0, next_at: 0, last_error: null, status: "pending" }, { id: "q-theirs", type: "payment", membership_id: "m-other", payload: {}, created_at: "2026-11-06T20:02:00Z", attempts: 0, next_at: 0, last_error: null, status: "pending" }];
    render(<AttentionPage />);
    expect(await screen.findByText(/\(mine-1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/\(theirs-1\)/)).toBeNull();
    expect(screen.getByText(/Your own records only/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Waiting to sync/ })).toHaveTextContent(/1$/);
  });

  it("lists everyone's for a role with OFFLINE_ORDERS", async () => {
    h.attention = [rejectedRecord("mine-1", "order", "m-cashier"), rejectedRecord("theirs-1", "order", "m-other")];
    render(<AttentionPage />);
    expect(await screen.findByText(/\(theirs-1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Your own records only/)).toBeNull();
  });
});

describe("the note under a money record (QA K10)", () => {
  it("speaks of the account for an account payment, which has no order", async () => {
    h.attention = [rejectedRecord("cp-1", "customer_payment", "m-cashier", { code: "day.locked", message: "2026-11-06 is locked" })];
    render(<AttentionPage />);
    expect(await screen.findByText(/Money received on a customer's account that the server has not recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/stays on the Orders screen/)).toBeNull();
  });

  it("keeps the Orders screen note for a payment of an order", async () => {
    h.attention = [rejectedRecord("p-1", "payment", "m-cashier", { code: "day.locked", message: "2026-11-06 is locked" })];
    render(<AttentionPage />);
    expect(await screen.findByText(/The order stays on the Orders screen marked Rejected/)).toBeInTheDocument();
  });
});
