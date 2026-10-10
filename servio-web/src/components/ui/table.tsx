import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border bg-card">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 bg-card text-left text-sm text-fg-secondary", className)} {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TR({ className, onClick, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-t transition-colors hover:bg-fg/[0.04]", onClick && "cursor-pointer", className)} onClick={onClick} {...props} />;
}
export function TH({ className, right, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return <th className={cn("h-12 px-4 font-medium tracking-[0.1px]", right && "text-right", className)} {...props} />;
}
export function TD({ className, right, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return <td className={cn("h-12 px-4 align-middle", right && "text-right tabular", className)} {...props} />;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 text-center text-sm text-fg-muted">{children ?? "Nothing here yet"}</td>
    </tr>
  );
}
