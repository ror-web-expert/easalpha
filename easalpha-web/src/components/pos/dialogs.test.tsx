import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Customer, CustomerLookup, Order } from "@/lib/types";

const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { CustomerDialog } from "./dialogs";

const customer = (id: string, name: string, phone: string | null): Customer => ({
  id, khata_no: null, name, phone, email: null, company: null, group_id: null, source: "in_store", status: "active", is_walk_in: false,
  credit_limit_minor: null, balance_minor: 0, loyalty_points: 0, birthday: null, whatsapp_opt_in: false, orders_count: 3, net_spent_minor: 0,
  last_order_at: null, notes: null, archived_at: null, created_at: "2026-10-01T00:00:00Z",
});
const order = (id: string, total: number) => ({ id, total_minor: total, order_type: "takeaway", items: [{ id: `${id}-1`, name: "Chai", quantity: "1", status: "placed" }] }) as unknown as Order;

const ali = customer("ali", "Ali Raza", "+923001111111");
const aliOrder = order("o-ali", 120000);

/** /customers/search lists both; Ali's lookup waits for the test, others answer from `lookups` at once. */
function serve(bilal: Customer, lookups: Record<string, CustomerLookup> = {}) {
  let releaseAli: () => void = () => undefined;
  apiMock.mockImplementation((path: string, opts: { query: Record<string, string> }) => {
    if (path === "/customers/search") return Promise.resolve({ data: [ali, bilal] });
    if (path === "/customers/lookup" && opts.query.phone === ali.phone) {
      return new Promise((resolve) => { releaseAli = () => resolve({ found: true, customer: ali, last_order: aliOrder }); });
    }
    if (path === "/customers/lookup") return Promise.resolve(lookups[opts.query.phone] ?? { found: false });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
  return () => releaseAli();
}

function renderDialog() {
  const onPick = vi.fn();
  const onRepeat = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const dialog = (open: boolean) => <QueryClientProvider client={qc}><CustomerDialog open={open} onClose={vi.fn()} onPick={onPick} onRepeat={onRepeat} /></QueryClientProvider>;
  const { rerender } = render(dialog(true));
  return { onPick, onRepeat, reopen: () => { rerender(dialog(false)); rerender(dialog(true)); } };
}

async function pick(text: string, name: string) {
  fireEvent.change(screen.getByLabelText("Search customers"), { target: { value: text } });
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
  await screen.findByRole("button", { name: "Use this customer" });
}

beforeEach(() => { apiMock.mockReset(); });

describe("CustomerDialog last order", () => {
  it("drops a slow lookup for an earlier pick instead of offering its order on the later one", async () => {
    const bilal = customer("bilal", "Bilal Khan", null);
    const releaseAli = serve(bilal);
    renderDialog();
    await pick("ali", "Ali Raza");
    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    await pick("bil", "Bilal Khan");
    await act(async () => { releaseAli(); });
    expect(screen.getByText("Bilal Khan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Repeat last order/ })).toBeNull();
  });

  it("repeats the order of the customer on screen, not one a slow lookup brought back later", async () => {
    const bilal = customer("bilal", "Bilal Khan", "+923002222222");
    const bilalOrder = order("o-bilal", 50000);
    const releaseAli = serve(bilal, { [bilal.phone!]: { found: true, customer: bilal, last_order: bilalOrder } });
    const { onPick, onRepeat } = renderDialog();
    await pick("ali", "Ali Raza");
    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    await pick("bil", "Bilal Khan");
    await screen.findByRole("button", { name: /Repeat last order/ });
    await act(async () => { releaseAli(); });
    fireEvent.click(screen.getByRole("button", { name: /Repeat last order/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "bilal" }));
    expect(onRepeat).toHaveBeenCalledWith(bilalOrder);
  });

  it("drops a lookup from before the dialog was closed and opened again", async () => {
    const bilal = customer("bilal", "Bilal Khan", null);
    const releaseAli = serve(bilal);
    const { reopen } = renderDialog();
    await pick("ali", "Ali Raza");
    reopen();
    await pick("bil", "Bilal Khan");
    await act(async () => { releaseAli(); });
    expect(screen.queryByRole("button", { name: /Repeat last order/ })).toBeNull();
  });
});
