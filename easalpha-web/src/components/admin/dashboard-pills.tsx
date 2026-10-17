"use client";
// SPEC top bar pills: "N low stock" (links to items at or below minimum) and "N open orders today · M from previous
// days" (links to Pending Orders). Read from GET /me every 60 seconds; the drawer and the orders pages invalidate "pills".
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, PackageMinus } from "lucide-react";
import { fetchMe } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { openOrdersPill } from "./order-helpers";

// min-w-0 and a truncating label let a long pill ("3 open orders today · 67 from previous days") shrink instead of
// pushing the header past the screen; the full text stays in the title.
const PILL = "inline-flex h-6 min-w-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-4 tracking-[0.5px] transition-[filter] hover:brightness-95";

export function HeaderPills({ className }: { className?: string }) {
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const q = useQuery({ queryKey: ["pills"], queryFn: () => fetchMe(qc, session?.business.id), enabled: !!session, refetchInterval: 60_000, select: (s) => s.pills ?? null });
  const p = q.data;
  if (!p) return null;
  const danger = p.open_orders_previous > 0;
  return (
    <div className={cn("hidden min-w-0 shrink items-center gap-2 sm:flex", className)}>
      {p.low_stock_items > 0 ? (
        <Link href="/admin/inventory/stock-in-hand" className={cn(PILL, "bg-warning-soft text-warning-ink")} title="Items at or below their minimum">
          <PackageMinus className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{p.low_stock_items} low stock</span>
        </Link>
      ) : null}
      {p.open_orders_today > 0 || p.open_orders_previous > 0 ? (
        <Link href="/admin/orders/pending" className={cn(PILL, danger ? "bg-danger-soft text-danger-ink" : "bg-info-soft text-info-ink")} title={`Open orders by business day: ${openOrdersPill(p.open_orders_today, p.open_orders_previous)}`}>
          <Clock className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{openOrdersPill(p.open_orders_today, p.open_orders_previous)}</span>
        </Link>
      ) : null}
    </div>
  );
}
