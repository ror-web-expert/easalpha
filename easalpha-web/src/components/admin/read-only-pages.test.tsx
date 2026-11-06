import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

// QA of 6 Nov 2026: P6 forms a role could not save showed editable; P5 the landing dashboard showed a raw "Missing
// permission" to a stock clerk.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import StorePage from "@/app/(admin)/admin/settings/store/page";
import RolesPage from "@/app/(admin)/admin/staff/roles/page";
import LoyaltyPage from "@/app/(admin)/admin/settings/loyalty-points/page";
import DashboardPage from "@/app/(admin)/admin/page";
import { canReadDashboard } from "@/components/admin/dashboard-access";

const signIn = (permissions: string[]) =>
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Sana" }, business: { id: "biz", name: "Victim Grill", settings: {} }, branch: { id: "b1" }, membership: { id: "m1", role: { name: "Manager", system_key: "manager" } }, permissions, businesses: [], modules: { customer_accounts: true, payroll: true, canteen: false } } as unknown as Session, branchId: "b1" });
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const MANAGER = ["app.admin", "staff.manage", "menu.edit", "customers.view", "reports.view_all"];

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string) => {
    if (path === "/business") return { id: "biz", name: "Victim Grill", phone: "+923001234567", settings: {} };
    if (path === "/settings") return { groups: {}, values: {}, version: 1 };
    if (path === "/roles") return { data: [{ id: "r1", name: "Cashier", system_key: "cashier", is_system: true, permissions: [{ code: "orders.create", limit: null }] }] };
    if (path === "/roles/permissions") return { data: [{ code: "orders.create", module: "EasAlpha extras", label: "Take orders", description: "Take orders", surface: "both", restriction: false, implies: [], spec: false }], modules: ["EasAlpha extras"] };
    if (path === "/loyalty/settings") return { enabled: true, rupees_per_point: 100, point_value: 1, min_redeem: 0, max_redeem_percent: 50 };
    return { data: [] };
  }) as typeof api);
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("forms a role cannot save show read-only (P6)", () => {
  it("Store Profile: a manager sees the note and no working Save", async () => {
    signIn(MANAGER);
    show(<StorePage />);
    expect((await screen.findAllByRole("note"))[0].textContent).toContain("Changing it needs Settings, Manage");
    for (const b of screen.getAllByRole("button", { name: "Save" })) expect(b).toBeDisabled();
  });

  it("Store Profile: the owner's form saves as before", async () => {
    signIn([...MANAGER, "settings.manage"]);
    show(<StorePage />);
    expect(await screen.findByRole("button", { name: "Save" })).not.toBeDisabled();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("Loyalty: read-only for a manager whose role reads it", async () => {
    signIn(MANAGER);
    show(<LoyaltyPage />);
    expect((await screen.findAllByRole("note"))[0]).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Roles: an accountant sees the roles with nothing to change", async () => {
    signIn(["app.admin", "reports.view_all", "finance.view"]);
    show(<RolesPage />);
    expect((await screen.findAllByRole("note"))[0].textContent).toContain("Staff, Manage");
    expect(screen.getByRole("button", { name: /New role/ })).toBeDisabled();
  });
});

describe("the landing dashboard (P5)", () => {
  it("asks for a report code and one of the dashboard's", () => {
    expect(canReadDashboard(["reports.view_all"])).toBe(true);
    expect(canReadDashboard(["reports.view_own", "VIEW_DAILY_SALES"])).toBe(true);
    expect(canReadDashboard(["reports.view_own"])).toBe(false);
    expect(canReadDashboard(["app.admin", "stock.view", "stock.count", "menu.view"])).toBe(false);
  });

  it("greets a stock clerk with the pages they open, and never asks for the sales figures", async () => {
    signIn(["app.admin", "stock.view", "stock.count", "menu.view", "PURCHASE_ORDERS"]);
    show(<DashboardPage />);
    expect(screen.getByText("Your role does not include the sales dashboard. These are the pages you can open.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Stock in Hand/ }).getAttribute("href")).toBe("/admin/inventory/stock-in-hand");
    expect(screen.queryByRole("link", { name: /Balance Sheet/ })).toBeNull();
    expect(vi.mocked(api).mock.calls.map(([p]) => p)).not.toContain("/reports/dashboard/all");
  });
});
