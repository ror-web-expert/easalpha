import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Customer } from "@/lib/types";

const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { CustomerSearch } from "./customer-search";

const customer = (id: string, name: string, over: Partial<Customer> = {}): Customer => ({
  id, khata_no: null, name, phone: null, email: null, company: null, group_id: null, source: "in_store", status: "active", is_walk_in: false,
  credit_limit_minor: null, balance_minor: 0, loyalty_points: 0, birthday: null, whatsapp_opt_in: false, orders_count: 0, net_spent_minor: 0,
  last_order_at: null, notes: null, archived_at: null, created_at: "2026-10-01T00:00:00Z", ...over,
});

/** GET /customers/search answers per typed text; a text missing from `slow` answers at once. */
function searchReturns(byText: Record<string, Customer[]>, slow: string[] = []) {
  const release: Record<string, () => void> = {};
  apiMock.mockImplementation((_path: string, opts: { query: { q: string } }) => {
    const data = byText[opts.query.q] ?? [];
    if (!slow.includes(opts.query.q)) return Promise.resolve({ data });
    return new Promise((resolve) => { release[opts.query.q] = () => resolve({ data }); });
  });
  return release;
}

function renderSearch() {
  const onPick = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><CustomerSearch onPick={onPick} /></QueryClientProvider>);
  return { onPick, box: screen.getByLabelText("Search customers") };
}

beforeEach(() => { apiMock.mockReset(); });

describe("CustomerSearch Enter", () => {
  it("never picks from an earlier search still showing; picks the best match once the typed text's results arrive", async () => {
    const release = searchReturns({ "12": [customer("c12", "Khata Twelve")], "123": [customer("c123", "Khata One Two Three")] }, ["123"]);
    const { onPick, box } = renderSearch();
    fireEvent.change(box, { target: { value: "12" } });
    await screen.findByText("Khata Twelve");
    fireEvent.change(box, { target: { value: "123" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
    await waitFor(() => expect(release["123"]).toBeDefined());
    expect(onPick).not.toHaveBeenCalled();
    act(() => release["123"]());
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0][0].id).toBe("c123");
  });

  it("picks the highlighted row at once when the results match the text", async () => {
    searchReturns({ ali: [customer("a1", "Ali Raza"), customer("a2", "Ali Khan")] });
    const { onPick, box } = renderSearch();
    fireEvent.change(box, { target: { value: "ali" } });
    await screen.findByText("Ali Khan");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe("a2");
  });

  it("drops a waiting Enter when the cashier keeps typing", async () => {
    searchReturns({ "12": [customer("c12", "Khata Twelve")], "123": [customer("c123", "Khata One Two Three")], "1234": [customer("c1234", "Khata 1234")] });
    const { onPick, box } = renderSearch();
    fireEvent.change(box, { target: { value: "12" } });
    await screen.findByText("Khata Twelve");
    fireEvent.change(box, { target: { value: "123" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "1234" } });
    await screen.findByText("Khata 1234");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("does nothing on Enter when nothing matches", async () => {
    searchReturns({});
    const { onPick, box } = renderSearch();
    fireEvent.change(box, { target: { value: "zz" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByText(/No customer matches/);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("CustomerSearch before typing", () => {
  it("lists the customers picked at this till most recently and keeps New customer one tap away", async () => {
    localStorage.setItem("easalpha.pos.recent_customers", JSON.stringify([{ id: "r1", name: "Regular Riaz", phone: "+923001112233", khata_no: null, room: null, member_no: null, balance_minor: 50000, orders_count: 12, last_order_at: "2026-10-10T08:00:00Z", status: "active" }]));
    const onPick = vi.fn(); const onAddNew = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CustomerSearch onPick={onPick} onAddNew={onAddNew} /></QueryClientProvider>);
    const recent = await screen.findByRole("listbox", { name: "Recent customers" });
    expect(recent).toHaveTextContent("Regular Riaz");
    expect(recent).toHaveTextContent("owes Rs 500");
    expect(recent).toHaveTextContent("last order 10 Oct 2026");
    expect(apiMock).not.toHaveBeenCalled(); // recents come from the till, not the server
    fireEvent.click(screen.getByRole("button", { name: "New customer" }));
    expect(onAddNew).toHaveBeenCalledWith("");
    fireEvent.click(screen.getByRole("option", { name: /Regular Riaz/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
    localStorage.removeItem("easalpha.pos.recent_customers");
  });

  it("remembers a search pick as recent and offers to add the typed name when nobody matches", async () => {
    localStorage.removeItem("easalpha.pos.recent_customers");
    searchReturns({ Hamza: [customer("c1", "Hamza Ali")], Nobody: [] });
    const onPick = vi.fn(); const onAddNew = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CustomerSearch onPick={onPick} onAddNew={onAddNew} /></QueryClientProvider>);
    const box = screen.getByLabelText("Search customers");
    fireEvent.change(box, { target: { value: "Hamza" } });
    fireEvent.click(await screen.findByRole("option", { name: /Hamza Ali/ }));
    expect(JSON.parse(localStorage.getItem("easalpha.pos.recent_customers")!)[0]).toMatchObject({ id: "c1", name: "Hamza Ali" });
    fireEvent.change(box, { target: { value: "Nobody" } });
    await screen.findByText(/No customer matches/);
    fireEvent.click(screen.getByRole("button", { name: "Add “Nobody” as a new customer" }));
    expect(onAddNew).toHaveBeenCalledWith("Nobody");
    localStorage.removeItem("easalpha.pos.recent_customers");
  });
});
