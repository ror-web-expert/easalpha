import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Input, formatDay } from "./input";

function Controlled({ onPick }: { onPick: (v: string) => void }) {
  const [v, setV] = useState("2026-10-17");
  return <Input type="date" aria-label="From" value={v} onChange={(e) => { setV(e.target.value); onPick(e.target.value); }} className="w-auto" />;
}

describe("date fields (review 5.4)", () => {
  it("shows the day as 17 Oct 2026 whatever the browser locale, and keeps the ISO value on the real input", () => {
    const onPick = vi.fn();
    render(<Controlled onPick={onPick} />);
    expect(screen.getByText("17 Oct 2026")).toBeInTheDocument();
    const input = screen.getByLabelText("From") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-10-17");
    fireEvent.change(input, { target: { value: "2026-01-05" } });
    expect(onPick).toHaveBeenCalledWith("2026-01-05");
    expect(screen.getByText("5 Jan 2026")).toBeInTheDocument();
  });

  it("tracks an uncontrolled field and says when no date is picked", () => {
    render(<Input type="date" aria-label="Day" defaultValue="" />);
    expect(screen.getByText("Pick a date")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-12-31" } });
    expect(screen.getByText("31 Dec 2026")).toBeInTheDocument();
  });

  it("formats only well-formed days", () => {
    expect(formatDay("2026-02-01")).toBe("1 Feb 2026");
    expect(formatDay("nonsense")).toBe("nonsense");
  });
});
