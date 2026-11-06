import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem, QueueItem } from "@/lib/db";
import type { CanteenSync, CanteenToday, MealClaim, MealPlan, MealPlanItem, MealSession } from "@/lib/types";

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

import { ApiError } from "@/lib/api";
import { processQueue } from "@/lib/sync";
import { useSyncStore } from "@/store/sync";
import { CanteenKiosk } from "./kiosk";

const zone = "Asia/Karachi";
// The whole business day: it opens at the 02:01 day end, so whatever the hour its meals are on the business day.
const lunch: MealSession = { id: "s-lunch", branch_id: "b-1", name: "Lunch", starts_at: "02:01", ends_at: "02:00", max_claims: 1, active: true, sort_order: 0 };
const item: MealPlanItem = { id: "i-1", product_id: "p-1", name: "Chicken Karahi", name_ur: null, image_key: null, price_minor: 52_200, worker_price_minor: 20_000, planned_qty: null, claims_count: 0, sold_out: false, sort_order: 0 };
const planFor = (session: MealSession, date: string, items = [item]): MealPlan => ({ id: `pl-${session.id}-${date}`, branch_id: "b-1", meal_session_id: session.id, session, plan_date: date, status: "published", notes: null, published_at: null, items, claims: 0, planned: 0 });
const akbar = { id: "e-1", name: "Akbar Ali", department: null, designation: null, customer_id: "c-1", fingerprint_enrolled: true, branch_id: null };
// SHA-256 of "b-1:fp-001" and "b-1:fp-002": the reader ids as the API ships them (salt b-1), never in plain text.
const FP1 = "a6412f4035e1d3660fe2ea96a61191adb4d5b4ce9386aeaf272441da6c6c9ca4";
const FP2 = "4912fa3431d34f4b1f708767745b4e10c8d3138085178e6793c0a405177a9c5d";

let today: CanteenToday;
let sync: CanteenSync;
let serverClaims: MealClaim[];
let postClaim: (body: Record<string, unknown>) => unknown;

/** The kiosk's view of the server at `now`: its sessions, plans and claims, the workers with hashed reader ids. */
function server({ now, sessions, plans, date, session = null, claims = [] }: { now: string; sessions: MealSession[]; plans: MealPlan[]; date: string; session?: MealSession | null; claims?: MealClaim[] }) {
  today = { date, now, branch: { id: "b-1", name: "Main", time_zone: zone, day_end: "02:01" }, session, sessions, plans, counts: { claimed: 0, served: 0, workers: 2 }, settings: { manual_lookup: true, print_token: true } };
  sync = { date, time_zone: zone, day_end: "02:01", fingerprint_salt: "b-1", sessions, plans, claims,
    workers: [{ ...akbar, fingerprint_hash: FP1 }, { ...akbar, id: "e-2", name: "Bilal", customer_id: "c-2", fingerprint_hash: FP2 }] };
  serverClaims = claims;
}

function answer(path: string, opts?: { method?: string; body?: { records?: QueueItem[] } & Record<string, unknown> }) {
  if (path === "/canteen/today") return today;
  if (path === "/canteen/claims") return opts?.method === "POST" ? postClaim(opts.body ?? {}) : { date: today.date, data: serverClaims };
  if (path === "/canteen/sync") return sync;
  if (path === "/sync/push") return { batch_id: "b", server_time: "2026-11-06T09:00:00Z", results: (opts?.body?.records ?? []).map((r) => ({ id: r.id, type: r.type, status: "rejected", ...refusal })) };
  return {};
}
const refusal = { code: "canteen.session_closed", message: "Lunch is not being served now" };

function scan(id: string) {
  for (const key of id) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
}

async function start() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><CanteenKiosk /></QueryClientProvider>);
  await waitFor(() => expect(h.api).toHaveBeenCalledWith("/canteen/sync", expect.anything()));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const queued = () => [...h.queue.values()] as QueueItem[];
