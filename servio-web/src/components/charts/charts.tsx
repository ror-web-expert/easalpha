"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

// Palette slots from docs/07-design-system.md section 2.6 (validated in both modes). Assigned in fixed order, never cycled.
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];

export interface Series { key: string; label: string; money?: boolean }

function CustomTooltip({ active, payload, label, series }: { active?: boolean; payload?: { value: number; dataKey: string; color?: string }[]; label?: string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-fg">{label}</div>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-2 text-fg-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span>{s?.label ?? p.dataKey}</span>
            <span className="ml-auto font-medium tabular text-fg">{s?.money ? formatMoney(p.value) : p.value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

const axisStyle = { fontSize: 11, fill: "var(--text-muted)" };
const moneyTick = (v: number) => (Math.abs(v) >= 100000 ? `${Math.round(v / 100000)}k` : String(Math.round(v / 100)));

/** Line chart with one y-axis. Pass money series together or counts together, never mixed. */
export function TrendChart({ data, x, series, money, height = 220, className }: { data: Record<string, unknown>[]; x: string; series: Series[]; money?: boolean; height?: number; className?: string }) {
  if (!data?.length) return <div className={cn("grid place-items-center text-sm text-fg-muted", className)} style={{ height }}>No data for this range</div>;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} tick={axisStyle} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={40} tickFormatter={money ? moneyTick : undefined} />
          <Tooltip content={<CustomTooltip series={series} />} cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }} />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} /> : null}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: SERIES[i] }} activeDot={{ r: 5, stroke: "var(--bg-card)", strokeWidth: 2 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, x, series, money, height = 220, className }: { data: Record<string, unknown>[]; x: string; series: Series[]; money?: boolean; height?: number; className?: string }) {
  if (!data?.length) return <div className={cn("grid place-items-center text-sm text-fg-muted", className)} style={{ height }}>No data for this range</div>;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} tick={axisStyle} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={40} tickFormatter={money ? moneyTick : undefined} />
          <Tooltip content={<CustomTooltip series={series} />} cursor={{ fill: "var(--bg-muted)" }} />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} /> : null}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
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
