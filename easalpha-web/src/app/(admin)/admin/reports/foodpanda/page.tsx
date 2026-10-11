"use client";
import { useState } from "react";
import { Bike } from "lucide-react";
import type { FoodpandaReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { pctOf } from "@/components/admin/report-helpers";
import { Card, CardBody, CardHeader, CardTitle, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { TrendChart } from "@/components/charts/charts";

export default function FoodpandaReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useReport<FoodpandaReport>("foodpanda", range);
  const d = q.data;
  const days = Object.entries(d?.by_day ?? {}).sort((a, b) => a[0].localeCompare(b[0])).map(([day, sales]) => ({ day, sales }));
  const commissionPct = d ? pctOf(d.commission_minor, d.sales_minor) : 0;
  return (
    <ReportShell icon={Bike} title="Foodpanda" description="A EasAlpha extra: orders received from Foodpanda in the period, what they sold for, the commission taken and what you keep."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "foodpanda",
        columns: [{ header: "Day", key: "day" }, { header: "Sales", key: "sales", align: "right" }],
        rows: days.map((r) => ({ day: formatDate(r.day), sales: formatMoney(r.sales) })),
        footer: d ? [`${d.orders} orders (${d.paid_orders} paid, ${d.voided} voided)  |  Sales ${formatMoney(d.sales_minor)}  |  Commission ${formatMoney(d.commission_minor)} (${commissionPct}%)  |  Net ${formatMoney(d.net_minor)}`] : undefined,
      }}>
      <Cards>
        <SummaryCard label="Orders" value={d?.orders ?? 0} sub={`${d?.paid_orders ?? 0} paid · ${d?.voided ?? 0} voided`} tone="info" />
        <SummaryCard label="Sales" value={formatMoney(d?.sales_minor)} sub="Paid orders at menu price" tone="success" />
        <SummaryCard label="Commission" value={formatMoney(d?.commission_minor)} sub={`${commissionPct}% of sales`} tone="warning" />
        <SummaryCard label="Net to you" value={formatMoney(d?.net_minor)} sub="Sales less commission" tone="primary" />
      </Cards>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Sales by day (Rs)</CardTitle></CardHeader><CardBody><TrendChart data={days.map((r) => ({ day: formatDate(r.day).slice(0, 6), sales: r.sales }))} x="day" series={[{ key: "sales", label: "Sales", money: true }]} money /></CardBody></Card>
        <Table><THead><tr><TH>Day</TH><TH right>Sales</TH></tr></THead><TBody>{days.length ? days.map((r) => <TR key={r.day}><TD>{formatDate(r.day)}</TD><TD right className="font-medium">{formatMoney(r.sales)}</TD></TR>) : <EmptyRow colSpan={2}>No Foodpanda orders in this period</EmptyRow>}</TBody></Table>
      </div>
    </ReportShell>
  );
}