const localClaims = () => (h.kv.get("canteen_local_claims") ?? []) as MealClaim[];
const claim = (over: Partial<MealClaim>): MealClaim => ({ id: "m-0", employee_id: "e-1", employee_name: "Akbar Ali", customer_id: "c-1", order_id: "o-0", meal_session_id: "s-lunch", session: "Lunch", meal_plan_item_id: "i-1", dish: "Chicken Karahi",
  plan_date: "2026-11-06", token_no: 1, token_label: "Q1-001", status: "claimed", scanned_at: "2026-11-06T07:00:00Z", served_at: null, cancelled_at: null, cancel_reason: null, source: "fingerprint", device_id: "d-1", worker_price_minor: 20_000, company_share_minor: 0, ...over });

// The whole kiosk renders, fetches and pushes: give the waits room on a busy CI machine.
configure({ asyncUtilTimeout: 4000 });

beforeEach(() => {
  h.queue.clear(); h.attention.clear(); h.orders.clear(); h.kv.clear();
  h.online = false;
  h.api.mockReset();
  h.api.mockImplementation(async (path: string, opts?: { method?: string; body?: { records?: QueueItem[] } }) => answer(path, opts));
  server({ now: "2026-11-06T07:30:00Z", sessions: [lunch], plans: [planFor(lunch, "2026-11-06")], date: "2026-11-06", session: lunch });
  postClaim = () => { throw new ApiError("network", "offline", 0); };
  useSyncStore.setState({ status: "online", pending: 0, attention: 0, lastError: null });
});
afterEach(() => cleanup());

describe("canteen kiosk, meals refused at sync", () => {
  it("counts a refused offline meal apart from the queue and shows the supervisor who, what and why", async () => {
    await start();
    await screen.findByText("Today: Chicken Karahi");

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
  }, 20_000);

  it("lists refusals already on this kiosk when it starts, named from its worker list once the local copy is gone", async () => {
    h.attention.set("m-9", { id: "m-9", type: "meal_claim", ...refusal, payload: { fingerprint_id: "FP-001", token_label: "Q1-014", client_created_at: "2026-11-05T13:10:00Z" }, created_at: "2026-11-05T16:00:00Z" });
    h.attention.set("o-1", { id: "o-1", type: "order", code: "day.locked", message: "Locked", payload: {}, created_at: "2026-11-05T16:00:00Z" });
    await start();
    const badge = await screen.findByTestId("refused");
    expect(badge).toHaveTextContent("1 refused");
    fireEvent.click(badge);
    await waitFor(() => expect(screen.getByTestId("refused-row")).toHaveTextContent("Akbar Ali"));
    expect(screen.getByTestId("refused-row")).toHaveTextContent("Q1-014");
  }, 20_000);
});

