"use client";
// The recharts half of the charts module. Only loaded in the browser, on demand, through next/dynamic from charts.tsx,
// so pages that import the charts module do not carry recharts in their first-load JavaScript.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatMoney } from "@/lib/money";
import { SERIES, type ChartBodyProps, type Series } from "./series";

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

/** Line chart body. The wrapper in charts.tsx owns the sized container and the empty state. */
export function TrendChartBody({ data, x, series, money }: ChartBodyProps) {
  return (
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
  );
}

/** Bar chart body. The wrapper in charts.tsx owns the sized container and the empty state. */
export function BarsChartBody({ data, x, series, money }: ChartBodyProps) {
  return (
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
  );
}
