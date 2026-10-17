"use client";
import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Data table (the review's DataTable). Columns that do not fit scroll sideways inside the card, never the page; the
 *  first column stays put while the rest scroll (`stickyFirst`, on by default), and a soft shade on the left or right
 *  edge shows there is more to see that way (review 1.3: columns looked clipped with no hint to scroll).
 *  `compact` shortens every row from 48px to 40px. */
export function Table({ className, compact, stickyFirst = true, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { compact?: boolean; stickyFirst?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdge((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", update); ro?.disconnect(); };
  }, []);
  return (
    <div className="relative w-full rounded-2xl border bg-card">
      <div ref={ref} data-table-scroll="" className={cn("w-full overflow-x-auto overflow-y-hidden rounded-2xl", compact && "[&_td]:h-10 [&_th]:h-10",
        stickyFirst && "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-[1] [&_td:first-child]:bg-inherit [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-[2] [&_th:first-child]:bg-table-head",
        stickyFirst && edge.left && "[&_td:first-child]:shadow-[1px_0_0_var(--border)] [&_th:first-child]:shadow-[1px_0_0_var(--border)]")}>
        <table className={cn("w-full text-sm", className)} {...props} />
      </div>
      {edge.left ? <div aria-hidden className="pointer-events-none absolute inset-y-px left-px w-6 rounded-l-2xl bg-linear-to-r from-black/10 to-transparent" /> : null}
      {edge.right ? <div aria-hidden data-more-right="" className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-2xl bg-linear-to-l from-black/15 to-transparent" /> : null}
    </div>
  );
}

export const DataTable = Table;
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-10 bg-table-head text-left text-[13px] font-semibold tracking-[0.03em] text-heading shadow-[inset_0_-1px_0_var(--border)]", className)} {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TR({ className, onClick, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  // An opaque row colour so the sticky first cell (bg-inherit) covers what scrolls under it.
  return <tr className={cn("border-t bg-card transition-colors even:bg-table-zebra hover:bg-table-hover", onClick && "cursor-pointer", className)} onClick={onClick} {...props} />;
}
export function TH({ className, right, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return <th className={cn("h-12 whitespace-nowrap px-4 align-middle font-semibold first:pl-5 last:pr-5", right && "text-right", className)} {...props} />;
}
export function TD({ className, right, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  // Numbers (right-aligned) never break across lines; the table scrolls sideways instead.
  return <td className={cn("h-12 px-4 align-middle first:pl-5 last:pr-5", right && "whitespace-nowrap text-right tabular", className)} {...props} />;
}

/** The empty state inside a table (review 5.2): an icon, one line saying why there is nothing, and an optional action. */
export function EmptyRow({ colSpan, children, icon: Icon = Inbox, action }: { colSpan: number; children?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; action?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft"><Icon className="h-5 w-5 text-primary-ink" /></span>
          <div className="text-sm text-fg-secondary">{children ?? "Nothing here yet"}</div>
          {action ? <div className="mt-1">{action}</div> : null}
        </div>
      </td>
    </tr>
  );
}
