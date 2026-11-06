import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { api, type RequestOptions } from "@/lib/api";
import type { Session } from "@/lib/types";
import { useAuthStore } from "@/store/auth";

// A new owner's settings screens (browser QA of 6 Nov 2026, section S).
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import DealsPage from "@/app/(admin)/admin/products/deals/page";
import ChecklistPage from "@/app/(admin)/admin/settings/checklist/page";
import StoreProfilePage from "@/app/(admin)/admin/settings/store/page";
import StoreManagementPage from "@/app/(admin)/admin/settings/store-management/page";
import ModulesPage from "@/app/(admin)/admin/settings/modules/page";
import { StaffList } from "./staff-list";

type Handler = (path: string, opts?: RequestOptions) => unknown;
let handler: Handler;
const calls = () => vi.mocked(api).mock.calls.map(([path, opts]) => ({ path: path as string, method: (opts as RequestOptions | undefined)?.method ?? "GET", body: (opts as RequestOptions | undefined)?.body }));
let qc: QueryClient;
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  handler = () => ({ data: [] });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts?: RequestOptions) => handler(path, opts)) as typeof api);
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Sana" }, business: { id: "biz", name: "QA Setup" }, branch: { id: "b1" }, membership: { id: "m1", role: { name: "Owner", system_key: "owner" } }, permissions: ["settings.manage", "menu.edit", "app.admin", "staff.manage"], modules: { canteen: false, payroll: false, customer_accounts: true } } as unknown as Session, branchId: "b1" });
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("Deals (S9)", () => {
  it("puts the saved days in the date boxes and refuses Valid to before Valid from", async () => {
    const deal = { id: "d1", name: "Evening box", description: null, image_key: null, price_minor: 50000, active: true, show_online: true, is_favourite: false, valid_from: "2026-11-06T00:00:00.000Z", valid_to: "2026-11-06", tax_rate_id: null, sort_order: 0, items: [{ id: "i1", product_id: "p1", variant_id: null, quantity: 1, choice_group: null }] };
    handler = (path) => (path === "/deals" ? { data: [deal] } : { data: [] });
    show(<DealsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Valid from")).toHaveValue("2026-11-06");
    expect(screen.getByLabelText("Valid to")).toHaveValue("2026-11-06");
    fireEvent.change(screen.getByLabelText("Valid to"), { target: { value: "2026-11-05" } });
    expect(screen.getAllByText("Valid to must be on or after Valid from.").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("Setup checklist (S10)", () => {
  it("sends the hours step to Business Hours and says what ticks the business step", async () => {
    handler = () => ({ data: [{ id: "1", key: "business_info", title: "Add your business name, logo and phone", done: false, done_at: null, plan_feature_off: false, sort_order: 0 }, { id: "2", key: "branch_hours", title: "Set opening hours and the day-end time", done: false, done_at: null, plan_feature_off: false, sort_order: 1 }], done: 0, total: 2 });
    show(<ChecklistPage />);
    expect(await screen.findByText(/the logo on Branding/)).toBeInTheDocument();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/admin/settings/business-hours");
    expect(links).not.toContain("/admin/settings/store-management");
  });
});

describe("Store Profile (S3, S14)", () => {
  it("has a Country field, the sign-up currencies and a time zone list, and a new country brings its currency and zone", async () => {
    handler = (path) => (path === "/business" ? { id: "biz", name: "QA Setup", legal_name: null, phone: null, email: null, country: "US", currency: "USD", time_zone: "America/New_York", plan: null, status: "trial", trial_days_left: 40, settings: {} } : { version: 1, groups: {} });
    show(<StoreProfilePage />);
    const countrySelect = await screen.findByLabelText("Country");
    await waitFor(() => expect(countrySelect).toHaveValue("US"));
    const currencies = within(screen.getByLabelText("Currency")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(currencies).toEqual(expect.arrayContaining(["PKR", "AED", "SAR", "USD", "GBP", "EUR", "INR"]));
    fireEvent.change(countrySelect, { target: { value: "PK" } });
    expect(screen.getByLabelText("Currency")).toHaveValue("PKR");
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Karachi");
    expect(screen.getByText(/Branches on the old time zone move with it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls().find((c) => c.path === "/business" && c.method === "PATCH")?.body).toMatchObject({ country: "PK", currency: "PKR", time_zone: "Asia/Karachi" }));
  });
});

describe("Store Management (S1)", () => {
  it("never puts the token in the form, says one is saved, and sends a new one only when typed", async () => {
    handler = (path) => (path === "/branches" ? { data: [{ id: "b1", business_id: "biz", name: "Main", code: "B1", address: null, city: null, phone: null, time_zone: "Asia/Karachi", day_end_time: "02:01", business_day_start: "06:01", tax_registration: { authority: "pra", ntn: "1234567-8", pos_id: "POS-77", token_set: true, token_hint: "ends N-42" }, opening_hours: null, is_main: true, archived_at: null }] } : { data: [] });
    show(<StoreManagementPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("API token")).toHaveValue("");
    expect(screen.getByText(/A token is saved \(ends N-42\)/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls().find((c) => c.method === "PATCH")?.body).toMatchObject({ tax_registration: { authority: "pra", ntn: "1234567-8", pos_id: "POS-77" } }));
    const sent = calls().find((c) => c.method === "PATCH")?.body as { tax_registration: Record<string, unknown> };
    expect(sent.tax_registration).not.toHaveProperty("token");
    expect(sent.tax_registration).not.toHaveProperty("token_set");
  });

  it("starts a new branch on the store's time zone (S3)", async () => {
    const s = useAuthStore.getState().session!;
    useAuthStore.setState({ session: { ...s, business: { ...s.business, time_zone: "Asia/Dubai" } } });
    show(<StoreManagementPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New branch/ }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Time zone")).toHaveValue("Asia/Dubai");
  });
});

describe("Modules (S16)", () => {
  it("shows the customer account settings on the Modules page, not only at the foot of Monthly Bills", async () => {
    handler = (path) => (path === "/settings" ? { version: 1, groups: { store: { name: "Store", screens: { "Customer Accounts": [{ key: "khata.credit_hold_days", group: "store", screen: "Customer Accounts", type: "integer", label: "Refuse new sales on account when a bill is this many days overdue; 0 never", value: 0, default: 0 }] } } } }
      : path === "/me" ? { modules: { customer_accounts: true, payroll: false, canteen: false } } : { data: [] });
    show(<ModulesPage />);
    expect(await screen.findByText("Customer Accounts")).toBeInTheDocument();
    expect(screen.getByLabelText(/Refuse new sales on account/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute("href", "#customer-accounts-settings");
  });
});

describe("Admin Staff (S16)", () => {
  const roles = [
    { id: "r1", name: "Manager", system_key: "manager", is_system: true, copied_from_role_id: null, permissions: [{ code: "app.admin", limit: null }], archived_at: null },
    { id: "r2", name: "Waiter", system_key: "waiter", is_system: true, copied_from_role_id: null, permissions: [{ code: "app.pos", limit: null }], archived_at: null },
  ];
  it("keeps the actions column in view and warns when the role cannot open the admin", async () => {
    handler = (path) => (path === "/roles" ? { data: roles } : { data: [] });
    const { container } = show(<StaffList staffType="admin" title="Admin Staff" description="Back-office users" icon={Shield} />);
    await waitFor(() => expect(container.querySelector("[data-sticky-last]")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Add admin staff member/ }));
    const role = await screen.findByLabelText("Role");
    await waitFor(() => expect(role).toHaveValue("r1"));
    expect(screen.queryByText(/cannot open the admin panel/)).toBeNull();
    fireEvent.change(role, { target: { value: "r2" } });
    expect(screen.getByText(/cannot open the admin panel/)).toBeInTheDocument();
  });
});
