import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Storefront, StorefrontOrder } from "@/lib/types";
import { useStorefrontCart } from "@/store/storefront-cart";

const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { StorefrontView } from "./storefront";

const storefront = (over: Partial<Storefront["config"]> = {}): Storefront => ({
  business: { name: "Demo Cafe", slug: "demo-cafe", currency: "PKR", logo_key: null, phone: "+923001112222" },
  branch: { id: "b1", name: "Main", address: "1 Mall Road", hours: "09:00 to 23:00" },
  config: {
    identity: { name: "Demo Cafe", theme_color: "#10294d" },
    pages: { menu: true, contact: true, reviews: true },
    delivery: { enabled: true, eta_minutes: 45, min_order_minor: 50000, free_above_minor: null },
    availability: { online_ordering: true, closed_message: "We are closed right now" },
    pricing: { show_prices: true },
    whatsapp: { number: "+923001112222", show_button: true },
    ...over,
  },
  menus: [],
  categories: [{ id: "c1", name: "Mains", subtitle: null, menu_id: null }],
  products: [
    { id: "p1", name: "Chicken Karahi", description: null, category_id: "c1", price_minor: 120000, image_key: null, variants: [] },
    { id: "p2", name: "Pizza", description: "Wood fired", category_id: "c1", price_minor: 0, image_key: "http://x/pizza.jpg", variants: [{ id: "v1", name: "Small", price_minor: 90000 }, { id: "v2", name: "Large", price_minor: 150000 }] },
  ],
  reviews: { summary: { total: 23, rated: 23, pending: 0, average: 4.56, five_star: 10, one_star: 1, by_rating: {} }, recent: [] },
});

const order = (over: Partial<StorefrontOrder> = {}): StorefrontOrder => ({
  id: "o1", label: "#1042", guest_token: "tok", order_type: "delivery", status: "placed", qr_status: "accepted", spec_status: null, stage: "accepted", eta_minutes: 45,
  created_at: "2026-10-11T10:00:00Z", placed_at: null, ready_at: null, customer: { name: "Ali", address: "12 Main St" },
  items: [{ name: "Chicken Karahi", quantity: "1", line_total_minor: 120000 }], subtotal_minor: 120000, delivery_charge_minor: 15000, tax_minor: 0, total_minor: 135000, currency: "PKR", ...over,
});

function renderStore(data = storefront()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><StorefrontView slug="demo-cafe" data={data} /></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  apiMock.mockReset();
  window.history.replaceState({}, "", "/store/demo-cafe");
  useStorefrontCart.setState({ slug: null, lines: [], lastOrder: null, hydrated: false, order_type: "delivery", customer: { name: "", phone: "", address: "", area: "", city: "" }, notes: "" });
});

