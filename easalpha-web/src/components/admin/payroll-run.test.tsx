import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PaymentAccount, PaymentMethod, PayrollRunDetail } from "@/lib/types";
import { api } from "@/lib/api";
import { RunDetailPanel } from "./payroll-run";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

const method = (over: Partial<PaymentMethod>): PaymentMethod =>
  ({ id: over.code ?? "m", code: "cash", name: "Cash", kind: "cash", payment_account_id: "acc-cash", active: true, works_offline: true, needs_reference: false, sort_order: 0, ...over });
const methods = [
  method({}), method({ code: "bank", name: "Bank transfer", kind: "bank", payment_account_id: "acc-bank", sort_order: 4 }),
  method({ code: "canteen_subsidy", name: "Company subsidy", kind: "custom", payment_account_id: null, internal: true, sort_order: 99 }),
  method({ code: "canteen_payroll", name: "Salary deduction", kind: "custom", payment_account_id: null, internal: true, sort_order: 99 }),
];
const account = (id: string, name: string, balance: number) => ({ id, name, kind: "cash", current_balance_minor: balance, active: true }) as PaymentAccount;
const run = { id: "run1", label: "PR-2026-11", month: "2026-11", status: "generated", employees_count: 12, gross_minor: 6_400_000, deductions_minor: 155_100, net_minor: 6_244_900, payslips: [], created_at: "2026-11-30T10:00:00Z" } as unknown as PayrollRunDetail;

function serve(accounts: PaymentAccount[]) {
  vi.mocked(api).mockImplementation((async (path: string) => {
    if (path === "/payroll/runs/run1") return run;
    if (path === "/payment_methods") return { data: methods };
    if (path === "/payment_accounts") return { data: accounts };
    throw new Error(`unexpected ${path}`);
  }) as typeof api);
}

async function openPay() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><RunDetailPanel runId="run1" /></QueryClientProvider>);
  await userEvent.click(await screen.findByRole("button", { name: /Sync to Expenses \/ Pay/ }));
  return screen.findByRole("dialog");
}

beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);

describe("Run Payroll: Paid from (QA B15)", () => {
  it("offers only methods that move money and warns when the account would go below zero", async () => {
    serve([account("acc-cash", "Cash", 1_200_000), account("acc-bank", "Bank", 90_000_000)]);
    const dialog = await openPay();
    const select = within(dialog).getByRole("combobox", { name: "Payment method" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Cash", "Bank transfer"]);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Cash holds Rs 12,000. Paying Rs 62,449 from it takes it to -Rs 50,449.");
    // A warning, not a block: the payment can still be made.
    expect(within(dialog).getByRole("button", { name: /Pay Rs 62,449/ })).toBeEnabled();
    await userEvent.selectOptions(select, "bank");
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});
