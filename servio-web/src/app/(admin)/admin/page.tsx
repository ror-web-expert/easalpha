"use client";
// SPEC dashboard: a period selector and Refresh above the grid; six KPI cards scoped to the period; Sales Trend and
// Orders by hour, Products by Category, Order Status Distribution and Expenses (with an explicit empty state); Top
// Selling Products. Servio's extras (tax queue, needs attention, khata, checklist, recent orders) sit in a lower section.
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ReceiptText, Wallet, AlertTriangle, PiggyBank, FileCheck2, Lock, Package, Users, Banknote, RefreshCw } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Dashboard, DashboardPeriod, DashboardSpec } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, EmptyRow, Tabs } from "@/components/ui";
import { TrendChart, BarsChart, Breakdown } from "@/components/charts/charts";
import { useAuthStore } from "@/store/auth";
import { DASHBOARD_PERIODS, hourLabel, specStatusVariant } from "@/components/admin/order-helpers";

export default function DashboardPage() {
  const qc = useQueryClient();
  const business = useAuthStore((s) => s.session?.business);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [custom, setCustom] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const query = period === "custom" ? { period, from: custom.from, to: custom.to } : { period };
  const spec = useQuery({ queryKey: ["dashboard", "spec", query], queryFn: () => api<DashboardSpec>("/reports/dashboard/spec", { query }), refetchInterval: 60_000 });
  const extras = useQuery({ queryKey: ["dashboard", "extras"], queryFn: () => api<Dashboard>("/reports/dashboard"), refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const d = spec.data;
  const x = extras.data;
  const cards = d?.cards;
  const trend = (d?.charts.sales_by_hour ?? []).map((r) => ({ hour: hourLabel(r.hour), revenue: r.revenue_minor, orders: r.orders }));
  const hasSales = trend.some((r) => r.revenue > 0 || r.orders > 0);
  const checklistDone = x?.checklist?.filter((c) => c.done).length ?? 0;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "No data last week" : `${v >= 0 ? "+" : ""}${formatPercent(v)} vs last week`);
  const rangeLabel = d ? (d.from === d.to ? formatDate(d.from) : `${formatDate(d.from)} to ${formatDate(d.to)}`) : "";
  return (
    <>
      <PageHeader icon={LayoutDashboard} title={`Good day, ${business?.name ?? ""}`} description={`${rangeLabel}${x?.day_locked ? " · day locked" : ""}`}
        actions={<Button variant="secondary" onClick={refresh} loading={spec.isFetching}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
      <FilterBar>
        <Tabs value={period} onChange={setPeriod} items={DASHBOARD_PERIODS} />
        {period === "custom" ? <DateRangePicker value={custom} onChange={setCustom} /> : null}
      </FilterBar>
      {x?.checklist && checklistDone < x.checklist.length ? (
        <Link href="/admin/settings/checklist" className="mb-4 flex items-center justify-between rounded-lg border border-accent bg-accent-soft/50 px-4 py-3 text-sm">
          <span>Setup checklist: {checklistDone} of {x.checklist.length} done.</span>
          <span className="font-medium text-primary">Continue setup</span>
        </Link>
      ) : null}
      {spec.isLoading ? <Loading /> : spec.error ? <ErrorState message={errorMessage(spec.error)} onRetry={() => spec.refetch()} /> : null}
      {cards ? (
        <>
          <Cards className="md:grid-cols-3 2xl:grid-cols-6">
            <SummaryCard label="Total Products" value={cards.total_products} sub="Active catalog products" icon={Package} tone="neutral" />
            <SummaryCard label="Total Revenue" value={formatMoney(cards.total_revenue_minor)} sub="Completed orders only" icon={Wallet} tone="success" />
            <SummaryCard label="Incl. Open Orders" value={formatMoney(cards.incl_open_minor)} sub={`+ ${formatMoney(cards.open_minor)} still open`} icon={ReceiptText} tone="info" />
            <SummaryCard label="Total Orders" value={cards.total_orders} sub={`${cards.cancelled_orders} cancelled`} icon={ReceiptText} tone={cards.cancelled_orders ? "warning" : "primary"} />
            <SummaryCard label="Total Customers" value={cards.total_customers} sub="Registered customers" icon={Users} tone="primary" />
            <SummaryCard label="Expenses" value={formatMoney(cards.expenses_minor)} sub="For the period" icon={Banknote} tone={cards.expenses_minor ? "danger" : "neutral"} />
          </Cards>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Sales Trend (Rs)</CardTitle><span className="text-xs text-fg-muted">Completed revenue by hour</span></CardHeader>
              <CardBody><TrendChart data={hasSales ? trend : []} x="hour" series={[{ key: "revenue", label: "Revenue", money: true }]} money /></CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Orders (count)</CardTitle><span className="text-xs text-fg-muted">Completed orders by hour</span></CardHeader>
              <CardBody><BarsChart data={hasSales ? trend : []} x="hour" series={[{ key: "orders", label: "Orders" }]} /></CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Products by Category</CardTitle><span className="text-xs text-fg-muted">Catalog distribution</span></CardHeader>
              <CardBody><Breakdown data={d!.charts.products_by_category.map((r) => ({ label: r.category, value: r.products }))} money={false} /></CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Order Status Distribution</CardTitle><span className="text-xs text-fg-muted">For the period</span></CardHeader>
              <CardBody>
                <Breakdown data={d!.charts.order_status.map((r) => ({ label: titleCase(r.status), value: r.orders }))} money={false} colorBy="status" />
                <div className="mt-3 flex flex-wrap gap-1">{d!.charts.order_status.map((r) => <Badge key={r.status} variant={specStatusVariant(r.status)}>{titleCase(r.status)} {r.orders}</Badge>)}</div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Expenses by category</CardTitle><Link href="/admin/expenses" className="text-xs text-primary">All expenses</Link></CardHeader>
              <CardBody>
                {d!.charts.expenses_by_category.length ? <Breakdown data={d!.charts.expenses_by_category.map((r) => ({ label: `${r.category} (${r.count})`, value: r.amount_minor }))} /> : <EmptyState icon={Banknote} title="No expenses in this period" hint="Expenses recorded on these business days appear here by category." className="py-8" />}
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Selling Products</CardTitle><span className="text-xs text-fg-muted">Ranked by revenue</span></CardHeader>
              <Table>
                <THead><tr><TH>#</TH><TH>Product</TH><TH right>Units sold</TH><TH right>Orders</TH><TH right>Revenue</TH></tr></THead>
                <TBody>
                  {d!.top_selling.length ? d!.top_selling.map((i, idx) => (
                    <TR key={`${i.product_id}-${i.deal_id}-${i.name}`}><TD className="text-fg-muted tabular">{idx + 1}</TD><TD>{i.name}</TD><TD right>{i.quantity}</TD><TD right>{i.orders}</TD><TD right className="font-medium">{formatMoney(i.revenue_minor)}</TD></TR>
                  )) : <EmptyRow colSpan={5}>No completed sales in this period</EmptyRow>}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      ) : null}
      {x ? (
        <>
          <h2 className="mb-3 text-base font-medium tracking-[0.15px]">Today in Servio <span className="text-sm text-fg-secondary">· business day {formatDate(x.business_day)}</span></h2>
          <Cards>
            <SummaryCard label="Revenue today" value={formatMoney(x.today?.revenue_minor)} sub={pct(x.change_vs_last_week_percent)} icon={Wallet} tone="success" />
            <SummaryCard label="Shifts open" value={x.shifts_open ?? 0} sub={x.day_locked ? "Day locked" : "Day open"} icon={x.day_locked ? Lock : Wallet} tone="neutral" />
            <SummaryCard label="Khata outstanding" value={formatMoney(x.khata_outstanding_minor)} icon={PiggyBank} tone="warning" />
            <SummaryCard label="Needs attention" value={x.needs_attention ?? 0} sub="Rejected sync records" icon={AlertTriangle} tone={x.needs_attention ? "danger" : "neutral"} />
            <SummaryCard label="Tax queue" value={`${x.tax_queue?.queued ?? 0} queued`} sub={`${x.tax_queue?.failed ?? 0} failed`} icon={FileCheck2} tone={x.tax_queue?.failed ? "danger" : "neutral"} />
            <SummaryCard label="Month to date" value={formatMoney(x.month_to_date?.revenue_minor)} sub={`${x.month_to_date?.orders ?? 0} orders · last month ${formatMoney(x.same_period_last_month?.revenue_minor)}`} icon={Wallet} tone="neutral" />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Today by payment method</CardTitle></CardHeader>
              <CardBody><Breakdown data={x.today?.by_payment_method} /></CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent orders</CardTitle><Link href="/admin/orders" className="text-xs text-primary">All orders</Link></CardHeader>
              <Table>
                <THead><tr><TH>Order</TH><TH>Status</TH><TH>When</TH><TH right>Total</TH></tr></THead>
                <TBody>
                  {x.recent_orders?.length ? x.recent_orders.map((o) => (
                    <TR key={o.id}>
                      <TD className="font-mono">{o.label}</TD>
                      <TD><Badge variant={specStatusVariant(o.spec_status)}>{titleCase(o.spec_status ?? o.status)}</Badge></TD>
                      <TD className="text-fg-secondary">{formatDateTime(o.created_at)}</TD>
                      <TD right>{formatMoney(o.total_minor)}</TD>
                    </TR>
                  )) : <EmptyRow colSpan={4} />}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