describe("StorefrontView ordering", () => {
  it("shows the rating next to the hours, a placeholder image for products without one, and Add buttons", async () => {
    const { container } = renderStore();
    const rating = screen.getByRole("link", { name: /Rated 4.6 out of 5 from 23 reviews/ });
    expect(rating).toHaveAttribute("href", "#reviews");
    expect(rating).toHaveTextContent("4.6 · 23 reviews");
    // Chicken Karahi has no image: the cloche placeholder renders; Pizza keeps its <img>.
    const karahi = screen.getByText("Chicken Karahi").closest("li")!;
    expect(karahi.querySelector("svg")).not.toBeNull();
    expect(karahi.querySelector("img")).toBeNull();
    expect(container.querySelector('img[src="http://x/pizza.jpg"]')).not.toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Chicken Karahi" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Choose Pizza" })).toBeInTheDocument();
  });

  it("adds to the cart, swaps the Add button for a stepper and shows the cart bar", async () => {
    renderStore();
    await waitFor(() => expect(useStorefrontCart.getState().hydrated).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Add Chicken Karahi" }));
    expect(useStorefrontCart.getState().lines).toEqual([{ key: "p1", product_id: "p1", variant_id: null, name: "Chicken Karahi", variant_name: null, unit_minor: 120000, quantity: 1 }]);
    const stepper = screen.getByRole("group", { name: "Chicken Karahi quantity" });
    fireEvent.click(within(stepper).getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByText("2 items · Rs 2,400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View cart" })).toBeInTheDocument();
    // Variants: Choose opens the picker, tapping a variant adds that line.
    fireEvent.click(screen.getByRole("button", { name: "Choose Pizza" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Pizza Large" }));
    expect(useStorefrontCart.getState().lines.map((l) => l.key)).toEqual(["p1", "p2:v2"]);
    expect(screen.getByText("1 in cart")).toBeInTheDocument();
    expect(screen.getByText("3 items · Rs 3,900")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("servio.store.cart")!).state.lines).toHaveLength(2);
  });

  it("opens the cart sheet, blocks Place order until the form is valid, then shows tracking on success", async () => {
    apiMock.mockImplementation((path: string, opts: { method?: string }) => {
      if (opts?.method === "POST") return Promise.resolve(order({ stage: "waiting" }));
      if (path.includes("/orders/o1")) return Promise.resolve(order({ stage: "preparing" }));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderStore();
    await waitFor(() => expect(useStorefrontCart.getState().hydrated).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Add Chicken Karahi" }));
    fireEvent.click(screen.getByRole("button", { name: "View cart" }));
    const dialog = screen.getByRole("dialog");
    const place = within(dialog).getByRole("button", { name: /Place order/ });
    expect(place).toBeDisabled();
    expect(within(dialog).getByText(/Delivery in about 45 minutes · minimum order Rs 500/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText("Full name"), { target: { value: "Ali" } });
    fireEvent.change(within(dialog).getByPlaceholderText("+92 3xx xxxxxxx"), { target: { value: "0300 1234567" } });
    expect(place).toBeDisabled(); // address still missing for delivery
    fireEvent.change(within(dialog).getByPlaceholderText("House, street, landmark"), { target: { value: "12 Main St" } });
    expect(place).toBeEnabled();
    fireEvent.click(place);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/public/storefront/demo-cafe/orders", expect.objectContaining({ method: "POST", auth: "none" })));
    const body = apiMock.mock.calls[0][1].body;
    expect(body.lines).toEqual([{ product_id: "p1", variant_id: undefined, quantity: 1 }]);
    expect(body.customer).toMatchObject({ name: "Ali", phone: "0300 1234567", address: "12 Main St" });
    await waitFor(() => expect(screen.getByText("Preparing your order")).toBeInTheDocument());
    expect(useStorefrontCart.getState().lines).toEqual([]);
    expect(useStorefrontCart.getState().lastOrder).toEqual({ id: "o1", guest_token: "tok" });
    expect(screen.getByText("Order #1042")).toBeInTheDocument();
    expect(screen.getByText("Rs 1,350")).toBeInTheDocument();
    expect(screen.getByText(/Estimated delivery in about 45 minutes/)).toBeInTheDocument();
  });

  it("refuses a delivery below the minimum with a friendly line", async () => {
    renderStore(storefront({ delivery: { enabled: true, min_order_minor: 500000 } }));
    await waitFor(() => expect(useStorefrontCart.getState().hydrated).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Add Chicken Karahi" }));
    fireEvent.click(screen.getByRole("button", { name: "View cart" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("The minimum order for delivery is Rs 5,000. Add Rs 3,800 more to continue.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Pickup" }));
    expect(within(dialog).queryByText(/minimum order for delivery/)).toBeNull();
  });

  it("hides Add buttons and shows the closed message when online ordering is off", async () => {
    renderStore(storefront({ availability: { online_ordering: false, closed_message: "Back at 6 pm" } }));
    await waitFor(() => expect(useStorefrontCart.getState().hydrated).toBe(true));
    expect(screen.getByText("Back at 6 pm")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
    expect(screen.getByText("Chicken Karahi")).toBeInTheDocument(); // the menu stays visible
  });

  it("opens the tracking view from the ?order=&token= deep link and shows the rejected state with the phone", async () => {
    apiMock.mockResolvedValue(order({ id: "o9", stage: "rejected" }));
    window.history.replaceState({}, "", "/store/demo-cafe?order=o9&token=abc");
    renderStore();
    await waitFor(() => expect(screen.getByText("Order rejected")).toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith("/public/storefront/demo-cafe/orders/o9", expect.objectContaining({ auth: "none", query: { guest_token: "abc" } }));
    expect(useStorefrontCart.getState().lastOrder).toEqual({ id: "o9", guest_token: "abc" });
    expect(screen.getByRole("link", { name: /Call \+923001112222/ })).toHaveAttribute("href", "tel:+923001112222");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/923001112222");
  });

  it("offers Track my order from the bar when the cart is empty but an order is live", async () => {
    apiMock.mockResolvedValue(order({ stage: "on_the_way" }));
    renderStore();
    await waitFor(() => expect(useStorefrontCart.getState().hydrated).toBe(true));
    act(() => useStorefrontCart.getState().setLastOrder({ id: "o1", guest_token: "tok" }));
    fireEvent.click(await screen.findByRole("button", { name: "Track my order" }));
    await waitFor(() => expect(screen.getByText("On the way", { selector: "h3" })).toBeInTheDocument());
    const progress = screen.getByRole("list", { name: "Order progress" });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(5);
  });
});
