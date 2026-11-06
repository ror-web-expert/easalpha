import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MoneyInput } from "./input";

// Review of 6 Nov 2026, R27: a barcode scanned into the payment screen's Amount or Tendered field typed itself in as
// money (an EAN-13 is Rs 40 billion tendered). The field takes a person's typing and drops a scanner's burst.
let seen = 0;
function Field({ start = 0 }: { start?: number }) {
  const [v, setV] = useState(start);
  seen = v;
  return <MoneyInput value={v} onChange={setV} aria-label="Tendered" />;
}

/** One key as the browser sends it: keydown, then the character into the field unless the keydown was swallowed. */
function press(el: HTMLInputElement, key: string): boolean {
  const ok = fireEvent.keyDown(el, { key });
  if (ok && [...key].length === 1) fireEvent.change(el, { target: { value: el.value + key } });
  return ok;
}
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
function typeAt(el: HTMLInputElement, text: string, gap: number) {
  for (const key of text) { press(el, key); wait(gap); }
}

describe("MoneyInput", () => {
  // Keys are timed with performance.now() (jsdom's event timeStamp is epoch time), so that clock is faked too.
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("keeps what a person types, Enter and all", () => {
    render(<Field />);
    const box = screen.getByLabelText("Tendered") as HTMLInputElement;
    typeAt(box, "5000", 120);
    expect(press(box, "Enter")).toBe(true);
    wait(200);
    expect(seen).toBe(500_000);
  });

  it("drops a scanner's burst ending in Enter: the amount stays and the Enter is swallowed", () => {
    render(<Field start={150_000} />);
    const box = screen.getByLabelText("Tendered") as HTMLInputElement;
    typeAt(box, "4006381333931", 8);
    expect(press(box, "Enter")).toBe(false);
    expect(seen).toBe(150_000);
    expect(box.value).toBe("1500");
  });

  it("drops a burst that ends in a pause (a scanner set to send nothing after the code)", () => {
    render(<Field start={150_000} />);
    const box = screen.getByLabelText("Tendered") as HTMLInputElement;
    typeAt(box, "96385074", 8);
    expect(seen).not.toBe(150_000); // the digits went in as they came
    wait(100);
    expect(seen).toBe(150_000);
    // Typing goes on as normal afterwards.
    typeAt(box, "0", 150);
    expect(seen).toBe(1_500_000);
  });
});
