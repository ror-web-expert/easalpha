// Floor plan maths for Admin, Tables: tables sit on a 12-column grid of 40 px rows. Pure, so the snapping, the bounds
// and the free-spot search are unit-tested; the editor (floor-plan-editor.tsx) only turns pointer moves into cells.

export interface Rect { x: number; y: number; w: number; h: number }
export const GRID_COLS = 12;
export const DEFAULT_SIZE = { w: 2, h: 2 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A dragged table: the start rect moved by a pointer delta in cells, rounded to the grid and kept on the plan. */
export function snapMove(start: Rect, dxCells: number, dyCells: number, cols = GRID_COLS): Rect {
  return { ...start, x: clamp(Math.round(start.x + dxCells), 0, cols - start.w), y: Math.max(0, Math.round(start.y + dyCells)) };
}

/** A table resized from its corner handle: at least one cell, never past the right edge. */
export function snapResize(start: Rect, dxCells: number, dyCells: number, cols = GRID_COLS): Rect {
  return { ...start, w: clamp(Math.round(start.w + dxCells), 1, cols - start.x), h: clamp(Math.round(start.h + dyCells), 1, 12) };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The first spot (top to bottom, left to right) where a table of this size fits without touching another. */
export function firstFreeSpot(taken: Rect[], size = DEFAULT_SIZE, cols = GRID_COLS): Rect {
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x + size.w <= cols; x++) {
      const r = { x, y, ...size };
      if (!taken.some((t) => overlaps(r, t))) return r;
    }
  }
  return { x: 0, y: 0, ...size };
}

/** Auto arrange: every table in a tidy grid, in the order given, keeping its size and leaving one cell between. */
export function autoArrange(sizes: { w: number; h: number }[], cols = GRID_COLS): Rect[] {
  const out: Rect[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const s of sizes) {
    const w = clamp(s.w || DEFAULT_SIZE.w, 1, cols), h = Math.max(1, s.h || DEFAULT_SIZE.h);
    if (x + w > cols) { x = 0; y += rowH + 1; rowH = 0; }
    out.push({ x, y, w, h });
    x += w + 1; rowH = Math.max(rowH, h);
  }
  return out;
}

/** Rows the plan needs: the lowest table plus two spare rows to drag into, at least eight. */
export function planRows(rects: Rect[]): number {
  return Math.max(8, ...rects.map((r) => r.y + r.h + 2));
}
