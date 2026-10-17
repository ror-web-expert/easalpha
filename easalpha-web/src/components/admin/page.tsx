"use client";
import { Children } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { daysAgo, isoDay } from "@/lib/dates";

/** Page title band: a white card with an orange icon tile, a bold navy title, optional meta pills beside it,
 *  a muted one-line description and the page actions on the right. Same props as before; `meta` is new and optional. */
export function PageHeader({ icon: Icon, title, description, actions, meta, className }: { icon?: LucideIcon; title: string; description?: string; actions?: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card px-6 py-5", className)}>
      <div className="flex min-w-0 items-center gap-4">
        {Icon ? (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cta-soft text-cta-ink" aria-hidden="true">
            <Icon className="h-[22px] w-[22px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-2xl font-bold leading-8 tracking-[-0.01em] text-heading">{title}</h1>
            {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          </div>
          {description ? <p className="mt-1 text-sm leading-5 text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-center gap-3", className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
      <Input className="pl-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search"} />
    </div>
  );
}

/** Columns for a row of n stat cards, chosen so no card is ever alone on a row at any width (review 1.1: the old
 *  2 / 3 / 4 steps left four cards as 3 + 1 on every laptop between 1024 and 1279 px). An odd count on a two-column
 *  phone row lets the first card span both columns. */
export function statGridClasses(n: number): string {
  const firstWide = "[&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1";
  switch (true) {
    case n <= 1: return "grid-cols-1";
    case n === 2: return "grid-cols-1 sm:grid-cols-2";
    case n === 3: return "grid-cols-1 sm:grid-cols-3";
    case n === 4: return "grid-cols-2 lg:grid-cols-4";
    case n === 5: return `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 ${firstWide}`;
    case n === 6: return "grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6";
    case n === 7: return `grid-cols-2 sm:grid-cols-4 ${firstWide}`;
    case n === 8: return "grid-cols-2 sm:grid-cols-4";
    case n === 9: return `grid-cols-2 sm:grid-cols-3 ${firstWide}`;
    case n === 10: return "grid-cols-2 lg:grid-cols-5";
    default: return n % 2 ? "grid-cols-2 lg:grid-cols-4 [&>*:first-child]:col-span-2 lg:[&>*:first-child]:col-span-1" : "grid-cols-2 lg:grid-cols-4";
  }
}

/** Stat card grid (the review's StatGrid): 16px gaps and a column count from the number of cards, so a row never
 *  ends with one card on its own. Every KPI row in the admin uses this one component. */
export function Cards({ children, className }: { children: React.ReactNode; className?: string }) {
  const n = Children.toArray(children).length;
  return <div className={cn("mb-6 grid gap-4", statGridClasses(n), className)}>{children}</div>;
}

export const StatGrid = Cards;

export interface DateRange { from: string; to: string }

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Today", range: () => ({ from: isoDay(), to: isoDay() }) },
  { label: "Yesterday", range: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
  { label: "Last 7 days", range: () => ({ from: daysAgo(6), to: isoDay() }) },
  { label: "Last 30 days", range: () => ({ from: daysAgo(29), to: isoDay() }) },
  { label: "This month", range: () => { const d = new Date(); return { from: isoDay(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoDay() }; } },
];

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="w-auto" value="" onChange={(e) => { const p = PRESETS.find((x) => x.label === e.target.value); if (p) onChange(p.range()); }} aria-label="Date preset">
        <option value="">Preset…</option>
        {PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
      </Select>
      <Input type="date" className="w-auto" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From" />
      <span className="text-xs text-fg-muted">to</span>
      <Input type="date" className="w-auto" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To" />
    </div>
  );
}

export function LoadMore({ cursor, onLoad, loading }: { cursor: string | null | undefined; onLoad: () => void; loading?: boolean }) {
  if (!cursor) return null;
  return (
    <div className="mt-3 flex justify-center">
      <button className="h-10 rounded-full border border-border-strong px-6 text-sm font-medium text-primary hover:bg-primary/8" onClick={onLoad} disabled={loading}>{loading ? "Loading…" : "Load more"}</button>
    </div>
  );
}
