"use client";
import { Zap } from "lucide-react";
import type { QuickAddItem } from "@/lib/types";
import { formatMoney } from "@/lib/money";

/** SPEC "Quick Add Menu": a pinned strip of fast movers; one tap adds the item to the running order. Hidden when the list is empty. */
export function QuickAddBar({ items, currency, showPrices = true, onPick }: { items: QuickAddItem[] | undefined; currency?: string; showPrices?: boolean; onPick: (item: QuickAddItem) => void }) {
  const list = (items ?? []).filter((i) => i.active).sort((a, b) => a.position - b.position);
  if (!list.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto border-b bg-card p-2" role="toolbar" aria-label="Quick add">
      {list.map((i) => (
        <button key={i.id} onClick={() => onPick(i)} className="flex h-12 shrink-0 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition hover:bg-muted active:scale-[0.98] active:bg-primary-soft">
          <Zap className="h-4 w-4 text-primary" />
          <span>{i.name}{i.variant_name ? <span className="text-fg-secondary"> {i.variant_name}</span> : null}</span>
          {showPrices ? <span className="text-primary tabular">{formatMoney(i.price_minor, currency)}</span> : null}
        </button>
      ))}
    </div>
  );
}
