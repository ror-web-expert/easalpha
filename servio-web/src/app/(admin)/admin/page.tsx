"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, ReceiptText, Wallet, AlertTriangle, PiggyBank, FileCheck2, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Cards, PageHeader } from "@/components/admin/page";
import { Badge, Card, CardBody, CardHeader, CardTitle, ErrorState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, EmptyRow, orderStatusVariant } from "@/components/ui";
import { TrendChart, BarsChart, Breakdown } from "@/components/charts/charts";
import { useAuthStore } from "@/store/auth";

export default function DashboardPage() {
  const business = useAuthStore((s) => s.session?.business);
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/reports/dashboard"), refetchInterval: 60_000 });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState message={q.error instanceof Error ? q.error.message : "Could not load"} onRetry={() => q.refetch()} />;
  const d = q.data;
  const t = d.today;
  const trend = (d.trend_7_days ?? []).map((r) => ({ day: formatDate(r.business_day).slice(0, 6), revenue: r.revenue_minor, orders: r.orders }));
  const checklistDone = d.checklist?.filter((c) => c.done).length ?? 0;
  const pct = (v: number | null) => (v === null || v === undefined ? "No data last week" : `${v >= 0 ? "+" : ""}${formatPercent(v)} vs last week`);
  return (
    <>
      <PageHeader icon={LayoutDashboard} title={`Good day, ${business?.name ?? ""}`} description={`Business day ${formatDate(d.business_day)}${d.day_locked ? " · locked" : ""}`} />
      {d.checklist && checklistDone < d.checklist.length ? (
        <Link href="/admin/settings/checklist" className="mb-4 flex items-center justify-between rounded-lg border border-accent bg-accent-soft/50 px-4 py-3 text-sm">
          <span>Setup checklist: {checklistDone} of {d.checklist.length} done.</span>
          <span className="font-medium text-primary">Continue setup</span>
        </Link>
      ) : null}
      <Cards>
        <SummaryCard label="Revenue today" value={formatMoney(t?.revenue_minor)} sub={pct(d.change_vs_last_week_percent)} icon={Wallet} tone="success" />
        <SummaryCard label="Paid orders" value={t?.orders ?? 0} sub={`Avg ${formatMoney(t?.average_order_minor)}`} icon={ReceiptText} />
        <SummaryCard label="Open orders" value={d.open_orders ?? 0} sub={`${formatMoney(d.open_minor)} not yet paid`} icon={ReceiptText} tone="info" />
        <SummaryCard label="Shifts open" value={d.shifts_open ?? 0} sub={d.day_locked ? "Day locked" : "Day open"} icon={d.day_locked ? Lock : Wallet} tone="neutral" />
        <SummaryCard label="Khata outstanding" value={formatMoney(d.khata_outstanding_minor)} icon={PiggyBank} tone="warning" />
        <SummaryCard label="Needs attention" value={d.needs_attention ?? 0} sub="Rejected sync records" icon={AlertTriangle} tone={d.needs_attention ? "danger" : "neutral"} />
        <SummaryCard label="Tax queue" value={`${d.tax_queue?.queued ?? 0} queued`} sub={`${d.tax_queue?.failed ?? 0} failed`} icon={FileCheck2} tone={d.tax_queue?.failed ? "danger" : "neutral"} />
        <SummaryCard label="Month to date" value={formatMoney(d.month_to_date?.revenue_minor)} sub={`${d.month_to_date?.orders ?? 0} orders · last month ${formatMoney(d.same_period_last_month?.revenue_minor)}`} icon={Wallet} tone="neutral" />
      </Cards>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Revenue, last 7 days (Rs)</CardTitle></CardHeader>
          <CardBody><TrendChart data={trend} x="day" series={[{ key: "revenue", label: "Revenue", money: true }]} money /></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Paid orders, last 7 days (count)</CardTitle></CardHeader>
          <CardBody><BarsChart data={trend} x="day" series={[{ key: "orders", label: "Orders" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Today by payment method</CardTitle></CardHeader>
          <CardBody><Breakdown data={t?.by_payment_method} /></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Today by order type</CardTitle></CardHeader>
          <CardBody><Breakdown data={t?.by_order_type} /></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top items, 7 days</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Item</TH><TH right>Qty</TH><TH right>Revenue</TH></tr></THead>
            <TBody>
              {d.top_items?.length ? d.top_items.map((i) => (
                <TR key={`${i.product_id}-${i.deal_id}-${i.name}`}><TD>{i.name}</TD><TD right>{i.quantity}</TD><TD right>{formatMoney(i.revenue_minor)}</TD></TR>
              )) : <EmptyRow colSpan={3} />}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent orders</CardTitle><Link href="/admin/orders" className="text-xs text-primary">All orders</Link></CardHeader>
          <Table>
            <THead><tr><TH>Order</TH><TH>Status</TH><TH>When</TH><TH right>Total</TH></tr></THead>
            <TBody>
              {d.recent_orders?.length ? d.recent_orders.map((o) => (
                <TR key={o.id}>
                  <TD className="font-mono">{o.label}</TD>
                  <TD><Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge></TD>
                  <TD className="text-fg-secondary">{formatDateTime(o.created_at)}</TD>
                  <TD right>{formatMoney(o.total_minor)}</TD>
                </TR>
              )) : <EmptyRow colSpan={4} />}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
