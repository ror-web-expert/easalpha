import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@/lib/types";
import { ApiError, api, type RequestOptions } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { accessDenial, NoAccess, RequirePermission } from "./no-access";

// Review R5: a manager opening the canteen, payroll, payment-method, plan or WhatsApp pages by URL got a partly drawn
// page around failing 403 calls. These pages now show one standard no-access state instead.
const nav = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import PlanPage from "@/app/(admin)/admin/settings/plan/page";
import WhatsappSettingsPage from "@/app/(admin)/admin/settings/whatsapp/page";
import PaymentMethodsPage from "@/app/(admin)/admin/settings/payment-methods/page";
import MealPlansPage from "@/app/(admin)/admin/canteen/plans/page";
import CanteenTodayPage from "@/app/(admin)/admin/canteen/page";
import PayrollSettingsPage from "@/app/(admin)/admin/payroll/settings/page";

const signIn = (permissions: string[], role = "manager") =>
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Sana" }, business: { id: "biz", name: "Mess" }, branch: { id: "b1" }, membership: { id: "m1", role: { name: role, system_key: role } }, permissions, modules: { canteen: true, payroll: true, customer_accounts: true } } as unknown as Session, branchId: "b1" });
const denied = (code = "permission.denied", message = "Missing permission: canteen.manage") => new ApiError(code, message, 403);
const calls = () => vi.mocked(api).mock.calls.map(([path]) => path as string);

let qc: QueryClient;
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async () => ({ data: [] })) as typeof api);
  nav.pathname = "/admin";
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("accessDenial", () => {
  it("is the API refusing the page: permission.denied or module.disabled, and nothing else", () => {
    expect(accessDenial(denied())).toEqual({ kind: "permission", message: "Missing permission: canteen.manage" });
    expect(accessDenial(denied("module.disabled", "Canteen is switched off."))).toEqual({ kind: "module", message: "Canteen is switched off." });
    expect(accessDenial(new ApiError("plan.limit", "Your plan allows 1 till", 403))).toBeNull();
    expect(accessDenial(new ApiError("http_500", "Server error", 500))).toBeNull();
    expect(accessDenial(new Error("boom"))).toBeNull();
  });
});

describe("RequirePermission and NoAccess", () => {
  it("shows the no-access state and never mounts the page without the permission", () => {
    signIn(["reports.view_all"]);
    const Page = vi.fn(() => <p>page</p>);
    show(<RequirePermission perms={["canteen.manage"]}><Page /></RequirePermission>);
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.getByText("Missing permission: canteen.manage")).toBeInTheDocument();
    expect(Page).not.toHaveBeenCalled();
  });

  it("names the module for a switched-off one, with the way to switch it on for the owner", () => {
    signIn([], "owner");
    nav.pathname = "/admin/canteen/plans";
    show(<NoAccess kind="module" />);
    expect(screen.getByText("Canteen (factory mess) is switched off")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Modules" })).toHaveAttribute("href", "/admin/settings/modules");
  });
});

describe("the pages a manager opens by URL", () => {
  it("Plan, WhatsApp and Payment Methods: the no-access state, and not one call the API would refuse", async () => {
    signIn(["reports.view_all", "staff.manage", "canteen.manage"]); // a manager: no settings.manage, no billing.manage
    for (const Page of [PlanPage, WhatsappSettingsPage, PaymentMethodsPage]) {
      show(<Page />);
      expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
      cleanup();
    }
    expect(calls()).toEqual([]);
  });

  it("Payroll Settings with settings.manage only: the no-access state, not a spinner on a refused call", async () => {
    signIn(["settings.manage"]);
    show(<PayrollSettingsPage />);
    expect(screen.getByText("Missing permission: payroll.manage or PAYROLL")).toBeInTheDocument();
    expect(calls()).not.toContain("/payroll/settings");
  });

  it("Meal Plans when the API refuses it (permissions changed since sign-in): no-access, not \"No meal sessions yet\"", async () => {
    signIn(["canteen.manage"]);
    vi.mocked(api).mockImplementation((async (path: string) => { if (path.startsWith("/canteen/")) throw denied(); return { data: [] }; }) as typeof api);
    show(<MealPlansPage />);
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.queryByText(/No meal sessions yet/)).toBeNull();
  });

  it("Canteen Today when the module was switched off on another computer: the module panel", async () => {
    signIn(["canteen.serve"]);
    nav.pathname = "/admin/canteen";
    vi.mocked(api).mockImplementation((async (path: string, _opts?: RequestOptions) => { void _opts; if (path.startsWith("/canteen/")) throw denied("module.disabled", "Canteen is switched off. The owner can switch it on in Settings, Modules."); return {}; }) as typeof api);
    show(<CanteenTodayPage />);
    expect(await screen.findByText("Canteen (factory mess) is switched off")).toBeInTheDocument();
    expect(screen.getByText("Ask the owner to switch it on in Settings, Modules.")).toBeInTheDocument();
  });
});
