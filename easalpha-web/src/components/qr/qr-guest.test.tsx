import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QrGuestOrder, QrMenu } from "@/lib/qr-guest";

const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { QrGuestPage } from "./qr-guest";

const menu = (over: Partial<QrMenu> = {}): QrMenu => ({
  business: { name: "Demo Cafe", currency: "PKR", logo_key: null },
  branch: { id: "b1", name: "Main", address: "Gulberg 3", phone: null },
  table: { id: "t1", code: "T4", name: null, seats: 4 },
  settings: { enabled: true, cashier_accept: true, call_waiter: true, ask_bill: true, running_bill: true, guest_name: true, welcome: "Welcome! Order from your seat." },
  ordering: true,
  categories: [{ id: "c1", name: "Mains" }],
  products: [
    { id: "p1", category_id: "c1", name: "Chicken Karahi", description: null, image_key: null, base_price_minor: 120000, price_minor: 120000, variants: [], modifier_group_ids: [] } as unknown as NonNullable<QrMenu["products"]>[number],
    { id: "p2", category_id: "c1", name: "Zinger Burger", description: "Crispy", image_key: null, base_price_minor: 0, price_minor: 45000, variants: [{ id: "v1", product_id: "p2", name: "Single", price_minor: 45000, sku: null, sort_order: 1 }, { id: "v2", product_id: "p2", name: "Double", price_minor: 65000, sku: null, sort_order: 2 }], modifier_group_ids: ["g1"] } as unknown as NonNullable<QrMenu["products"]>[number],
  ],
  modifier_groups: [{ id: "g1", name: "Spice level", min_select: 1, max_select: 1, required: true, sort_order: 1, modifiers: [{ id: "m1", name: "Mild", name_ur: null, price_minor: 0, sort_order: 1, active: true }, { id: "m2", name: "Extra hot", name_ur: null, price_minor: 2000, sort_order: 2, active: true }] }],
  deals: [],
  running_bill: null,
  ...over,
});

const order = (over: Partial<QrGuestOrder> = {}): QrGuestOrder => ({
  id: "o1", guest_token: "g1", label: "#2041", status: "draft", qr_status: "pending", guest_name: "Ali", table_code: "T4",
  items: [{ name: "Chicken Karahi", quantity: "1", line_total_minor: 120000, status: "pending" }], subtotal_minor: 120000, tax_minor: 0, service_charge_minor: 0, total_minor: 120000, message: "Waiting", ...over,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><QrGuestPage token="tok1" /></QueryClientProvider>);
}

beforeEach(() => { localStorage.clear(); apiMock.mockReset(); });

describe("QrGuestPage", () => {
  it("shows the brand, table and welcome, adds a dish, picks a size and spice, and places the order", async () => {
    apiMock.mockImplementation((path: string, opts: { method?: string }) => {
      if (path === "/qr/tok1") return Promise.resolve(menu());
      if (path === "/qr/tok1/orders" && opts?.method === "POST") return Promise.resolve(order());
      if (path === "/qr/tok1/orders/o1") return Promise.resolve(order({ qr_status: "accepted", status: "placed", items: [{ name: "Chicken Karahi", quantity: "1", line_total_minor: 120000, status: "sent" }] }));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Demo Cafe" })).toBeInTheDocument();
    expect(screen.getByText("Table T4")).toBeInTheDocument();
    expect(screen.getByText("Welcome! Order from your seat.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Chicken Karahi" }));
    expect(screen.getByText("1 item · Rs 1,200")).toBeInTheDocument();
    // A burger has sizes and a required spice level: the chooser opens and Add waits for the spice.
    fireEvent.click(screen.getByRole("button", { name: "Add Zinger Burger" }));
    const dialog = screen.getByRole("dialog");
    const add = within(dialog).getByRole("button", { name: /^Add · / });
    expect(add).toBeDisabled();
    expect(within(dialog).getByText("Choose one from Spice level")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Double/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Extra hot/ }));
    expect(add).toHaveTextContent("Add · Rs 670");
    fireEvent.click(add);
    expect(screen.getByText("2 items · Rs 1,870")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("easalpha.qr.tok1")!).lines).toHaveLength(2);
    // Checkout: the name is required here, then the order posts the lines the API wants.
    fireEvent.click(screen.getByRole("button", { name: "View order" }));
    const sheet = screen.getByRole("dialog");
    const place = within(sheet).getByRole("button", { name: /Place order/ });
    expect(place).toBeDisabled();
    fireEvent.change(within(sheet).getByPlaceholderText("So the waiter knows who ordered"), { target: { value: "Ali" } });
    expect(place).toBeEnabled();
    fireEvent.click(place);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/qr/tok1/orders", expect.objectContaining({ method: "POST", auth: "none" })));
    const body = apiMock.mock.calls.find((c) => c[0] === "/qr/tok1/orders")![1].body;
    expect(body.guest_name).toBe("Ali");
    expect(body.lines).toEqual([
      { product_id: "p1", variant_id: undefined, quantity: 1, modifiers: undefined, notes: undefined },
      { product_id: "p2", variant_id: "v2", quantity: 1, modifiers: [{ modifier_id: "m2", quantity: 1 }], notes: undefined },
    ]);
    await waitFor(() => expect(screen.getByText("Being prepared")).toBeInTheDocument());
    expect(screen.getByText("Order #2041")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("easalpha.qr.tok1")!).lines).toEqual([]);
  });

  it("calls a waiter and shows the running bill", async () => {
    apiMock.mockImplementation((path: string, opts: { method?: string }) => {
      if (path === "/qr/tok1") return Promise.resolve(menu());
      if (path === "/qr/tok1/requests" && opts?.method === "POST") return Promise.resolve({ id: "r1", kind: "call_waiter", handled: false });
      if (path === "/qr/tok1/bill") return Promise.resolve({ order_id: "o9", items: [{ name: "Chai", quantity: "2", line_total_minor: 16000 }], subtotal_minor: 16000, total_minor: 16000, paid_minor: 0 });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Call a waiter" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Waiter called" })).toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith("/qr/tok1/requests", expect.objectContaining({ method: "POST", body: { kind: "call_waiter", guest_name: undefined } }));
    fireEvent.click(screen.getByRole("button", { name: "Table bill" }));
    await waitFor(() => expect(screen.getByText("Chai")).toBeInTheDocument());
    expect(screen.getAllByText("Rs 160")).toHaveLength(3); // the line, the subtotal and the total
  });

  it("explains when ordering is off or the card is not valid", async () => {
    apiMock.mockResolvedValue(menu({ ordering: false, message: "Ordering is not available right now. Please ask a waiter." }));
    renderPage();
    expect(await screen.findByText("Ordering from the phone is off right now")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  });
});
