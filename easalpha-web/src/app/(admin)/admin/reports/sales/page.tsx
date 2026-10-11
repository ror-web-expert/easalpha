"use client";
import { useState } from "react";
import { LineChart } from "lucide-react";
import type { ByDayRow, SalesDetailPage, SalesDetailRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, daysAgo, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, LoadMore, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyRow, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, orderTypeVariant, paymentStatusVariant } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts/charts";

const ORDER_TYPES = ["dine_in", "takeaway", "delivery"];
const SOURCES = ["till", "qr", "online", "app", "phone", "foodpanda", "kiosk"];

export default function SalesReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const [orderType, setOrderType] = useState("");
  const [source, setSource] = useState("");
  const list = usePagedList<SalesDetailRow>(["report", "sales"], "/reports/sales", { from: range.from, to: range.to, order_type: orderType || undefined, source: source || undefined });
  const byDay = useReport<{ data: ByDayRow[] }>("by_day", range);
  const totals = (list.data?.pages[0] as SalesDetailPage | undefined)?.totals;
  const rows = list.rows;
  const days = (byDay.data?.data ?? []).map((r) => ({ day: formatDate(r.business_day).slice(0, 6), revenue: r.revenue_minor, orders: r.orders, discount: r.discount_minor }));
  return (
    <ReportShell icon={LineChart} title="Sales" description="Sales detail over the period: one row per paid order with who took it, who completed it, and how it was paid."
      range={range} onRange={setRange} loading={list.isLoading} error={list.isError} onRetry={() => list.refetch()}
      filters={<>
        <Select className="w-auto" value={orderType} onChange={(e) => setOrderType(e.target.value)} aria-label="Order type"><option value="">All order types</option>{ORDER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
        <Select className="w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source"><option value="">All sources</option>{SOURCES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
      </>}
      exportData={{
        name: "sales", landscape: true,
        columns: [{ header: "Order", key: "label" }, { header: "Day", key: "day" }, { header: "Placed", key: "placed" }, { header: "Type", key: "type" }, { header: "Source", key: "source" }, { header: "Status", key: "status" }, { header: "Payment", key: "payment" }, { header: "Customer", key: "customer" }, { header: "Taken by", key: "taken_by" }, { header: "Completed by", key: "completed_by" }, { header: "Items", key: "items", align: "right" }, { header: "Subtotal", key: "subtotal", align: "right" }, { header: "Discount", key: "discount", align: "right" }, { header: "Tax", key: "tax", align: "right" }, { header: "Charges", key: "charges", align: "right" }, { header: "Total", key: "total", align: "right" }, { header: "Paid by", key: "paid_by" }],
        rows: rows.map((r) => ({ label: r.label, day: formatDate(r.business_day), placed: formatDateTime(r.placed_at), type: titleCase(r.order_type), source: titleCase(r.source), status: titleCase(r.status), payment: titleCase(r.payment_status), customer: r.customer ?? "", taken_by: r.taken_by ?? "", completed_by: r.completed_by ?? "", items: r.items, subtotal: formatMoney(r.subtotal_minor), discount: formatMoney(r.discount_minor), tax: formatMoney(r.tax_minor), charges: formatMoney(r.service_charge_minor + r.delivery_charge_minor), total: formatMoney(r.total_minor), paid_by: r.payment_method_summary ?? "" })),
        footer: totals ? [`${totals.orders} orders  |  Revenue ${formatMoney(totals.revenue_minor)}  |  Discounts ${formatMoney(totals.discount_minor)}  |  Tax ${formatMoney(totals.tax_minor)}${rows.length < totals.orders ? `  |  Showing the first ${rows.length} rows` : ""}`] : undefined,
      }}>
      <Cards>
        <SummaryCard label="Orders" value={totals?.orders ?? 0} sub="Paid, closed or refunded" tone="info" />
        <SummaryCard label="Revenue" value={formatMoney(totals?.revenue_minor)} sub={`Average ${formatMoney(totals?.orders ? Math.round(totals.revenue_minor / totals.orders) : 0)}`} tone="success" />
        <SummaryCard label="Discounts" value={formatMoney(totals?.discount_minor)} tone="warning" />
        <SummaryCard label="Tax" value={formatMoney(totals?.tax_minor)} tone="neutral" />
      </Cards>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Revenue by day (Rs)</CardTitle></CardHeader><CardBody><TrendChart data={days} x="day" series={[{ key: "revenue", label: "Revenue", money: true }, { key: "discount", label: "Discounts", money: true }]} money /></CardBody></Card>
        <Card><CardHeader><CardTitle>Orders by day (count)</CardTitle></CardHeader><CardBody><BarsChart data={days} x="day" series={[{ key: "orders", label: "Orders" }]} /></CardBody></Card>
      </div>
      <Table>
        <THead><tr><TH>Order</TH><TH>Placed</TH><TH>Type</TH><TH>Source</TH><TH>Payment</TH><TH>Customer</TH><TH>Taken by</TH><TH>Completed by</TH><TH right>Items</TH><TH right>Discount</TH><TH right>Total</TH><TH>Paid by</TH></tr></THead>
        <TBody>
          {rows.length ? rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono">{r.label}</TD>
              <TD className="text-fg-secondary">{formatDateTime(r.placed_at)}</TD>
              <TD><Badge variant={orderTypeVariant(r.order_type)}>{titleCase(r.order_type)}</Badge></TD>
              <TD className="text-fg-secondary">{titleCase(r.source)}</TD>
              <TD><Badge variant={paymentStatusVariant(r.payment_status)}>{titleCase(r.payment_status)}</Badge></TD>
              <TD>{r.customer ?? "-"}</TD>
              <TD className="text-fg-secondary">{r.taken_by ?? "-"}</TD>
              <TD className="text-fg-secondary">{r.completed_by ?? "-"}</TD>
              <TD right>{r.items}</TD>
              <TD right className="text-fg-secondary">{r.discount_minor ? formatMoney(r.discount_minor) : "-"}</TD>
              <TD right className="font-medium">{formatMoney(r.total_minor)}</TD>
              <TD className="text-xs text-fg-secondary">{r.payment_method_summary ?? "-"}</TD>
            </TR>
          )) : <EmptyRow colSpan={12}>No paid orders match this period and filters</EmptyRow>}
        </TBody>
      </Table>
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </ReportShell>
  );
}
