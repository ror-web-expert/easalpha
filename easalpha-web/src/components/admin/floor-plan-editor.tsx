"use client";
import { useEffect, useRef, useState } from "react";
import { GRID_COLS, planRows, snapMove, snapResize, type Rect } from "./floor-plan";
import { Badge, tableStatusVariant } from "@/components/ui";
import { cn, titleCase } from "@/lib/utils";

export interface PlanTable { id: string; code: string; seats: number; status: string }
const ROW_PX = 40;

/** The floor plan as the owner arranges it (review 4.3): drag a table to move it, drag its corner to resize, both
 *  snapping to the 12-column grid; arrow keys move a focused table one cell, Shift with an arrow resizes it. */
export function FloorPlanEditor({ tables, positions, onChange }: { tables: PlanTable[]; positions: Record<string, Rect>; onChange: (id: string, r: Rect) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; start: Rect; px: number; py: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const cell = width / GRID_COLS || 1;
  const rects = tables.map((t) => positions[t.id]).filter(Boolean);
  const rows = planRows(rects);

  const begin = (e: React.PointerEvent, id: string, mode: "move" | "resize") => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id, mode, start: positions[id], px: e.clientX, py: e.clientY };
    setActive(id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / cell, dy = (e.clientY - d.py) / ROW_PX;
    const next = d.mode === "move" ? snapMove(d.start, dx, dy) : snapResize(d.start, dx, dy);
    const cur = positions[d.id];
    if (!cur || next.x !== cur.x || next.y !== cur.y || next.w !== cur.w || next.h !== cur.h) onChange(d.id, next);
  };
  const end = () => { drag.current = null; };
  const key = (e: React.KeyboardEvent, id: string) => {
    const r = positions[id];
    if (!r) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    onChange(id, e.shiftKey ? snapResize(r, s[0], s[1]) : snapMove(r, s[0], s[1]));
  };

  return (
    <div ref={ref} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      className="relative touch-none select-none overflow-hidden rounded-lg border bg-muted/40"
      style={{ height: rows * ROW_PX, backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)", backgroundSize: `${cell}px ${ROW_PX}px` }}
      aria-label="Floor plan. Drag a table to move it, drag its corner to resize. With a table focused, arrow keys move it and Shift with an arrow resizes it.">
      {tables.map((t) => {
        const r = positions[t.id];
        if (!r) return null;
        return (
          <div key={t.id} role="button" tabIndex={0} aria-label={`Table ${t.code}, ${t.seats} seats, column ${r.x + 1}, row ${r.y + 1}, ${r.w} by ${r.h}`}
            onPointerDown={(e) => begin(e, t.id, "move")} onKeyDown={(e) => key(e, t.id)} onFocus={() => setActive(t.id)}
            className={cn("absolute flex cursor-grab flex-col items-center justify-center rounded-md border bg-card p-1 text-center text-xs shadow-sm transition-shadow active:cursor-grabbing",
              active === t.id && "z-10 ring-2 ring-primary")}
            style={{ left: r.x * cell + 2, top: r.y * ROW_PX + 2, width: r.w * cell - 4, height: r.h * ROW_PX - 4 }}>
            <div className="font-semibold">{t.code}</div>
            {r.h > 1 ? <div className="text-fg-muted">{t.seats} seats</div> : null}
            {r.h > 1 && r.w > 1 ? <Badge variant={tableStatusVariant(t.status)} className="mt-0.5">{titleCase(t.status)}</Badge> : null}
            <span role="presentation" onPointerDown={(e) => begin(e, t.id, "resize")}
              className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-br-md border-b-2 border-r-2 border-primary/70" title="Drag to resize" />
          </div>
        );
      })}
    </div>
  );
}
