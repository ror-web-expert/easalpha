import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Cards, statGridClasses } from "./page";

// Review 1.1: at every breakpoint the number of cards divides into full rows, or the leftover row has at least two
// cards, or (odd counts on two columns) the first card spans the row.
const BREAKPOINTS = ["", "sm:", "md:", "lg:", "xl:", "2xl:"];
function colsAt(classes: string, bp: string): number {
  let cols = 1;
  for (const b of BREAKPOINTS) {
    const m = new RegExp(`(?:^|\\s)${b.replace(":", "\\:")}grid-cols-(\\d+)(?:\\s|$)`).exec(classes);
    if (m) cols = Number(m[1]);
    if (b === bp) break;
  }
  return cols;
}

describe("stat grid", () => {
  for (let n = 1; n <= 12; n++) {
    it(`${n} card${n === 1 ? "" : "s"} never leave one card alone on a row`, () => {
      const c = statGridClasses(n);
      for (const bp of BREAKPOINTS) {
        const cols = colsAt(c, bp);
        // The first card spans two columns from the base width until the breakpoint that resets it.
        const reset = /(?:^|\s)([a-z0-9]+):\[&>\*:first-child\]:col-span-1/.exec(c)?.[1];
        const order = BREAKPOINTS.map((b) => b.replace(":", ""));
        const spanning = c.includes("[&>*:first-child]:col-span-2") && (!reset || order.indexOf(bp.replace(":", "")) < order.indexOf(reset));
        const firstWide = cols === 2 && spanning;
        const cells = n + (firstWide ? 1 : 0);
        const last = cells % cols;
        expect(last === 0 || last >= 2 || n === 1, `${n} cards at "${bp || "base"}" (${cols} columns)`).toBe(true);
      }
    });
  }
  it("four cards are two per row on a phone and four from 1024 px, never three plus one", () => {
    expect(statGridClasses(4)).toBe("grid-cols-2 lg:grid-cols-4");
    const { container } = render(<Cards><div /><div /><div /><div /></Cards>);
    expect(container.firstElementChild?.className).toContain("lg:grid-cols-4");
    expect(container.firstElementChild?.className).not.toContain("grid-cols-3");
  });
});
