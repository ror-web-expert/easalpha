"use client";
import { useState } from "react";
import { ClipboardSignature } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { ORDER_TAKER_COLUMNS, OrderTakersTable, type OrderTakerRow, orderTakerExportRows } from "@/components/admin/report-sections";
import { Card, CardBody, CardHeader, CardTitle, SummaryCard } from "@/components/ui";
import { Breakdown } from "@/components/charts/charts";

export default function OrderTakersPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const q = useReport<{ data: OrderTakerRow[] }>("order_takers", range);
  const rows = q.data?.data ?? [];
  const orders = rows.reduce((a, r) => a + r.orders, 0);
  const revenue = rows.reduce((a, r) => a + r.revenue_minor, 0);
  return (
    <ReportShell icon={ClipboardSignature} title="Order Takers" description="Orders punched per order taker: how many orders each member of staff rang up and what they were worth."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{ name: "order-takers", columns: ORDER_TAKER_COLUMNS, rows: orderTakerExportRows(rows), footer: [`${rows.length} order takers  |  ${orders} orders  |  ${formatMoney(revenue)}`] }}>
      <Cards className="lg:grid-cols-3 xl:grid-cols-3">
        <SummaryCard label="Order takers" value={rows.length} tone="info" />
        <SummaryCard label="Orders punched" value={orders} sub={`Average ${formatMoney(orders ? Math.round(revenue / orders) : 0)}`} tone="primary" />
        <SummaryCard label="Value" value={formatMoney(revenue)} tone="success" />
      </Cards>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card><CardHeader><CardTitle>Orders by staff</CardTitle></CardHeader><CardBody><Breakdown money={false} data={rows.map((r) => ({ label: r.name ?? "Unknown", value: r.orders }))} /></CardBody></Card>
        <OrderTakersTable rows={rows} />
      </div>
    </ReportShell>
  );
}
