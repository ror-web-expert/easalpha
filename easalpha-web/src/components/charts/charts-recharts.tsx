"use client";
// The recharts half of the charts module. Only loaded in the browser, on demand, through next/dynamic from charts.tsx,
// so pages that import the charts module do not carry recharts in their first-load JavaScript.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";
import { ACCENT, ACCENT_HOVER, barColor, lineColor, type ChartBodyProps, type Series } from "./series";

function CustomTooltip({ active, payload, label, series }: { active?: boolean; payload?: { value: number; dataKey: string; color?: string; stroke?: string; fill?: string }[]; label?: string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-fg">{label}</div>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        const swatch = p.stroke && p.stroke !== "none" ? p.stroke : p.fill && p.fill !== "none" ? p.fill : p.color;
        return (
          <div key={p.dataKey} className="flex items-center gap-3 text-fg-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: swatch }} />
            <span>{s?.label ?? p.dataKey}</span>
            <span className="ml-auto font-semibold tabular" style={{ color: ACCENT }}>{s?.money ? formatMoney(p.value) : p.value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

const axisTick = { fontSize: 12, fill: "var(--text-muted)" };
const axisLine = { stroke: "var(--border)" };
const legendStyle = { fontSize: 12, color: "var(--text-secondary)" };
// Recharts colours each legend label with its series colour; the orange series made "Discounts" 2.61:1 on white.
// The swatch keeps the colour and the label uses the body text colour (review 2.4 audit).
const legendLabel = (value: string) => <span style={{ color: "var(--text-secondary)" }}>{value}</span>;
const moneyTick = (v: number) => (Math.abs(v) >= 100000 ? `${Math.round(v / 100000)}k` : String(Math.round(v / 100)));

/** True when every plotted value is a whole number, so the y-axis can skip 2.25-style ticks. */
function allIntegers(data: Record<string, unknown>[], series: Series[]) {
  return data.every((row) => series.every((s) => { const v = row[s.key]; return v == null || v === "" || Number.isInteger(Number(v)); }));
}

/** Line chart body: brand line with a soft accent gradient under it. The wrapper in charts.tsx owns the sized container and the empty state. */
export function TrendChartBody({ data, x, series, money }: ChartBodyProps) {
  const id = `trend-${series.map((s) => s.key).join("-").replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            // The first (brand) line sits on an orange wash; further lines wash in their own colour so each area is traceable.
            const stop = i === 0 ? ACCENT : lineColor(i, series.length);
            return (
              <linearGradient key={s.key} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stop} stopOpacity={0.25} />
                <stop offset="100%" stopColor={stop} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis dataKey={x} tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={money ? moneyTick : undefined} allowDecimals={!allIntegers(data, series)} />
        <Tooltip content={<CustomTooltip series={series} />} cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }} />
        {/* Review 4.7: with two series the legend sits above the plot, where it is read before the lines. */}
        {series.length > 1 ? <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={legendStyle} formatter={legendLabel} /> : null}
        {series.map((s, i) => {
          const color = lineColor(i, series.length);
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${id}-${i})`}
              fillOpacity={1}
              dot={{ r: 3, fill: color, stroke: "var(--bg-card)", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: ACCENT, stroke: "var(--bg-card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Bar chart body: accent bars (palette order when several series). The wrapper in charts.tsx owns the sized container and the empty state. */
export function BarsChartBody({ data, x, series, money }: ChartBodyProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis dataKey={x} tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={money ? moneyTick : undefined} allowDecimals={!allIntegers(data, series)} />
        <Tooltip content={<CustomTooltip series={series} />} cursor={{ fill: "var(--bg-muted)", fillOpacity: 0.6 }} />
        {series.length > 1 ? <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={legendStyle} formatter={legendLabel} /> : null}
        {series.map((s, i) => {
          const color = barColor(i, series.length);
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={color}
              activeBar={color === ACCENT ? { fill: ACCENT_HOVER } : { fill: color, fillOpacity: 0.8 }}
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
