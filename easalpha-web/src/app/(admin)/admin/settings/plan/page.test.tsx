import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Billing, BillingInvoice, Session } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/settings/plan", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import PlanPage from "./page";

// L2, 7 Nov 2026: the Open invoices card added every open invoice up as rupees, so a business billed in dollars read
// "Rs 39 due" for a $39 invoice.
const invoice = (over: Partial<BillingInvoice>): BillingInvoice => ({
  id: "inv-1", number: "INV-0001", amount_minor: 39_00, currency: "USD", due_on: "2026-11-14", status: "unpaid", period_label: "Nov 2026", lines: [], payment_method: null, payment_reference: null,
  reported_at: null, confirmed_at: null, created_at: "2026-11-07T08:00:00Z", ...over,
});
const billing = (invoices: BillingInvoice[]): Billing => ({
  business: { id: "biz", name: "Dubai Grill", country: "AE", currency: "AED", status: "trial", trial_ends_on: "2026-12-01", trial_days_left: 24, plan: null } as unknown as Billing["business"],
  subscription: null, plans: [], invoices, usage: {}, payment_instructions: { provider: "manual" },
});

beforeEach(() => {
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Owner" }, business: { id: "biz", name: "Dubai Grill" }, branch: { id: "b1" }, membership: { id: "m1", role: { name: "Owner", system_key: "owner" } }, permissions: ["billing.manage", "settings.manage"], businesses: [], modules: {} } as unknown as Session, branchId: "b1" });
  vi.mocked(api).mockReset();
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("Plan page, Open invoices", () => {
  it("sums the open invoices in their own currency", async () => {
    vi.mocked(api).mockResolvedValue(billing([invoice({}), invoice({ id: "inv-2", number: "INV-0002", amount_minor: 9_00 }), invoice({ id: "inv-3", number: "INV-0003", status: "paid", amount_minor: 500_00 })]));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlanPage /></QueryClientProvider>);
    expect(await screen.findByText("$48.00 due")).toBeInTheDocument();
    expect(screen.queryByText(/Rs 48/)).toBeNull();
  });
});
