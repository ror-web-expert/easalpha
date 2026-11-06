import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Address, Customer, ZoneQuote } from "@/lib/types";
import { useCartStore, type Cart } from "@/store/cart";

const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { DeliveryAddressDialog, useDeliveryAddress } from "./delivery-address";

const address = (id: string, over: Partial<Address> = {}): Address => ({ id, customer_id: "hira", label: null, line1: "House 12", line2: null, area: "Phase 5 DHA", city: null, lat: null, lng: null, is_default: false, text: "House 12, Phase 5 DHA", ...over });
const hira = (addresses: Address[]) => ({ id: "hira", name: "Hira", phone: "+923005556677", addresses }) as unknown as Customer;
const dha: ZoneQuote = { zone: { id: "z", branch_id: "b", name: "DHA", areas: ["DHA"], polygon: [], charge_minor: 15_000, min_order_minor: 50_000, eta_minutes: 40, active: true, archived_at: null }, charge_minor: 15_000, min_order_minor: 50_000, eta_minutes: 40 };
const none: ZoneQuote = { zone: null, charge_minor: 0, min_order_minor: 0, eta_minutes: null };

/** GET /customers/hira answers with these addresses; a quote is DHA for "Phase 5" and no zone elsewhere. */
function serve(addresses: Address[]) {
  apiMock.mockImplementation((path: string, opts: { query?: Record<string, string>; method?: string; body?: Record<string, unknown> }) => {
    if (path === "/customers/hira" && !opts?.method) return Promise.resolve(hira(addresses));
    if (path === "/delivery_zones/quote") return Promise.resolve(opts.query?.text?.includes("Phase 5") ? dha : none);
    if (path === "/customers/hira/addresses" && opts.method === "POST") return Promise.resolve(address("new", { line1: String(opts.body?.line1), area: (opts.body?.area as string) ?? null, text: `${opts.body?.line1}, ${opts.body?.area}` }));
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const deliveryCart = (over: Partial<Cart> = {}): Cart => ({
  id: "o1", saved: false, local_only: false, status: "draft", order_type: "delivery", lines: [], customer: { id: "hira", name: "Hira", phone: "+923005556677" }, table_id: null, table_code: null,
  guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: "2026-11-06T10:00:00Z", ...over,
});

beforeEach(() => { apiMock.mockReset(); useCartStore.setState({ cart: deliveryCart() }); });

describe("the till's delivery address dialog", () => {
  it("offers the customer's default address with its zone and puts it on with the zone's charge", async () => {
    serve([address("office", { line1: "Office 4", area: "Gulberg", text: "Office 4, Gulberg" }), address("home", { is_default: true })]);
    const onPick = vi.fn();
    render(<DeliveryAddressDialog open onClose={vi.fn()} customer={{ id: "hira", name: "Hira", phone: null }} currentId={null} onPick={onPick} onChooseCustomer={vi.fn()} />);
    expect(await screen.findByRole("option", { name: /House 12/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/Zone DHA: delivery Rs 150, about 40 min\. Minimum order Rs 500\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
    expect(onPick).toHaveBeenCalledWith({ address_id: "home", address_text: "House 12, Phase 5 DHA", zone_name: "DHA", delivery_charge_minor: 15_000, delivery_charge_percent: 0 });

    // Another address outside every zone: the standard charge again.
    fireEvent.click(screen.getByRole("option", { name: /Office 4/ }));
    expect(await screen.findByText(/No delivery zone covers this address/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ address_id: "office", zone_name: null, delivery_charge_minor: undefined }));
  });

  it("asks for an address when the customer has none, and saves it on the customer", async () => {
    serve([]);
    const onPick = vi.fn();
    render(<DeliveryAddressDialog open onClose={vi.fn()} customer={{ id: "hira", name: "Hira", phone: null }} currentId={null} onPick={onPick} onChooseCustomer={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Address"), { target: { value: "House 9" } });
    fireEvent.change(screen.getByLabelText("Area"), { target: { value: "Phase 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByRole("option", { name: /House 9/ })).toHaveAttribute("aria-selected", "true");
    expect(apiMock).toHaveBeenCalledWith("/customers/hira/addresses", expect.objectContaining({ method: "POST", body: expect.objectContaining({ line1: "House 9", area: "Phase 5", is_default: true }) }));
    await screen.findByText(/Zone DHA/);
    fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ address_id: "new", delivery_charge_minor: 15_000 }));
  });

  it("sends the cashier to pick a customer first", () => {
    const onChoose = vi.fn();
    render(<DeliveryAddressDialog open onClose={vi.fn()} customer={null} currentId={null} onPick={vi.fn()} onChooseCustomer={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /Choose customer/ }));
    expect(onChoose).toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

function Harness({ customerId, preferred }: { customerId: string; preferred?: string }) {
  const a = useDeliveryAddress({ onChooseCustomer: vi.fn() });
  return <><button onClick={() => void a.forCustomer({ id: customerId }, preferred)}>pick</button><span>{a.open ? "dialog open" : "dialog closed"}</span>{a.dialog}</>;
}

describe("a customer picked for a delivery", () => {
  it("gets their usual address on the order at once, with the zone's charge", async () => {
    serve([address("home", { is_default: true })]);
    render(<Harness customerId="hira" />);
    await act(async () => { fireEvent.click(screen.getByText("pick")); });
    await waitFor(() => expect(useCartStore.getState().cart).toMatchObject({ address_id: "home", address_text: "House 12, Phase 5 DHA", zone_name: "DHA", delivery_charge_minor: 15_000 }));
    expect(screen.getByText("dialog closed")).toBeInTheDocument();
  });

  it("opens the dialog when they have no address", async () => {
    serve([]);
    render(<Harness customerId="hira" />);
    await act(async () => { fireEvent.click(screen.getByText("pick")); });
    expect(await screen.findByText("dialog open")).toBeInTheDocument();
  });

  it("never lands on an order that moved on to another customer meanwhile", async () => {
    serve([address("home", { is_default: true })]);
    act(() => { useCartStore.setState({ cart: deliveryCart({ customer: { id: "omar", name: "Omar", phone: null } }) }); });
    render(<Harness customerId="hira" />);
    await act(async () => { fireEvent.click(screen.getByText("pick")); await new Promise((r) => setTimeout(r, 0)); });
    expect(apiMock).toHaveBeenCalledWith("/customers/hira", expect.anything());
    expect(apiMock).not.toHaveBeenCalledWith("/delivery_zones/quote", expect.anything());
    expect(useCartStore.getState().cart.address_id).toBeUndefined();
    expect(screen.getByText("dialog closed")).toBeInTheDocument();
  });
});
