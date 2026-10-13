import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Customer, Session } from "@/lib/types";
import { api, ApiError, type RequestOptions } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import CustomersPage from "@/app/(admin)/admin/customers/page";
import CustomerAccountPage from "@/app/(admin)/admin/customers/account/page";
import MonthlyBillsPage from "@/app/(admin)/admin/customers/bills/page";
import CustomerLedgerReportPage from "@/app/(admin)/admin/reports/customer-ledger/page";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
// The Account page's picker searches the API; here it hands over one customer.
vi.mock("@/components/admin/customers-picker", () => ({
  CustomerPicker: ({ onChange }: { onChange: (c: Customer) => void }) => <button onClick={() => onChange(student)}>Pick Sana</button>,
}));

const student = { id: "c9", name: "Sana Khan", phone: "+923001234567", khata_no: 12, balance_minor: 0, credit_limit_minor: 0, orders_count: 0, last_order_at: null, is_walk_in: false } as unknown as Customer;
const summary = { total_outstanding_minor: 0, customers_with_due: 0, credit_customers: 0, total_customers: 0, collected_this_month_minor: 0 };
const offError = () => new ApiError("module.disabled", "Customer accounts is switched off. The owner can switch it on in Settings, Modules.", 403);

type Route = (path: string, opts?: RequestOptions) => unknown;
/** Answers each GET by path; a function value gets the options, an Error value is thrown. */
function serve(routes: Record<string, unknown>) {
  vi.mocked(api).mockImplementation((async (path: string, opts?: RequestOptions) => {
    const hit = routes[`${opts?.method ?? "GET"} ${path}`] ?? routes[path];
    if (hit === undefined) throw new Error(`unexpected ${path}`);
    if (hit instanceof Error) throw hit;
    return typeof hit === "function" ? (hit as Route)(path, opts) : hit;
  }) as typeof api);
}
const calls = (path: string) => vi.mocked(api).mock.calls.filter(([p]) => p === path);

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(api).mockReset();
  useAuthStore.setState({
    session: {
      business: { id: "biz1", name: "Hostel Mess" }, branch: { id: "b1", day_end_time: "02:01" }, membership: { role: { system_key: "owner" } },
      permissions: ["customers.manage", "khata.adjust", "SEND_ACCOUNT_BILL", "reports.view_all", "settings.manage"], modules: { customer_accounts: true, payroll: false },
    } as unknown as Session,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useAuthStore.setState({ session: null });
});

describe("New customer form", () => {
  beforeEach(() => serve({
    "/me": { modules: { customer_accounts: true, payroll: false } },
    "/customers": { data: [], next_cursor: null },
    "/customer_groups": { data: [] },
    "/customers/ledger_summary": summary,
    "/customers/insights": { totals: { by_status: {} } },
    "/customers/duplicates": { data: [] },
    "POST /customers": student,
  }));

  it("refuses a khata limit under Rs 1, and at 00:30 dates the opening balance by the API's business day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 0, 30)); // still 12 Oct for a branch whose day ends at 02:01
    const user = userEvent.setup();
    withClient(<CustomersPage />);
    await user.click(screen.getByRole("button", { name: /New customer/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Sana Khan");
    await user.selectOptions(within(dialog).getByDisplayValue("Allowed, no limit"), "limit");
    const save = within(dialog).getByRole("button", { name: "Save" });
    const limit = within(dialog).getByLabelText("Credit limit");
    await user.clear(limit);
    expect(within(dialog).getByText("Enter a limit of at least Rs 1")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(limit, "8000");
    expect(save).toBeEnabled();
    const opening = within(dialog).getAllByRole("spinbutton").find((el) => el !== limit)!;
    await user.type(opening, "1500");
    expect(within(dialog).getByDisplayValue("2026-10-12")).toHaveAttribute("max", "2026-10-12");
    await user.click(save);
    await waitFor(() => expect(calls("/customers").some(([, o]) => o?.method === "POST")).toBe(true));
    const body = calls("/customers").find(([, o]) => o?.method === "POST")![1]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ name: "Sana Khan", credit_limit_minor: 800_000, opening_balance_minor: 150_000 });
    expect(body.opening_on).toBeUndefined();
  });
});

describe("Customer Account page", () => {
  it("reads a limit of 0 as khata not allowed, not as no limit", async () => {
    serve({ "/me": { modules: { customer_accounts: true, payroll: false } }, "/customers/c9/ledger": { customer: student, balance_minor: 0, entries: [], aging: { current: 0, "31_60": 0, "61_90": 0, over_90: 0, total: 0 } } });
    const user = userEvent.setup();
    withClient(<CustomerAccountPage />);
    await user.click(screen.getByRole("button", { name: "Pick Sana" }));
    expect(await screen.findByText("Khata not allowed")).toBeInTheDocument();
    expect(screen.queryByText("No credit limit")).toBeNull();
  });
});

describe("Monthly Bills", () => {
  it("asks for the bills once when 5000 is typed in Owes at least, not once per key", async () => {
    serve({
      "/customer_bills": { from: "2026-09-01", to: "2026-09-30", due_on: null, rows: [], totals: { customers: 0, due_minor: 0, charges_minor: 0, payments_minor: 0 }, last_run: null },
      "/bill_runs": { data: [] },
      "/settings": { version: 1, groups: {} },
    });
    const user = userEvent.setup();
    withClient(<MonthlyBillsPage />);
    await waitFor(() => expect(calls("/customer_bills")).toHaveLength(1));
    await user.type(screen.getByLabelText("Owes at least"), "5000");
    await waitFor(() => expect(calls("/customer_bills")).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 400)); // nothing more is on its way
    const minimums = calls("/customer_bills").map(([, o]) => (o?.query as Record<string, unknown>).min_balance_minor);
    expect(minimums).toEqual([undefined, 500_000]);
  });
});

describe("Customer Ledger report", () => {
  it("says why when customer accounts are off, instead of Rs 0 owed or a spinner that never stops", async () => {
    serve({
      "/customers/ledger_summary": offError(),
      "/customers": { data: [{ ...student, balance_minor: 50_000 }], next_cursor: null },
      "/customers/c9/ledger": offError(),
    });
    const user = userEvent.setup();
    withClient(<CustomerLedgerReportPage />);
    expect(await screen.findByText(/Customer accounts is switched off/)).toBeInTheDocument();
    expect(screen.queryByText("Outstanding")).toBeNull();
    await user.click(await screen.findByText("Sana Khan"));
    await waitFor(() => expect(screen.getByText(/Customer accounts is switched off/)).toBeInTheDocument());
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
