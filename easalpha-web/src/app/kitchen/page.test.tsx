import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KitchenOrder } from "@/lib/types";

// Leftovers of 7 Nov 2026 (L3): a deal's card line named the deal and nothing of what is in it, on every station.
const h = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (...a: unknown[]) => h.api(...a) }));
vi.mock("@/lib/cable", () => ({ subscribe: () => ({ close: () => {} }) }));
vi.mock("@/components/admin/push-enable", () => ({ PushToggle: () => null }));
vi.mock("@/components/kitchen/auth", () => ({
  KitchenGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useKitchenToken: () => ({ token: "kds", ready: true, kind: "device", tillOnly: false }),
  useBeep: () => () => {},
}));

import KitchenPage from "./page";

const part = (name: string, station_id: string, quantity = 1) => ({ name, station_id, quantity, product_id: `p-${name}`, variant_id: null });
const order = {
  id: "o-1", label: "#12", status: "placed", order_type: "takeaway", table_code: null, notes: null, placed_at: new Date().toISOString(), created_at: new Date().toISOString(), elapsed_seconds: 30,
  items: [{ id: "i-1", name: "Lunch Box", quantity: "2.0", status: "sent", station_id: "grill", deal_id: "deal-1", modifiers: [], notes: null, deal_components: [part("Zinger Burger", "grill"), part("Chai", "drinks", 2)] }],
} as unknown as KitchenOrder;

beforeEach(() => {
  localStorage.clear();
  h.api.mockReset();
  h.api.mockImplementation(async (path: string) => {
    if (path === "/stations") return { data: [{ id: "grill", name: "Grill" }, { id: "drinks", name: "Drinks" }] };
    if (path === "/kitchen/orders") return { data: [order], server_time: new Date().toISOString() };
    if (path === "/kitchen/tickets") return { data: [] };
    return {};
  });
});
afterEach(() => cleanup());

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KitchenPage /></QueryClientProvider>);
const parts = async () => within(await screen.findByLabelText("Parts of Lunch Box")).getAllByRole("listitem").map((li) => li.textContent);

describe("Kitchen display: a deal's parts", () => {
  it("lists every part with its station on All stations, and only the station's own on its screen, where a line bump names the station", async () => {
    show();
    await waitFor(async () => expect(await parts()).toEqual(["2 Zinger Burger · Grill", "4 Chai · Drinks"]));
    fireEvent.change(screen.getByLabelText("Station"), { target: { value: "drinks" } });
    await waitFor(async () => expect(await parts()).toEqual(["4 Chai"]));
    fireEvent.click(screen.getByLabelText("Bump item"));
    await waitFor(() => expect(h.api).toHaveBeenCalledWith("/kitchen/items/i-1/bump", { method: "POST", body: { station_id: "drinks" } }));
  });
});
