"use client";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> { value: T; label: React.ReactNode; count?: number }

/** Segmented control: a pill group where the selected segment is filled navy with white text. Counts sit in small pills. */
export function Tabs<T extends string>({ value, onChange, items, className, size = "md" }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string; size?: "md" | "lg" }) {
  return (
    <div role="tablist" className={cn("inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full border bg-card p-0.5", className)}>
      {items.map((it) => {
        const selected = value === it.value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(it.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors",
              size === "lg" ? "h-11 px-5 text-base" : "h-8 px-4 text-sm",
              selected ? "bg-primary text-primary-fg shadow-[var(--elev-1)]" : "text-fg-secondary hover:bg-fg/6 hover:text-fg",
            )}
          >
            {it.label}
            {it.count !== undefined ? (
              <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular", selected ? "bg-white/20 text-primary-fg" : "bg-muted text-fg-secondary")}>{it.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
