import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@/lib/types";
import { api, type RequestOptions } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { AdminShell } from "./sidebar";

const nav = vi.hoisted(() => ({ pathname: "/admin", router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => nav.router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./help-support", () => ({ AnnouncementBanner: () => null, NeedHelpFab: () => null, PoweredBy: () => null }));
vi.mock("./dashboard-pills", () => ({ HeaderPills: () => null }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

const OFF = { customer_accounts: false, payroll: false };
const session = {
  access_token: "t", refresh_token: "r", user: { name: "Owner One", email: "owner@example.com" },
  business: { id: "biz1", name: "Hostel Mess", plan: null }, branch: { id: "b1", name: "Main", day_end_time: "02:01" }, businesses: [],
  membership: { role: { name: "Owner", system_key: "owner" } }, permissions: ["reports.view_all", "customers.view", "settings.manage"], modules: OFF,
} as unknown as Session;

let qc: QueryClient;
function shell() {
  return render(<QueryClientProvider client={qc}><AdminShell><p>report body</p></AdminShell></QueryClientProvider>);
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts?: RequestOptions) => (path === "/me" ? { modules: OFF } : opts?.method === "POST" ? undefined : { data: [] })) as typeof api);
  nav.router.replace.mockReset();
  useAuthStore.setState({ session, branchId: "b1" });
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ session: null, branchId: null });
});

describe("AdminShell", () => {
  it("explains a switched-off module on the Customer Ledger report and leaves it out of Reports", async () => {
    nav.pathname = "/admin/reports/customer-ledger";
    const user = userEvent.setup();
    shell();
    expect(await screen.findByText("Customer accounts (khata) is switched off")).toBeInTheDocument();
    expect(screen.queryByText("report body")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Reports/ }));
    expect(screen.getByRole("link", { name: "Grand Report" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Customer Ledger" })).toBeNull();
  });

  it("empties the query cache on log out, so the next login on this tab starts clean", async () => {
    nav.pathname = "/admin";
    qc.setQueryData(["customers", {}], { data: [{ id: "c1", name: "Ali Raza" }] });
    const user = userEvent.setup();
    shell();
    await waitFor(() => expect(qc.getQueryData(["modules", "biz1"])).toEqual(OFF));
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/login"));
    expect(useAuthStore.getState().session).toBeNull();
    expect(qc.getQueryData(["customers", {}])).toBeUndefined();
    expect(qc.getQueryData(["modules", "biz1"])).toBeUndefined();
  });
});
