import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanteenRefusedClaim, CanteenToday } from "@/lib/types";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import CanteenTodayPage from "./page";
import { useAuthStore } from "@/store/auth";
import type { Session } from "@/lib/types";

// The page sits behind the canteen permissions (R5): a canteen manager's session.
const session = {
  access_token: "t", refresh_token: "r", user: { name: "Owner One", email: "owner@example.com" },
  business: { id: "biz1", name: "Factory Mess", plan: null }, branch: { id: "b-1", name: "Main", day_end_time: "02:01" }, businesses: [],
  membership: { role: { name: "Owner", system_key: "owner" } }, permissions: ["canteen.manage", "canteen.serve"], modules: { canteen: true },
} as unknown as Session;

// R19 (6 Nov 2026 review): meals a kiosk took offline and the server refused at sync were on no screen at all.
const refused: CanteenRefusedClaim = {
  id: "r-1", record_id: "m-1", code: "canteen.already_taken", message: "Akbar Ali already took Zinger Burger at 12:05, token Q1-007", refused_at: "2026-11-06T09:00:00Z",
  taken_at: "2026-11-06T07:20:00Z", token_label: "Q1-008", employee_id: "e-1", employee_name: "Akbar Ali", fingerprint_id: "FP-001", dish: "Zinger Burger", session: "Lunch", device_id: "d-1", device: "Q1",
};
const today = (rows: CanteenRefusedClaim[]): CanteenToday => ({
  date: "2026-11-06", now: "2026-11-06T09:00:00Z", branch: { id: "b-1", name: "Main" }, session: null, sessions: [], plans: [],
  counts: { claimed: 1, served: 0, workers: 1, refused: rows.length }, settings: { manual_lookup: true, print_token: true }, refused: rows,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CanteenTodayPage /></QueryClientProvider>);
}

configure({ asyncUtilTimeout: 4000 }); // the whole page renders: room for a busy CI machine

beforeEach(() => {
  useAuthStore.setState({ session, branchId: "b-1" });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string) => (path === "/canteen/today" ? today([refused]) : path === "/canteen/claims" ? { data: [] } : undefined)) as typeof api);
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("Canteen, Today", () => {
  it("lists the meals refused at sync with who, what and why, and resolves one as fixed", async () => {
    renderPage();
    const card = await screen.findByTestId("refused-claims");
    expect(within(card).getByText("Refused at sync (1)")).toBeInTheDocument();
    expect(card).toHaveTextContent("Akbar Ali");
    expect(card).toHaveTextContent("Zinger Burger · Lunch");
    expect(card).toHaveTextContent("Q1-008");
    expect(card).toHaveTextContent("already took Zinger Burger");
    fireEvent.click(within(card).getByRole("button", { name: "Mark fixed" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/canteen/refused/r-1/resolve", { method: "POST", body: { resolution: "fixed" } }));
  }, 20_000);

  it("shows no card when nothing was refused", async () => {
    vi.mocked(api).mockImplementation((async (path: string) => (path === "/canteen/today" ? today([]) : { data: [] })) as typeof api);
    renderPage();
    await screen.findByText("Meals today");
    expect(screen.queryByTestId("refused-claims")).toBeNull();
  }, 20_000);
});
