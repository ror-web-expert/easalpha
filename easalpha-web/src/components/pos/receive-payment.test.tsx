import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentMethod } from "@/lib/types";

const h = vi.hoisted(() => ({ state: {} as Record<string, unknown>, receive: vi.fn() }));
vi.mock("@/store/catalog", () => ({ useCatalogStore: (sel: (s: Record<string, unknown>) => unknown) => sel(h.state) }));
vi.mock("@/lib/customer-payments", () => ({ receiveCustomerPayment: (...a: unknown[]) => h.receive(...a), accountPaymentReceipt: () => ({}) }));
vi.mock("@/lib/print", () => ({ printJob: async () => ({ ok: true }), paymentReceiptLines: () => [] }));
vi.mock("@/components/approval", () => ({ useApproval: () => ({ run: (fn: () => Promise<unknown>) => fn(), dialog: null }) }));

import { ReceivePaymentDialog } from "./receive-payment";
import { useSyncStore } from "@/store/sync";
import { ApiError } from "@/lib/api";

const method = (code: string, kind: string, name: string, works_offline: boolean): PaymentMethod =>
  ({ id: `m-${code}`, code, name, kind, payment_account_id: null, active: true, works_offline, needs_reference: false, sort_order: 0 }) as PaymentMethod;
const methods = () => [method("cash", "cash", "Cash", true), method("bank", "bank", "Bank transfer", false)];
const sadia = { id: "c-1", name: "Sadia Akhtar", khata_no: "32", balance_minor: 500000 } as never;
const dialog = () => <ReceivePaymentDialog open onClose={() => {}} customer={sadia} />;

beforeEach(() => {
  h.receive.mockReset();
  h.state = { paymentMethods: methods(), catalog: { business: { currency: "PKR", settings: {} } } };
  useSyncStore.setState({ status: "online" });
});

describe("Receive payment while the method list refreshes (web-till#8)", () => {
  // Every background refresh (a new array) or the till going offline reset the form: Rs 0, no reference, back to cash.
  it("keeps the method, the amount and the reference through a refresh of the list", () => {
    const { rerender } = render(dialog());
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "bank" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "IBFT-7781" } });
    h.state = { ...h.state, paymentMethods: methods() };
    rerender(dialog());
    expect(screen.getByLabelText("Method")).toHaveValue("bank");
    expect(screen.getByLabelText("Amount")).toHaveValue(5000);
    expect(screen.getByLabelText("Reference")).toHaveValue("IBFT-7781");
  });

  it("falls back to cash, keeping the amount, when the chosen method needs the internet and the till goes offline", () => {
    render(dialog());
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "bank" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5000" } });
    act(() => useSyncStore.setState({ status: "offline" }));
    expect(screen.getByLabelText("Method")).toHaveValue("cash");
    expect(screen.getByLabelText("Amount")).toHaveValue(5000);
  });

  it("sends the same payment id on a retry after a refresh", async () => {
    h.receive.mockRejectedValue(new ApiError("server", "Something went wrong", 500));
    const { rerender } = render(dialog());
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5000" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Receive Rs 5,000/ })); });
    h.state = { ...h.state, paymentMethods: methods() };
    rerender(dialog());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Receive Rs 5,000/ })); });
    const ids = h.receive.mock.calls.map((c) => c[3]);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });
});
