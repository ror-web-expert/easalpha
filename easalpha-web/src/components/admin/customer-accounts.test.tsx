import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { AdjustBalanceDialog, KhataLimitField, OpeningBalanceDialog } from "./customer-accounts";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

const customer = { id: "c1", name: "Ali Raza", balance_minor: 150_000 };
const postedBody = () => vi.mocked(api).mock.calls[0][1]?.body as Record<string, unknown>;

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// The branch day ends at 02:01 (the default), so 00:30 on 13 Oct still belongs to 12 Oct, as on the API.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  useAuthStore.setState({ session: { branch: { id: "b1", day_end_time: "02:01" } } as unknown as Session });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ adjustment: {}, customer: {} });
});
afterEach(() => {
  cleanup(); // unmount before the session goes, so nothing re-renders outside act
  vi.useRealTimers();
  useAuthStore.setState({ session: null });
});

describe("balance dates around midnight", () => {
  it("at 00:30 an adjustment defaults to the business day still running and leaves the date to the API", async () => {
    vi.setSystemTime(new Date(2026, 9, 13, 0, 30));
    const user = userEvent.setup();
    withClient(<AdjustBalanceDialog customer={customer} open onClose={() => {}} />);
    const date = screen.getByDisplayValue("2026-10-12");
    expect(date).toHaveAttribute("max", "2026-10-12");
    await user.type(screen.getByRole("spinbutton"), "100");
    await user.type(screen.getByPlaceholderText("Charged twice, mess fee, discount agreed"), "Mess fee");
    await user.click(screen.getByRole("button", { name: "Save adjustment" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({ kind: "adjustment", amount_minor: 10_000, reason: "Mess fee" });
    expect(postedBody().effective_on).toBeUndefined();
  });

  it("at 00:30 refuses the calendar date as the future, and sends a past day as picked", async () => {
    vi.setSystemTime(new Date(2026, 9, 13, 0, 30));
    const user = userEvent.setup();
    withClient(<AdjustBalanceDialog customer={customer} open onClose={() => {}} />);
    await user.type(screen.getByRole("spinbutton"), "100");
    await user.type(screen.getByPlaceholderText("Charged twice, mess fee, discount agreed"), "Mess fee");
    const date = screen.getByDisplayValue("2026-10-12");
    fireEvent.change(date, { target: { value: "2026-10-13" } });
    expect(screen.getByText("The date cannot be in the future")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save adjustment" })).toBeDisabled();
    fireEvent.change(date, { target: { value: "2026-10-10" } });
    expect(screen.queryByText("The date cannot be in the future")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save adjustment" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(postedBody().effective_on).toBe("2026-10-10");
  });

  it("after the day end time the calendar date is today", () => {
    vi.setSystemTime(new Date(2026, 9, 13, 2, 30));
    withClient(<AdjustBalanceDialog customer={customer} open onClose={() => {}} />);
    expect(screen.getByDisplayValue("2026-10-13")).toHaveAttribute("max", "2026-10-13");
  });

  it("at 00:30 an opening balance defaults to the business day and leaves the date to the API", async () => {
    vi.setSystemTime(new Date(2026, 9, 13, 0, 30));
    const user = userEvent.setup();
    withClient(<OpeningBalanceDialog customer={customer} open onClose={() => {}} />);
    expect(screen.getByDisplayValue("2026-10-12")).toHaveAttribute("max", "2026-10-12");
    await user.type(screen.getByRole("spinbutton"), "2500");
    await user.click(screen.getByRole("button", { name: "Save opening balance" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({ kind: "opening", amount_minor: 250_000 });
    expect(postedBody().effective_on).toBeUndefined();
  });
});

function LimitHarness({ initial, seen }: { initial: number | null; seen: (number | null)[] }) {
  const [value, setValue] = useState<number | null>(initial);
  return <KhataLimitField value={value} onChange={(v) => { seen.push(v); setValue(v); }} />;
}

describe("KhataLimitField", () => {
  it("can be emptied and typed over without snapping back to Rs 1, and stays on 'up to a limit'", async () => {
    const seen: (number | null)[] = [];
    const user = userEvent.setup();
    render(<LimitHarness initial={500_000} seen={seen} />);
    const input = screen.getByLabelText("Credit limit");
    expect(input).toHaveValue(5000);
    await user.clear(input);
    expect(input).toHaveValue(null);
    expect(screen.getByRole("combobox")).toHaveValue("limit");
    expect(screen.getByText("Enter a limit of at least Rs 1")).toBeInTheDocument();
    expect(seen.at(-1)).toBe(1); // under Rs 1, so the form's Save waits
    await user.type(input, "8000");
    expect(input).toHaveValue(8000);
    expect(seen.at(-1)).toBe(800_000);
    expect(screen.queryByText("Enter a limit of at least Rs 1")).toBeNull();
    await user.tab();
    expect(input).toHaveValue(8000);
    expect(seen.at(-1)).toBe(800_000);
  });

  it("raises a limit under Rs 1 to Rs 1 when the field is left", async () => {
    const seen: (number | null)[] = [];
    const user = userEvent.setup();
    render(<LimitHarness initial={500_000} seen={seen} />);
    const input = screen.getByLabelText("Credit limit");
    await user.clear(input);
    await user.tab();
    expect(seen.at(-1)).toBe(100);
    expect(input).toHaveValue(1);
    expect(screen.queryByText("Enter a limit of at least Rs 1")).toBeNull();
  });

  it("switches between no limit, a limit and not allowed", async () => {
    const seen: (number | null)[] = [];
    const user = userEvent.setup();
    render(<LimitHarness initial={null} seen={seen} />);
    expect(screen.queryByLabelText("Credit limit")).toBeNull();
    await user.selectOptions(screen.getByRole("combobox"), "limit");
    expect(seen.at(-1)).toBe(500_000);
    expect(screen.getByLabelText("Credit limit")).toHaveValue(5000);
    await user.selectOptions(screen.getByRole("combobox"), "off");
    expect(seen.at(-1)).toBe(0);
    expect(screen.queryByLabelText("Credit limit")).toBeNull();
  });
});
