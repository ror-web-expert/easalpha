"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { SalesCalendar } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Cards } from "@/components/admin/page";
import { ReportShell } from "@/components/admin/report-shell";
import { WEEKDAYS, buildCalendarGrid, currentMonth, monthLabel, shiftMonth } from "@/components/admin/report-helpers";
import { Button, Card, Input, SummaryCard } from "@/components/ui";

export default function SalesCalendarPage() {
  const [month, setMonth] = useState(currentMonth());
  const q = useQuery({ queryKey: ["report", "sales_calendar", month], queryFn: () => api<SalesCalendar>("/reports/sales_calendar", { query: { month } }) });
  const d = q.data;
  const days = d?.days ?? [];
  const grid = buildCalendarGrid(days);
  const best = d?.totals.best_day ?? null;
  const max = Math.max(1, ...days.map((x) => x.revenue_minor));
  return (
    <ReportShell icon={CalendarRange} title="Sales Calendar" description="Day-by-day sales in a calendar grid: revenue and orders per day for the month, with the best day highlighted."
      loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      filters={<div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="h-5 w-5" /></Button>
        <Input type="month" className="w-auto" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} aria-label="Month" />
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="h-5 w-5" /></Button>
        <span className="text-sm text-fg-secondary">{monthLabel(month)}</span>
      </div>}
      exportData={{
        name: `sales-calendar-${month}`, subtitle: monthLabel(month),
        columns: [{ header: "Date", key: "date" }, { header: "Weekday", key: "weekday" }, { header: "Orders", key: "orders", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }, { header: "Best day", key: "best" }],
        rows: days.map((x) => ({ date: formatDate(x.date), weekday: WEEKDAYS[(x.wday + 6) % 7], orders: x.orders, revenue: formatMoney(x.revenue_minor), best: x.date === best ? "Yes" : "" })),
        footer: d ? [`${d.totals.orders} orders  |  Revenue ${formatMoney(d.totals.revenue_minor)}  |  Average trading day ${formatMoney(d.totals.average_day_minor)}  |  Best day ${best ? formatDate(best) : "-"}`] : undefined,
      }}>
      {d ? (
        <>
          <Cards>
            <SummaryCard label="Revenue" value={formatMoney(d.totals.revenue_minor)} sub={monthLabel(month)} tone="success" />
            <SummaryCard label="Orders" value={d.totals.orders} sub={`${days.filter((x) => x.orders).length} trading days`} tone="info" />
            <SummaryCard label="Average trading day" value={formatMoney(d.totals.average_day_minor)} sub="Days with at least one order" tone="primary" />
            <SummaryCard label="Best day" value={best ? formatDate(best) : "-"} sub={best ? formatMoney(days.find((x) => x.date === best)?.revenue_minor) : "No sales this month"} tone="warning" />
          </Cards>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium tracking-[0.4px] text-fg-secondary">{WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
            {grid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map((day, di) => day ? (
                  <div key={day.date} className={cn("min-h-24 border-r p-2 last:border-r-0", day.date === best && "bg-warning-soft", !day.orders && "text-fg-muted")}>
                    <div className="flex items-center justify-between text-xs"><span className={cn("font-medium", day.date === best && "text-warning-ink")}>{Number(day.date.slice(-2))}</span>{day.date === best ? <span className="rounded-full bg-warning px-1.5 text-[10px] font-medium text-warning-fg">Best</span> : null}</div>
                    <div className="mt-2 truncate text-sm font-medium tabular">{day.orders ? formatMoney(day.revenue_minor) : "-"}</div>
                    <div className="text-xs text-fg-secondary">{day.orders ? `${day.orders} order${day.orders === 1 ? "" : "s"}` : "No sales"}</div>
                    <div className="mt-2 h-1 rounded-full bg-muted"><div className="h-1 rounded-full bg-primary" style={{ width: day.revenue_minor ? `${Math.max(3, (day.revenue_minor * 100) / max)}%` : "0%" }} /></div>
                  </div>
                ) : <div key={`blank-${wi}-${di}`} className="min-h-24 border-r bg-muted/20 last:border-r-0" />)}
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </ReportShell>
  );
}
