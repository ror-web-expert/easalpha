import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem, QueueItem } from "@/lib/db";
import type { CanteenSync, CanteenToday } from "@/lib/types";

// R19 (6 Nov 2026 review): a meal the kiosk took offline and the server refused at replay stayed "waiting to send"
// and nobody saw why. The kiosk is driven as a worker uses it (finger, no connection), then the real sync push runs.
const h = vi.hoisted(() => {
  const table = (m: Map<string, unknown>) => ({
    get: async (id: string) => m.get(id),
    put: async (row: { id: string }) => void m.set(row.id, row),
    bulkPut: async (rows: { id: string }[]) => rows.forEach((r) => m.set(r.id, r)),
    delete: async (id: string) => void m.delete(id),
    count: async () => m.size,
    toArray: async () => [...m.values()],
    where: (field: string) => ({ equals: (v: unknown) => ({ toArray: async () => [...m.values()].filter((i) => (i as Record<string, unknown>)[field] === v) }) }),
  });
  const queue = new Map<string, unknown>();
  const attention = new Map<string, unknown>();
  const orders = new Map<string, unknown>();
  const kv = new Map<string, unknown>();
  return { queue, attention, orders, kv, online: false, api: vi.fn(), db: { queue: table(queue), attention: table(attention), orders: table(orders) } };
});
vi.mock("@/lib/db", () => ({ db: h.db, kvGet: async (k: string) => h.kv.get(k), kvSet: async (k: string, v: unknown) => void h.kv.set(k, v) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (...a: unknown[]) => h.api(...a) }));
// The real queue, without the timers and listeners startSync sets up: the test pushes once by hand.
vi.mock("@/lib/sync", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/sync")>()), startSync: () => () => {} }));
vi.mock("@/lib/hooks", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/hooks")>()), useOnline: () => h.online }));
vi.mock("@/lib/print", () => ({ printJob: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/components/kitchen/auth", () => ({ useBeep: () => () => {} }));
vi.mock("@/store/device", () => {
  const state = { device: { id: "d-1", code: "Q1" }, business: { name: "Steel Works Mess" } };
  return { useDeviceStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state, subscribe: () => () => {} }) };
});
vi.mock("@/store/catalog", () => {
  const state = { catalog: null };
  return { useCatalogStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});

import { processQueue } from "@/lib/sync";
import { useSyncStore } from "@/store/sync";
import { CanteenKiosk } from "./kiosk";

const lunch = { id: "s-lunch", branch_id: "b-1", name: "Lunch", starts_at: "00:00", ends_at: "23:59", max_claims: 1, active: true, sort_order: 0 };
const item = { id: "i-1", product_id: "p-1", name: "Chicken Karahi", name_ur: null, image_key: null, price_minor: 52_200, worker_price_minor: 20_000, planned_qty: null, claims_count: 0, sold_out: false, sort_order: 0 };
const today: CanteenToday = {
  date: "2026-11-06", now: "2026-11-06T07:30:00Z", branch: { id: "b-1", name: "Main" }, session: lunch, sessions: [lunch],
  plans: [{ id: "pl-1", branch_id: "b-1", meal_session_id: lunch.id, session: lunch, plan_date: "2026-11-06", status: "published", notes: null, published_at: null, items: [item], claims: 0, planned: 0 }],
  counts: { claimed: 0, served: 0, workers: 1 }, settings: { manual_lookup: true, print_token: true },
};
const sync: CanteenSync = { date: today.date, sessions: [lunch], plans: today.plans, claims: [],
  workers: [{ id: "e-1", name: "Akbar Ali", department: null, designation: null, customer_id: "c-1", fingerprint_enrolled: true, fingerprint_id: "FP-001", branch_id: null }] };
const refusal = { code: "canteen.session_closed", message: "Lunch is not being served now" };

function answer(path: string, opts?: { body?: { records?: QueueItem[] } }) {
  if (path === "/canteen/today") return today;
  if (path === "/canteen/claims") return { date: today.date, data: [] };
  if (path === "/canteen/sync") return sync;
  if (path === "/sync/push") return { batch_id: "b", server_time: "2026-11-06T09:00:00Z", results: (opts?.body?.records ?? []).map((r) => ({ id: r.id, type: r.type, status: "rejected", ...refusal })) };
  return {};
}

function scan(id: string) {
  for (const key of id) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
}

beforeEach(() => {
  h.queue.clear(); h.attention.clear(); h.orders.clear(); h.kv.clear();
  h.online = false;
  h.api.mockReset();
  h.api.mockImplementation(async (path: string, opts?: { body?: { records?: QueueItem[] } }) => answer(path, opts));
  useSyncStore.setState({ status: "online", pending: 0, attention: 0, lastError: null });
});
afterEach(() => cleanup());

describe("canteen kiosk, meals refused at sync", () => {
  it("counts a refused offline meal apart from the queue and shows the supervisor who, what and why", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CanteenKiosk /></QueryClientProvider>);
    await screen.findByText("Today: Chicken Karahi");
    await waitFor(() => expect(h.api).toHaveBeenCalledWith("/canteen/sync", expect.anything()));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    scan("FP-001"); // no connection: the meal is taken here and queued
    await screen.findByText("Collect at the counter (saved offline)");
    await waitFor(() => expect(h.queue.size).toBe(1));
    expect(await screen.findByText(/1 waiting to send/)).toBeInTheDocument();
    expect(screen.queryByTestId("refused")).toBeNull();

    await act(async () => { await processQueue(); }); // the connection is back and the server refuses it
    expect([...h.attention.values()].map((a) => (a as AttentionItem).code)).toEqual(["canteen.session_closed"]);
    const badge = await screen.findByTestId("refused");
    expect(badge).toHaveTextContent("1 refused");
    expect(screen.queryByText(/waiting to send/)).toBeNull();

    fireEvent.click(badge);
    const row = await screen.findByTestId("refused-row");
    expect(row).toHaveTextContent("Akbar Ali");
    expect(row).toHaveTextContent("Chicken Karahi");
    expect(row).toHaveTextContent("Q1-001");
    expect(row).toHaveTextContent("Lunch is not being served now");

    fireEvent.click(within(row).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByTestId("refused")).toBeNull());
    expect(h.attention.size).toBe(0);
  });

  it("lists refusals already on this kiosk when it starts, named from its worker list once the local copy is gone", async () => {
    h.attention.set("m-9", { id: "m-9", type: "meal_claim", ...refusal, payload: { fingerprint_id: "FP-001", token_label: "Q1-014", client_created_at: "2026-11-05T13:10:00Z" }, created_at: "2026-11-05T16:00:00Z" });
    h.attention.set("o-1", { id: "o-1", type: "order", code: "day.locked", message: "Locked", payload: {}, created_at: "2026-11-05T16:00:00Z" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CanteenKiosk /></QueryClientProvider>);
    const badge = await screen.findByTestId("refused");
    expect(badge).toHaveTextContent("1 refused");
    fireEvent.click(badge);
    await waitFor(() => expect(screen.getByTestId("refused-row")).toHaveTextContent("Akbar Ali"));
    expect(screen.getByTestId("refused-row")).toHaveTextContent("Q1-014");
  });
});
