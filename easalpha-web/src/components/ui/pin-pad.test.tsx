import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PinDialog } from "./pin-pad";

const typeKeys = (keys: string) => { for (const key of keys) fireEvent.keyDown(window, { key }); };

describe("PinDialog", () => {
  it("sends on the 4th digit once: not again while it is checked, nor when the check ends", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<PinDialog open onClose={onClose} onSubmit={onSubmit} loading={false} />);
    typeKeys("1234");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenLastCalledWith("1234");
    rerender(<PinDialog open onClose={onClose} onSubmit={onSubmit} loading />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Refused: the check ends with the dialog still open.
    rerender(<PinDialog open onClose={onClose} onSubmit={onSubmit} loading={false} error="Wrong PIN or not allowed. Try again." />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    typeKeys("5678");
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith("5678");
  });

  it("clears a refused PIN when only an error comes back", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<PinDialog open onClose={onClose} onSubmit={onSubmit} />);
    typeKeys("1234");
    rerender(<PinDialog open onClose={onClose} onSubmit={onSubmit} error="Wrong PIN" />);
    rerender(<PinDialog open onClose={onClose} onSubmit={onSubmit} error="Wrong PIN" />);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    for (const d of "9876") fireEvent.click(screen.getByRole("button", { name: d }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith("9876");
  });

  it("starts empty each time it opens, so the last PIN is never sent again", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<PinDialog open onClose={onClose} onSubmit={onSubmit} />);
    typeKeys("1234");
    rerender(<PinDialog open={false} onClose={onClose} onSubmit={onSubmit} />);
    rerender(<PinDialog open onClose={onClose} onSubmit={onSubmit} />);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
