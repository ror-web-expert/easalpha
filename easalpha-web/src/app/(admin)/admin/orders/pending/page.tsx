"use client";
// SPEC Pending Orders: orders left open across business days, with Calendar and List views and tiles for today,
// yesterday, the last 30 days and all time. A day in the calendar filters the list; a row opens the order drawer.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { PendingOrders, Rider } from "@/lib/types";
import { formatDate, isoDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useList } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Loading, SummaryCard, Tabs } from "@/components/ui";
import { OrderDrawer } from "@/components/admin/order-drawer";
import { OrderTable } from "@/components/admin/order-table";
import { monthGrid } from "@/components/admin/order-helpers";

type View = "calendar" | "list";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PendingOrdersPage() {
  const [view, setView] = useState<View>("calendar");
  const [day, setDay] = useState<string>("");
  const [month, setMonth] = useState<string>(isoDay().slice(0, 7) + "-01");
  const [selected, setSelected] = useState<string | null>(null);
  // Tiles and the calendar come with the first page; the list reloads when a day is picked.
  const head = useQuery({ queryKey: ["orders_pending", "head"], queryFn: () => api<PendingOrders>("/orders/pending", { query: { limit: 1 } }), refetchInterval: 60_000 });
  const list = usePagedList<PendingOrders["data"][number]>(["orders_pending", "list"], "/orders/pending", { business_day: day });
  const riders = useList<Rider>("riders", "/riders");
  const t = head.data?.tiles;
  const weeks = monthGrid(month, head.data?.calendar ?? []);
  const today = isoDay();
  const pick = (d: string) => { setDay(day === d ? "" : d); setView("list"); };
  return (
    <>
      <PageHeader icon={Clock} title="Pending Orders" description="Orders still open, across business days. Complete or cancel them from the order panel." />
      <Cards>
        <SummaryCard label="Open today" value={t?.today ?? 0} tone={t?.today ? "warning" : "neutral"} />
        <SummaryCard label="Open yesterday" value={t?.yesterday ?? 0} tone={t?.yesterday ? "danger" : "neutral"} />
        <SummaryCard label="Last 30 days" value={t?.last_30_days ?? 0} tone="info" />
        <SummaryCard label="All time" value={t?.all_time ?? 0} sub={t?.oldest_day ? `Oldest open order: ${formatDate(t.oldest_day)}` : "No open orders"} tone={t?.previous_days ? "danger" : "neutral"} />
      </Cards>
      <FilterBar>
        <Tabs value={view} onChange={setView} items={[{ value: "calendar", label: "Calendar" }, { value: "list", label: "List", count: day ? head.data?.calendar.find((c) => c.day === day)?.count : t?.all_time }]} />
        {day ? <Badge variant="primary" className="cursor-pointer" onClick={() => setDay("")} title="Clear the day filter">{formatDate(day)} × </Badge> : null}
        {t?.previous_days ? <span className="text-sm text-fg-secondary">{t.previous_days} from previous days</span> : null}
      </FilterBar>
      {head.isLoading ? <Loading /> : head.error ? <ErrorState message={errorMessage(head.error)} onRetry={() => head.refetch()} /> : null}
      {view === "calendar" && head.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{format(parseISO(month), "MMMM yyyy")}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setMonth(isoDay(addMonths(parseISO(month), -1)).slice(0, 7) + "-01")} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7) + "-01")}>Today</Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setMonth(isoDay(addMonths(parseISO(month), 1)).slice(0, 7) + "-01")} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-fg-secondary">{WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flat().map((c) => (
                <button key={c.day} onClick={() => pick(c.day)} disabled={!c.count} aria-label={`${formatDate(c.day)}: ${c.count} open`}
                  className={cn("flex min-h-[88px] flex-col items-start justify-between rounded-xl border p-2.5 text-left text-sm transition-colors", c.inMonth ? "bg-card" : "bg-muted/40 text-fg-muted",
                    c.count ? "hover:bg-fg/[0.04]" : "cursor-default", c.day === day && "border-primary bg-primary-soft", c.day === today && "font-semibold")}>
                  <span className="tabular">{c.day.slice(-2)}</span>
                  {c.count ? <Badge variant={c.day === today ? "warning" : "danger"}>{c.count} open</Badge> : null}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-fg-secondary">Click a day to see its open orders in the list.</p>
          </CardBody>
        </Card>
      ) : null}
      {view === "list" ? (
        <>
          {list.isLoading ? <Loading /> : list.error ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
            <OrderTable rows={list.rows} onSelect={setSelected} riders={riders.data} empty={day ? `No open orders on ${formatDate(day)}` : "No open orders. Everything is completed or cancelled."} />
          )}
          <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
        </>
      ) : null}
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
