"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb, Download, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { CustomerInsights } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, DateRangePicker, FilterBar, PageHeader } from "@/components/admin/page";
import { balanceLabel, balanceVariant, customerSourceLabel, customerStatusLabel, customerStatusVariant } from "@/components/admin/marketing-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

// SPEC Customer Insights: who spends, how often and who owes, over a date range, with the customer base broken
// down by lifecycle status and by source (In-store or Online).

type Sort = "spent" | "orders" | "balance" | "recent" | "name";
const columns = [
  { header: "Customer", key: "name" }, { header: "Khata No.", key: "khata" }, { header: "Phone", key: "phone" }, { header: "Source", key: "source" }, { header: "Orders", key: "orders", align: "right" as const },
  { header: "Spent", key: "spent", align: "right" as const }, { header: "Average", key: "average", align: "right" as const }, { header: "Paid on account", key: "paid", align: "right" as const },
  { header: "Balance", key: "balance", align: "right" as const }, { header: "Points", key: "points", align: "right" as const }, { header: "Last order", key: "last" },
];

export default function CustomerInsightsPage() {
  const [range, setRange] = useState({ from: daysAgo(89), to: isoDay() });
  const [sort, setSort] = useState<Sort>("spent");
  const q = useQuery({ queryKey: ["customer_insights", range, sort], queryFn: () => api<CustomerInsights>("/customers/insights", { query: { from: range.from, to: range.to, sort } }) });
  const t = q.data?.totals;
  const rows = (q.data?.rows ?? []).map((r) => ({
    name: r.customer.name, khata: r.customer.khata_no ?? "", phone: r.customer.phone ?? "", source: customerSourceLabel(r.customer.source), orders: r.orders, spent: formatMoney(r.spent_minor), average: formatMoney(r.average_minor),
    paid: formatMoney(r.paid_on_account_minor), balance: `${formatMoney(r.balance_minor)} (${balanceLabel(r.balance_minor)})`, points: r.loyalty_points, last: r.last_order_on ? formatDate(r.last_order_on) : "",
  }));
  const subtitle = `${formatDate(range.from)} to ${formatDate(range.to)}`;
  return (
    <>
      <PageHeader icon={Lightbulb} title="Customer Insights" description="Spend, order count and balance per customer for the period, with the customer base by status and source." actions={<>
        <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`customer-insights-${range.from}-${range.to}`, columns, rows)}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="secondary" disabled={!rows.length} onClick={() => exportTablePdf({ title: "Customer insights", subtitle, columns, rows, landscape: true, footer: t ? [`${t.customers} customers · spent ${formatMoney(t.spent_minor)} · ${t.orders} orders · balance ${formatMoney(t.balance_minor)} across ${t.with_balance} customers`] : undefined })}><FileText className="h-4 w-4" /> PDF</Button>
      </>} />
      <Cards>
        <SummaryCard label="Customers" value={t?.customers ?? 0} sub={`${t?.with_balance ?? 0} with a balance`} />
        <SummaryCard label="Spent in period" value={formatMoney(t?.spent_minor)} sub={`${t?.orders ?? 0} orders`} tone="success" />
        <SummaryCard label="Average per order" value={formatMoney(t && t.orders ? Math.round(t.spent_minor / t.orders) : 0)} tone="neutral" />
        <SummaryCard label="To receive" value={formatMoney(t?.balance_minor)} tone="warning" />
      </Cards>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>By status</CardTitle></CardHeader><CardBody className="flex flex-wrap gap-2">
          {t ? Object.entries(t.by_status).map(([k, n]) => <Badge key={k} variant={customerStatusVariant(k)}>{customerStatusLabel(k)}: {n}</Badge>) : <span className="text-sm text-fg-muted">Loading</span>}
          {t && !Object.keys(t.by_status).length ? <span className="text-sm text-fg-muted">No customers yet</span> : null}
        </CardBody></Card>
        <Card><CardHeader><CardTitle>By source</CardTitle></CardHeader><CardBody className="flex flex-wrap gap-2">
          {t ? Object.entries(t.by_source).map(([k, n]) => <Badge key={k} variant={k === "online" ? "info" : "neutral"}>{customerSourceLabel(k)}: {n}</Badge>) : <span className="text-sm text-fg-muted">Loading</span>}
          {t && !Object.keys(t.by_source).length ? <span className="text-sm text-fg-muted">No customers yet</span> : null}
        </CardBody></Card>
      </div>
      <FilterBar>
        <Tabs value={sort} onChange={setSort} items={[{ value: "spent", label: "Top spenders" }, { value: "orders", label: "Most orders" }, { value: "balance", label: "Highest balance" }, { value: "recent", label: "Most recent" }, { value: "name", label: "By name" }]} />
        <DateRangePicker value={range} onChange={setRange} />
      </FilterBar>
      {q.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Customer</TH><TH>Source</TH><TH right>Orders</TH><TH right>Spent</TH><TH right>Average</TH><TH right>Paid on account</TH><TH right>Balance</TH><TH right>Points</TH><TH>Last order</TH></tr></THead>
          <TBody>
            {q.data?.rows.length ? q.data.rows.map((r) => (
              <TR key={r.customer.id}>
                <TD><Link href={`/admin/customers/${r.customer.id}`} className="font-medium text-primary hover:underline">{r.customer.name}</Link>{r.customer.khata_no ? <span className="ml-2 font-mono text-xs text-fg-muted">{r.customer.khata_no}</span> : null}<span className="block text-xs text-fg-secondary">{r.customer.phone ?? ""}</span></TD>
                <TD className="text-fg-secondary">{customerSourceLabel(r.customer.source)}</TD>
                <TD right>{r.orders}</TD>
                <TD right className="font-medium">{formatMoney(r.spent_minor)}</TD>
                <TD right>{formatMoney(r.average_minor)}</TD>
                <TD right>{formatMoney(r.paid_on_account_minor)}</TD>
                <TD right>{r.balance_minor ? formatMoney(Math.abs(r.balance_minor)) : ""} <Badge variant={balanceVariant(r.balance_minor)}>{balanceLabel(r.balance_minor)}</Badge></TD>
                <TD right>{r.loyalty_points}</TD>
                <TD className="text-fg-secondary">{r.last_order_on ? formatDate(r.last_order_on) : "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No named customers in this period.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
