import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealSession, Session, SettingKey, SettingsResponse } from "@/lib/types";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/canteen/settings", useSearchParams: () => new URLSearchParams() }));

import CanteenSettingsPage from "./page";
import MealSessionsPage from "../sessions/page";
import { NAV } from "@/components/admin/nav";
import { useAuthStore } from "@/store/auth";

const sessionWith = (permissions: string[]) => ({
  access_token: "t", refresh_token: "r", user: { name: "Owner One", email: "owner@example.com" },
  business: { id: "biz1", name: "Factory Mess", plan: null }, branch: { id: "b-1", name: "Main", day_end_time: "02:01" }, businesses: [],
  membership: { role: { name: "Owner", system_key: "owner" } }, permissions, modules: { canteen: true },
}) as unknown as Session;

// The registry's "Canteen" screen, as GET /settings answers it.
const key = (k: string, label: string, value: boolean): SettingKey => ({ key: k, group: "store", screen: "Canteen", type: "boolean", label, value, default: true });
const settings: SettingsResponse = { version: 7, groups: { store: { name: "Store", screens: { Canteen: [
  key("canteen.payroll_deduction", "Take each worker's meals for the month off the payroll run and settle their account", true),
  key("canteen.manual_lookup", "The kiosk may find a worker by name, phone or CNIC when the fingerprint reader fails", true),
  key("canteen.print_token", "Print a token slip for every meal (the screen shows it either way)", true),
  key("canteen.plans.auto_copy", "Publish each session's latest meal plan again on a day that has none (a draft someone started is left alone)", true),
] } } } } as unknown as SettingsResponse;

function renderPage(page: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{page}</QueryClientProvider>);
}

configure({ asyncUtilTimeout: 4000 });

beforeEach(() => {
  useAuthStore.setState({ session: sessionWith(["canteen.manage", "settings.manage"]), branchId: "b-1" });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string) => (path === "/settings" ? settings : { data: [] })) as typeof api);
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

// F11, contracts#9: no admin page showed the canteen settings, so manual lookup, the token slip and the daily plan copy
// could be changed through the API only.
describe("Canteen settings", () => {
  it("shows every canteen switch and saves only the one changed", async () => {
    renderPage(<CanteenSettingsPage />);
    await screen.findAllByRole("switch");
    const rows = screen.getAllByRole("switch").map((s) => s.closest("label")?.textContent);
    expect(rows).toEqual(settings.groups.store.screens.Canteen.map((k) => k.label));
    const row = screen.getByText(settings.groups.store.screens.Canteen[1].label).closest("label") as HTMLElement;
    fireEvent.click(within(row).getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/settings", { method: "PATCH", body: { values: { "canteen.manual_lookup": false } } }));
    expect(screen.queryByText(/needs the Settings permission/)).toBeNull();
  }, 20_000);

  it("is in the Canteen menu, and tells a canteen manager without the Settings permission that saving needs it", async () => {
    const canteen = NAV.find((g) => g.label === "Canteen");
    expect(canteen?.items.find((it) => it.href === "/admin/canteen/settings")).toMatchObject({ label: "Settings", module: "canteen" });
    useAuthStore.setState({ session: sessionWith(["canteen.manage"]), branchId: "b-1" });
    renderPage(<CanteenSettingsPage />);
    expect(await screen.findByText(/needs the Settings permission/)).toBeInTheDocument();
  }, 20_000);
});

// canteen-payroll#8: "Meals per worker in this session" took 2 and changed nothing; the canteen serves one meal a session.
describe("Meal Sessions", () => {
  it("has no meals-per-worker field and saves a session with one meal, repairing one saved with more", async () => {
    const tea: MealSession = { id: "s-1", branch_id: "b-1", name: "Tea", starts_at: "10:00", ends_at: "10:30", max_claims: 2, active: true, sort_order: 0 };
    vi.mocked(api).mockImplementation((async (path: string) => (path === "/canteen/sessions" ? { data: [tea] } : {})) as typeof api);
    renderPage(<MealSessionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.queryByText(/Meals per worker/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/canteen/sessions/s-1", { method: "PATCH", body: expect.objectContaining({ id: "s-1", max_claims: 1 }) }));
  }, 20_000);
});
