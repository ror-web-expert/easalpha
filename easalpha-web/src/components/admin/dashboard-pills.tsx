"use client";
// SPEC top bar pills: "N low stock" (links to items at or below minimum) and "N open orders today · M from previous
// days" (links to Pending Orders). Read from GET /me every 60 seconds; the drawer and the orders pages invalidate "pills".
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock, PackageMinus } from "lucide-react";
import { api } from "@/lib/api";
import type { Session } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { openOrdersPill } from "./order-helpers";

const PILL = "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-4 tracking-[0.5px] transition-[filter] hover:brightness-95";

export function HeaderPills({ className }: { className?: string }) {
  const session = useAuthStore((s) => s.session);
  const q = useQuery({ queryKey: ["pills"], queryFn: () => api<Session>("/me", { auth: "admin" }), enabled: !!session, refetchInterval: 60_000, select: (s) => s.pills ?? null });
  const p = q.data;
  if (!p) return null;
  const danger = p.open_orders_previous > 0;
  return (
    <div className={cn("hidden items-center gap-2 sm:flex", className)}>
      {p.low_stock_items > 0 ? (
        <Link href="/admin/inventory/stock-in-hand" className={cn(PILL, "bg-warning-soft text-warning-ink")} title="Items at or below their minimum">
          <PackageMinus className="h-3.5 w-3.5" /> {p.low_stock_items} low stock
        </Link>
      ) : null}
      {p.open_orders_today > 0 || p.open_orders_previous > 0 ? (
        <Link href="/admin/orders/pending" className={cn(PILL, danger ? "bg-danger-soft text-danger-ink" : "bg-info-soft text-info-ink")} title="Open orders by business day">
          <Clock className="h-3.5 w-3.5" /> {openOrdersPill(p.open_orders_today, p.open_orders_previous)}
        </Link>
      ) : null}
    </div>
  );
}
