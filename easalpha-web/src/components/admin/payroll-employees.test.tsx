import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EmployeeFull, Session } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

// L2, 7 Nov 2026: the Employees pages showed every salary to staff.manage and sent the salary, pay type, tips and
// components back on every save; the API now leaves pay out and refuses it without payroll.manage or PAYROLL.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/payroll/employees", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), useParams: () => ({ id: "e-1" }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import EmployeesPage from "@/app/(admin)/admin/payroll/employees/page";
import EmployeeDetailPage from "@/app/(admin)/admin/payroll/employees/[id]/page";
import { blankEmployee, employeePayload } from "./payroll-employees";

const PAY_KEYS = ["base_salary_minor", "pay_frequency", "shares_tips", "components"];
const MANAGER = ["app.admin", "staff.manage", "wages.pay"];
const OWNER = [...MANAGER, "payroll.manage", "PAYROLL"];
const signIn = (permissions: string[]) =>
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Sana" }, business: { id: "biz", name: "Karachi Grill", settings: {} }, branch: { id: "b1" }, membership: { id: "m1", role: { name: "Manager", system_key: "manager" } }, permissions, businesses: [], modules: { customer_accounts: true, payroll: true, canteen: false } } as unknown as Session, branchId: "b1" });
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

// What GET /employees answers: the pay figures only with the payroll permission.
const ali = (pay: boolean): EmployeeFull => ({
  id: "e-1", branch_id: null, membership_id: null, department_id: null, department: "Kitchen", name: "Ali Raza", phone: "+923001112233", cnic: null, designation: "Cook", pay_frequency: "monthly",
  joined_on: "2026-01-01", left_on: null, fingerprint_enrolled: false, fingerprint_id: null, fingerprint_enrolled_at: null, fingerprint_revoked_at: null, shares_tips: true, notes: null, archived_at: null, whatsapp_notify: true,
  ...(pay ? { base_salary_minor: 5_200_000, components: [{ id: "c-1", salary_component_id: "sc-1", name: "House rent", kind: "earning" as const, amount_minor: 400_000, percent: null }] } : {}),
});

const calls: { path: string; method?: string; body?: Record<string, unknown> }[] = [];
function serve(pay: boolean) {
  vi.mocked(api).mockImplementation((async (path: string, opts: { method?: string; body?: Record<string, unknown> } = {}) => {
    calls.push({ path, method: opts.method, body: opts.body });
    if (path === "/employees/components") return { data: [{ id: "sc-1", name: "House rent", kind: "earning", default_amount_minor: 500_000, is_percent: false, percent: null }] };
    if (path === "/employees/e-1") return ali(pay);
    if (path === "/employees") return { data: [ali(pay)] };
    return { data: [] };
  }) as typeof api);
}
const saved = () => calls.find((c) => c.method === "PATCH")?.body;
const money = /Rs\s?\d/;

beforeEach(() => { calls.length = 0; vi.mocked(api).mockReset(); });
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("Employees without the payroll permission", () => {
  it("lists the team with the pay type but no figure, no components, and saves no pay", async () => {
    signIn(MANAGER);
    serve(false);
    show(<EmployeesPage />);
    expect(await screen.findByText("Ali Raza")).toBeInTheDocument();
    expect(screen.getByText("Monthly salary")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(money);
    expect(screen.queryByRole("button", { name: /Components/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Components" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Statement for Ali Raza" })).toBeNull(); // a monthly salary's statement is payroll's

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("Salary components")).toBeNull();
    expect(within(dialog).queryByText(/Shares tips/)).toBeNull();
    expect(within(dialog).getByRole("note")).toHaveTextContent("set by someone with the payroll permission");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved()).toBeTruthy());
    expect(saved()).toMatchObject({ name: "Ali Raza", designation: "Cook" });
    for (const k of PAY_KEYS) expect(saved()).not.toHaveProperty(k);
    expect(calls.map((c) => c.path)).not.toContain("/employees/components");
  });

  it("shows the employee page without the Pay card and the Payslips tab", async () => {
    signIn(MANAGER);
    serve(false);
    show(<EmployeeDetailPage />);
    expect(await screen.findByRole("tab", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Payslips" })).toBeNull();
    expect(screen.queryByText("No salary components.")).toBeNull();
    expect(document.body.textContent).not.toMatch(money);
    expect(screen.queryByRole("button", { name: /Statement/ })).toBeNull();
  });
});

describe("Employees with the payroll permission", () => {
  it("lists the pay and components and saves them", async () => {
    signIn(OWNER);
    serve(true);
    show(<EmployeesPage />);
    expect(await screen.findByText("Rs 52,000 / month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Components/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Statement for Ali Raza" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Salary components")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved()).toBeTruthy());
    expect(saved()).toMatchObject({ base_salary_minor: 5_200_000, pay_frequency: "monthly", shares_tips: true, components: [{ salary_component_id: "sc-1", amount_minor: 400_000, percent: null }] });
  });

  it("shows the employee page's Pay card and Payslips tab", async () => {
    signIn(OWNER);
    serve(true);
    show(<EmployeeDetailPage />);
    expect(await screen.findByRole("tab", { name: "Payslips" })).toBeInTheDocument();
    expect(screen.getAllByText("Rs 52,000 / month").length).toBeGreaterThan(0);
  });
});

describe("employeePayload", () => {
  it("sends pay only with the permission", () => {
    const f = { ...blankEmployee(), name: " Bilal ", base_salary_minor: 100, shares_tips: true, components: [{ salary_component_id: "sc-1", amount_minor: 5, percent: "" }] };
    const hr = employeePayload(f, false);
    for (const k of PAY_KEYS) expect(hr).not.toHaveProperty(k);
    expect(hr).toMatchObject({ name: "Bilal", whatsapp_notify: true });
    expect(employeePayload(f)).toMatchObject({ base_salary_minor: 100, pay_frequency: "monthly", shares_tips: true, components: [{ salary_component_id: "sc-1", amount_minor: 5, percent: null }] });
  });
});
