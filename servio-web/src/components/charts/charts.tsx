"use client";
import dynamic from "next/dynamic";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Series } from "./series";

export { SERIES, type Series } from "./series";

// recharts is about 120 kB of first-load JavaScript, so the chart bodies load in the browser only when a chart with
// data is on screen. The wrappers below keep the same exported names and props, render the empty state without
// recharts, and reserve the final height while the library loads so nothing shifts when it arrives.
const TrendChartBody = dynamic(() => import("./charts-recharts").then((m) => m.TrendChartBody), { ssr: false, loading: () => null });
const BarsChartBody = dynamic(() => import("./charts-recharts").then((m) => m.BarsChartBody), { ssr: false, loading: () => null });

type ChartProps = { data: Record<string, unknown>[]; x: string; series: Series[]; money?: boolean; height?: number; className?: string };

/** Line chart with one y-axis. Pass money series together or counts together, never mixed. */
export function TrendChart({ data, x, series, money, height = 220, className }: ChartProps) {
  if (!data?.length) return <div className={cn("grid place-items-center text-sm text-fg-muted", className)} style={{ height }}>No data for this range</div>;
  return (
    <div className={className} style={{ height }}>
      <TrendChartBody data={data} x={x} series={series} money={money} />
    </div>
  );
}

export function BarsChart({ data, x, series, money, height = 220, className }: ChartProps) {
  if (!data?.length) return <div className={cn("grid place-items-center text-sm text-fg-muted", className)} style={{ height }}>No data for this range</div>;
  return (
    <div className={className} style={{ height }}>
      <BarsChartBody data={data} x={x} series={series} money={money} />
    </div>
  );
}

/** Horizontal breakdown with direct labels (for by_payment_method, by_order_type...). One hue; identity carried by the label. */
export function Breakdown({ data, money = true, className, labelFor }: { data: Record<string, number> | { label: string; value: number }[] | undefined; money?: boolean; className?: string; labelFor?: (k: string) => string }) {
  const rows = Array.isArray(data) ? data : Object.entries(data ?? {}).map(([k, v]) => ({ label: labelFor ? labelFor(k) : k, value: Number(v) }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <div className={cn("py-6 text-center text-sm text-fg-muted", className)}>Nothing yet</div>;
  return (
    <ul className={cn("space-y-2", className)}>
      {rows.sort((a, b) => b.value - a.value).map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between">
            <span className="capitalize text-fg-secondary">{r.label.replace(/_/g, " ")}</span>
            <span className="font-medium tabular">{money ? formatMoney(r.value) : r.value.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
