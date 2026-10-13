import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useApproval } from "./approval";

const MANAGER = "4321";

/** An action the server refuses until a manager's PIN comes with it, like POST /orders/:id/void. */
const voidOrder = () => vi.fn(async (pin?: string) => {
  if (!pin) throw new ApiError("approval.required", "A manager must approve this", 403);
  if (pin !== MANAGER) throw new ApiError("approval.invalid", "Manager PIN is wrong", 403);
  return "voided";
});

function Screen({ action }: { action: (pin?: string) => Promise<string> }) {
  const { run, dialog, open } = useApproval();
  const [result, setResult] = useState("");
  return (
    <>
      <button onClick={() => { run(action, "Void order #12").then(setResult, (e: ApiError) => setResult(e.code)); }}>Void</button>
      <output aria-label="Result">{result}</output>
      <output aria-label="Asking">{open ? "yes" : "no"}</output>
      {dialog}
    </>
  );
}

const tap = (pin: string) => { for (const d of pin) fireEvent.click(screen.getByRole("button", { name: d })); };
/** Lets the action settle and any re-render (or re-send) happen. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));
const pins = (fn: ReturnType<typeof voidOrder>) => fn.mock.calls.map((c) => c[0]);

describe("useApproval", () => {
  it("sends a wrong PIN once and clears it for the next try (a resend loop locked every manager's PIN)", async () => {
    const fn = voidOrder();
    render(<Screen action={fn} />);
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await screen.findByText("Approve: Void order #12");
    expect(screen.getByLabelText("Asking")).toHaveTextContent("yes");
    tap("1234");
    await screen.findByText("Wrong PIN or not allowed. Try again.");
    await settle();
    await settle();
    expect(pins(fn)).toEqual([undefined, "1234"]);
    // The dots were cleared: the next four digits are a new PIN on their own.
    tap(MANAGER);
    await waitFor(() => expect(screen.getByLabelText("Result")).toHaveTextContent("voided"));
    expect(pins(fn)).toEqual([undefined, "1234", MANAGER]);
    expect(screen.getByLabelText("Asking")).toHaveTextContent("no");
  });

  it("never reuses the last PIN for the next approval", async () => {
    const fn = voidOrder();
    render(<Screen action={fn} />);
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await screen.findByText("Approve: Void order #12");
    tap(MANAGER);
    await waitFor(() => expect(screen.getByLabelText("Result")).toHaveTextContent("voided"));
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await screen.findByText("Approve: Void order #12");
    await settle();
    expect(pins(fn)).toEqual([undefined, MANAGER, undefined]);
    expect(screen.getByText("Approve: Void order #12")).toBeInTheDocument();
  });

  it("a barcode scanned into the PIN dialog costs one try, not a loop", async () => {
    const fn = voidOrder();
    render(<Screen action={fn} />);
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await screen.findByText("Approve: Void order #12");
    for (const key of [..."8964000123456", "Enter"]) fireEvent.keyDown(window, { key });
    await screen.findByText("Wrong PIN or not allowed. Try again.");
    await settle();
    await settle();
    expect(pins(fn)).toEqual([undefined, "8964"]);
  });
});
