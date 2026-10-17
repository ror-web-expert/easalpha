import { describe, expect, it } from "vitest";
import { autoArrange, firstFreeSpot, overlaps, planRows, snapMove, snapResize } from "./floor-plan";

describe("floor plan (review 4.3)", () => {
  it("moves snap to whole cells and stay on the plan", () => {
    expect(snapMove({ x: 2, y: 1, w: 2, h: 2 }, 1.4, 0.6)).toEqual({ x: 3, y: 2, w: 2, h: 2 });
    expect(snapMove({ x: 9, y: 0, w: 2, h: 2 }, 5, -3)).toEqual({ x: 10, y: 0, w: 2, h: 2 });
    expect(snapMove({ x: 1, y: 1, w: 2, h: 2 }, -4, 0)).toMatchObject({ x: 0 });
  });
  it("resizes keep at least one cell and never pass the right edge", () => {
    expect(snapResize({ x: 10, y: 0, w: 2, h: 2 }, 3, 1)).toEqual({ x: 10, y: 0, w: 2, h: 3 });
    expect(snapResize({ x: 0, y: 0, w: 2, h: 2 }, -5, -5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("finds the first free spot beside what is placed", () => {
    expect(firstFreeSpot([])).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(firstFreeSpot([{ x: 0, y: 0, w: 2, h: 2 }])).toEqual({ x: 2, y: 0, w: 2, h: 2 });
    const row = Array.from({ length: 6 }, (_, i) => ({ x: i * 2, y: 0, w: 2, h: 2 }));
    expect(firstFreeSpot(row)).toEqual({ x: 0, y: 2, w: 2, h: 2 });
  });
  it("auto arranges without overlaps, wrapping at twelve columns", () => {
    const r = autoArrange(Array.from({ length: 6 }, () => ({ w: 2, h: 2 })));
    expect(r.slice(0, 5).map((x) => x.y)).toEqual([0, 0, 0, 0, 3]);
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlaps(r[i], r[j])).toBe(false);
    expect(planRows(r)).toBe(8);
  });
});
