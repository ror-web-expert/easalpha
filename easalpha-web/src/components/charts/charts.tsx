"use client";
import dynamic from "next/dynamic";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { allZero, breakdownColor, endAtLastData, type Series } from "./series";
import { BarChart3 } from "lucide-react";

export { SERIES, type Series } from "./series";

// recharts is about 120 kB of first-load JavaScript, so the chart bodies load in the browser only when a chart with
// data is on screen. The wrappers below keep the same exported names and props, render the empty state without
// recharts, and reserve the final height while the library loads so nothing shifts when it arrives.
const TrendChartBody = dynamic(() => import("./charts-recharts").then((m) => m.TrendChartBody), { ssr: false, loading: () => null });
const BarsChartBody = dynamic(() => import("./charts-recharts").then((m) => m.BarsChartBody), { ssr: false, loading: () => null });

/** A chart with nothing to draw: an icon and the reason, at the chart's own height so the card does not jump. */
function ChartEmpty({ className, height, text }: { className?: string; height: number; text?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 text-center text-sm text-fg-secondary", className)} style={{ height }}>
      <BarChart3 className="h-6 w-6 text-fg-muted" aria-hidden />
      {text ?? "No sales recorded in this range yet. Pick a longer range above."}
    </div>
  );
}

type ChartProps = { data: Record<string, unknown>[]; x: string; series: Series[]; money?: boolean; height?: number; className?: string; empty?: string };

/** Line chart with one y-axis. Pass money series together or counts together, never mixed. */
export function TrendChart({ data, x, series, money, height = 220, className, empty }: ChartProps) {
  const keys = series.map((s) => s.key);
  if (!data?.length || allZero(data, keys)) return <ChartEmpty className={className} height={height} text={empty} />;
  return (
    <div className={className} style={{ height }}>
      <TrendChartBody data={endAtLastData(data, keys)} x={x} series={series} money={money} />
    </div>
  );
}

export function BarsChart({ data, x, series, money, height = 220, className, empty }: ChartProps) {
  if (!data?.length) return <ChartEmpty className={className} height={height} text={empty} />;
  return (
    <div className={className} style={{ height }}>
      <BarsChartBody data={data} x={x} series={series} money={money} />
    </div>
  );
}

/**
 * Horizontal breakdown with direct labels (for by_payment_method, by_order_type...). Each row takes the next palette colour
 * (navy, orange, teal, amber, ...). With colorBy="status" rows are toned by state instead: completed/paid/ready green,
 * pending/preparing/open orange, dispatched teal, cancelled/voided/refunded red, complimentary/unpaid amber.
 */
export function Breakdown({ data, money = true, className, labelFor, colorBy = "palette" }: { data: Record<string, number> | { label: string; value: number }[] | undefined; money?: boolean; className?: string; labelFor?: (k: string) => string; colorBy?: "palette" | "status" }) {
  const rows = Array.isArray(data) ? data : Object.entries(data ?? {}).map(([k, v]) => ({ label: labelFor ? labelFor(k) : k, value: Number(v) }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <div className={cn("flex flex-col items-center gap-1.5 py-6 text-center text-sm text-fg-secondary", className)}><BarChart3 className="h-5 w-5 text-fg-muted" aria-hidden />No sales in this range yet</div>;
  return (
    <ul className={cn("space-y-2", className)}>
      {rows.sort((a, b) => b.value - a.value).map((r, i) => {
        const color = breakdownColor(r.label, i, colorBy);
        return (
          <li key={r.label} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 capitalize text-fg-secondary">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                {r.label.replace(/_/g, " ")}
              </span>
              <span className="font-medium tabular">{money ? formatMoney(r.value) : r.value.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, background: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
