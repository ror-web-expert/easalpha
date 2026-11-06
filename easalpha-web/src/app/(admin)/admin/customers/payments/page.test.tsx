import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { Session } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("customer_id=c1"), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/customers/payments" }));

import CustomerPaymentsPage from "./page";
import { useAuthStore } from "@/store/auth";

// K6, contracts#8: a bank transfer that came yesterday is recorded on yesterday. The API took received_on from users
// with khata.adjust, but no screen sent it.
const session = (permissions: string[]) => ({
  access_token: "t", refresh_token: "r", user: { name: "Owner One", email: "owner@example.com" },
  business: { id: "biz1", name: "Hostel Mess", plan: null }, branch: { id: "b-1", name: "Main", day_end_time: "02:01" }, businesses: [],
  membership: { role: { name: "Manager", system_key: "manager" } }, permissions, modules: { customer_accounts: true },
}) as unknown as Session;

const ali = { id: "c1", khata_no: 7, name: "Ali Raza", phone: "+923001112233", balance_minor: 9_280, status: "active", is_walk_in: false };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CustomerPaymentsPage /></QueryClientProvider>);
}

/** Opens Record payment for the customer the page came with (?customer_id=c1) and types Rs 92.80. */
async function recordPayment() {
  renderPage();
  await screen.findAllByText(/Ali Raza/);
  fireEvent.click(screen.getByRole("button", { name: /Record payment/ }));
  fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "92.80" } });
}

const posted = () => vi.mocked(api).mock.calls.find(([path, opts]) => path === "/customers/c1/payments" && (opts as { method?: string })?.method === "POST")?.[1] as { body: Record<string, unknown> } | undefined;

configure({ asyncUtilTimeout: 4000 });

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string) => {
    if (path === "/customers/c1") return ali;
    if (path === "/payment_methods") return { data: [{ id: "m1", code: "cash", name: "Cash", kind: "cash", active: true }, { id: "m2", code: "bank", name: "Bank transfer", kind: "bank", active: true }] };
    if (path === "/customer_payments") return { data: [], next_cursor: null, totals: { received_minor: 0, paid_minor: 0, count: 0 } };
    if (path === "/customers/c1/payments") return { payment: { id: "p1" }, customer: ali };
    return { data: [] };
  }) as typeof api);
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("Customer Payments, Record payment", () => {
  it("lets a user with khata.adjust date the money to the day it came", async () => {
    useAuthStore.setState({ session: session(["khata.collect", "khata.adjust", "customers.manage"]), branchId: "b-1" });
    await recordPayment();
    fireEvent.change(screen.getByLabelText("Received on"), { target: { value: "2026-10-31" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()!.body).toMatchObject({ amount_minor: 9_280, method_code: "cash", direction: "received", received_on: "2026-10-31" });
  }, 20_000);

  it("records today's money without a date field for a user without khata.adjust", async () => {
    useAuthStore.setState({ session: session(["khata.collect", "customers.manage"]), branchId: "b-1" });
    await recordPayment();
    expect(screen.queryByLabelText("Received on")).toBeNull();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()!.body.received_on).toBeUndefined();
  }, 20_000);
});