describe("canteen kiosk, the session and its day from the clock", () => {
  // F7: offline since Tea, the kiosk kept serving Tea: a worker who had Tea was refused Supper as already taken, and
  // another got Tea's dish recorded as a Tea meal at supper time.
  it("serves the session the clock says, not the one the last answer named", async () => {
    const tea: MealSession = { ...lunch, id: "s-tea", name: "Tea", starts_at: "10:00", ends_at: "10:30", sort_order: 0 };
    const supper: MealSession = { ...lunch, id: "s-supper", name: "Supper", starts_at: "18:00", ends_at: "20:00", sort_order: 1 };
    const karahi = { ...item, id: "i-supper", name: "Supper Karahi" };
    server({ now: "2026-11-06T14:00:30Z", sessions: [tea, supper], plans: [planFor(tea, "2026-11-06", [{ ...item, id: "i-tea", name: "Chai" }]), planFor(supper, "2026-11-06", [karahi])], date: "2026-11-06",
      session: tea, claims: [claim({ id: "m-tea", meal_session_id: "s-tea", meal_plan_item_id: "i-tea", dish: "Chai", token_label: "Q1-003", scanned_at: "2026-11-06T05:10:00Z" })] });
    await start();
    expect(await screen.findByText("Supper menu")).toBeInTheDocument(); // 19:00 in Karachi
    expect(screen.getByTestId("clock")).toHaveTextContent("19:00");
    scan("FP-001"); // Akbar had Tea: Supper is a new meal
    await screen.findByText("Collect at the counter (saved offline)");
    await waitFor(() => expect(queued()).toHaveLength(1));
    expect(queued()[0].payload).toMatchObject({ meal_session_id: "s-supper", meal_plan_item_id: "i-supper", fingerprint_id: "FP-001", token_label: "Q1-004" });
  }, 20_000);

  // F6: Night 23:00 to 06:00 with the business day ending at 02:01. After 02:01 the kiosk looked for the new day's
  // Night menu (not published) and its own "already taken" list no longer saw the meals before 02:01.
  it("keeps a night session on the day it opened past the business-day end", async () => {
    const night: MealSession = { ...lunch, id: "s-night", name: "Night", starts_at: "23:00", ends_at: "06:00" };
    server({ now: "2026-11-09T22:00:00Z", sessions: [night], plans: [planFor(night, "2026-11-09"), planFor(night, "2026-11-10", [{ ...item, id: "i-tue", name: "Tuesday Daal" }])], date: "2026-11-09", session: night,
      claims: [claim({ id: "m-mon", meal_session_id: "s-night", plan_date: "2026-11-09", token_label: "Q1-004", scanned_at: "2026-11-09T18:30:00Z" })] }); // Tue 03:00, Akbar ate at Mon 23:30
    await start();
    expect(await screen.findByText("Today: Chicken Karahi")).toBeInTheDocument(); // Monday's night menu, not Tuesday's
    scan("FP-001");
    expect(await screen.findByText("Already taken")).toBeInTheDocument();
    expect(queued()).toHaveLength(0);
    scan("FP-002"); // Bilal, first meal of the night: the reader id matched by its hash
    await screen.findByText("Collect at the counter (saved offline)");
    await waitFor(() => expect(localClaims()).toHaveLength(1));
    expect(localClaims()[0]).toMatchObject({ employee_name: "Bilal", plan_date: "2026-11-09", meal_session_id: "s-night", token_label: "Q1-005" });
  }, 20_000);

  // F13: the tile showed the menu price before tax (Rs 1,200) and the meal charged Rs 1,392.
  it("shows the price the meal charges", async () => {
    server({ now: "2026-11-06T07:30:00Z", sessions: [lunch], date: "2026-11-06", session: lunch,
      plans: [planFor(lunch, "2026-11-06", [{ ...item, price_minor: 120_000, worker_price_minor: null, full_price_minor: 139_200, worker_pays_minor: 139_200 }, { ...item, id: "i-2", name: "Daal", price_minor: 50_000, worker_price_minor: 20_000, full_price_minor: 58_000, worker_pays_minor: 20_000 }])] });
    await start();
    const tiles = await screen.findAllByTestId("dish");
    expect(tiles[0]).toHaveTextContent("Rs 1,392");
    expect(tiles[0]).not.toHaveTextContent("Rs 1,200");
    expect(tiles[1]).toHaveTextContent("Rs 200");
  }, 20_000);

  // F13: a scan the server refused used up a token number, and a kiosk paired again started at 001 a second time.
  it("numbers tokens on from the day's tokens and spends no number on a refused scan", async () => {
    h.online = true;
    server({ now: "2026-11-06T07:30:00Z", sessions: [lunch], plans: [planFor(lunch, "2026-11-06")], date: "2026-11-06", session: lunch,
      claims: [claim({ id: "m-7", employee_id: "e-9", employee_name: "Earlier", token_label: "Q1-007" })] }); // given before this kiosk was paired again
    const labels: unknown[] = [];
    postClaim = (body) => {
      labels.push(body.token_label);
      if (body.fingerprint_id === "FP-404") throw new ApiError("canteen.unknown_worker", "No enrolled worker matches", 404);
      return claim({ id: String(body.id), token_label: String(body.token_label) });
    };
    await start();
    await screen.findByText("Today: Chicken Karahi");
    scan("FP-404");
    expect(await screen.findByText("Finger not recognised")).toBeInTheDocument();
    scan("FP-001");
    expect(await screen.findByText("Collect at the counter")).toBeInTheDocument();
    expect(labels).toEqual(["Q1-008", "Q1-008"]);
    expect(h.kv.get("canteen_token_seq")).toEqual({ date: "2026-11-06", seq: 8 });
  }, 20_000);
});
