"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> { value: T; label: React.ReactNode; count?: number }

/** Material Design 3 segmented buttons: outlined pill group, selected segment in the secondary container with a check. */
export function Tabs<T extends string>({ value, onChange, items, className, size = "md" }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string; size?: "md" | "lg" }) {
  return (
    <div role="tablist" className={cn("flex w-fit max-w-full overflow-x-auto rounded-full border border-border-strong", className)}>
      {items.map((it) => {
        const selected = value === it.value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(it.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 whitespace-nowrap border-l border-border-strong px-4 font-medium tracking-[0.1px] transition-colors first:border-l-0",
              size === "lg" ? "h-12 text-base" : "h-10 text-sm",
              selected ? "bg-sidebar-active-bg text-sidebar-active" : "text-fg hover:bg-fg/8",
            )}
          >
            {selected ? <Check className="h-4 w-4" /> : null}
            {it.label}
            {it.count !== undefined ? <span className="rounded-full bg-fg/8 px-1.5 text-xs tabular">{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
