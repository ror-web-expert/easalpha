import { cn } from "@/lib/utils";

/** Data table. The wrapper clips the rounded corners and scrolls sideways when columns do not fit.
 *  `compact` shortens every row from 48px to 40px. */
export function Table({ className, compact, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { compact?: boolean }) {
  return (
    <div className={cn("w-full overflow-x-auto overflow-y-hidden rounded-2xl border bg-card", compact && "[&_td]:h-10 [&_th]:h-10")}>
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-10 bg-table-head text-left text-[13px] font-semibold tracking-[0.03em] text-heading shadow-[inset_0_-1px_0_var(--border)]", className)} {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TR({ className, onClick, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-t transition-colors even:bg-table-zebra hover:bg-table-hover", onClick && "cursor-pointer", className)} onClick={onClick} {...props} />;
}
export function TH({ className, right, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return <th className={cn("h-12 whitespace-nowrap px-4 align-middle font-semibold first:pl-5 last:pr-5", right && "text-right", className)} {...props} />;
}
export function TD({ className, right, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return <td className={cn("h-12 px-4 align-middle first:pl-5 last:pr-5", right && "text-right tabular", className)} {...props} />;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-fg-muted">{children ?? "Nothing here yet"}</td>
    </tr>
  );
}
