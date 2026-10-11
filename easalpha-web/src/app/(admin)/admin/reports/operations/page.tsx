"use client";
import { useState } from "react";
import { Activity } from "lucide-react";
import type { OperationsReport } from "@/lib/types";
import { daysAgo, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, ShareBar, useReport } from "@/components/admin/report-shell";
import { hourLabel, minutesLabel, pctOf } from "@/components/admin/report-helpers";
import { Card, CardBody, CardHeader, CardTitle, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { BarsChart } from "@/components/charts/charts";

export default function OperationsReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const q = useReport<OperationsReport>("operations", range);
  const d = q.data;
  const byType = Object.entries(d?.by_type ?? {}).sort((a, b) => b[1] - a[1]);
  const bySource = Object.entries(d?.by_source ?? {}).sort((a, b) => b[1] - a[1]);
  const hours = (d?.by_hour ?? []).map((h) => ({ hour: hourLabel(h.hour), orders: h.orders }));
  return (
    <ReportShell icon={Activity} title="Operations" description="Operational throughput: orders per day and per hour, items per order, time to ready, time to complete and delivery time, with cancellations and edits."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "operations",
        columns: [{ header: "Hour", key: "hour" }, { header: "Orders", key: "orders", align: "right" }, { header: "Share", key: "share", align: "right" }],
        rows: (d?.by_hour ?? []).map((h) => ({ hour: hourLabel(h.hour), orders: h.orders, share: `${pctOf(h.orders, d?.orders ?? 0)}%` })),
        footer: d ? [
          `${d.orders} orders  |  ${d.orders_per_day} per day  |  ${d.items_per_order} items per order  |  Peak ${hourLabel(d.peak_hour)}  |  Tables turned ${d.tables_turned}`,
          `Time to ready ${minutesLabel(d.avg_prep_minutes)}  |  Time to complete ${minutesLabel(d.avg_complete_minutes)}  |  Delivery ${minutesLabel(d.avg_delivery_minutes)}  |  Cancelled ${d.cancelled}  |  Modified ${d.modified}  |  Reopened ${d.reopened}`,
          `By type: ${byType.map(([k, v]) => `${titleCase(k)} ${v}`).join(", ") || "-"}  |  By source: ${bySource.map(([k, v]) => `${titleCase(k)} ${v}`).join(", ") || "-"}`,
        ] : undefined,
      }}>
      {d ? (
        <>
          <Cards>
            <SummaryCard label="Orders" value={d.orders} sub={`${d.orders_per_day} per day · ${d.items_per_order} items per order`} tone="primary" />
            <SummaryCard label="Time to ready" value={minutesLabel(d.avg_prep_minutes)} sub="Placed to ready, average" tone="info" />
            <SummaryCard label="Time to complete" value={minutesLabel(d.avg_complete_minutes)} sub="Placed to closed, average" tone="info" />
            <SummaryCard label="Delivery time" value={minutesLabel(d.avg_delivery_minutes)} sub="Assigned to delivered, average" tone="info" />
            <SummaryCard label="Peak hour" value={hourLabel(d.peak_hour)} sub={`${d.tables_turned} tables turned`} tone="success" />
            <SummaryCard label="Cancelled" value={d.cancelled} sub={`${pctOf(d.cancelled, d.orders + d.cancelled)}% of orders`} tone={d.cancelled ? "danger" : "neutral"} />
            <SummaryCard label="Modified" value={d.modified} sub="Edited after sending" tone={d.modified ? "warning" : "neutral"} />
            <SummaryCard label="Reopened" value={d.reopened} sub="Reopened after payment" tone={d.reopened ? "warning" : "neutral"} />
          </Cards>
          <Card className="mb-4"><CardHeader><CardTitle>Orders by hour</CardTitle></CardHeader><CardBody><BarsChart data={hours} x="hour" series={[{ key: "orders", label: "Orders" }]} /></CardBody></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>By order type</CardTitle></CardHeader>
              <Table><THead><tr><TH>Type</TH><TH right>Orders</TH><TH>Share</TH></tr></THead><TBody>{byType.length ? byType.map(([k, v]) => <TR key={k}><TD>{titleCase(k)}</TD><TD right>{v}</TD><TD><ShareBar percent={pctOf(v, d.orders)} /></TD></TR>) : <EmptyRow colSpan={3} />}</TBody></Table></Card>
            <Card><CardHeader><CardTitle>By source</CardTitle></CardHeader>
              <Table><THead><tr><TH>Source</TH><TH right>Orders</TH><TH>Share</TH></tr></THead><TBody>{bySource.length ? bySource.map(([k, v]) => <TR key={k}><TD>{titleCase(k)}</TD><TD right>{v}</TD><TD><ShareBar percent={pctOf(v, d.orders)} /></TD></TR>) : <EmptyRow colSpan={3} />}</TBody></Table></Card>
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
