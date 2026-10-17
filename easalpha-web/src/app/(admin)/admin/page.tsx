"use client";
// SPEC dashboard: a period selector and Refresh above the grid; six KPI cards scoped to the period, then four
// operations cards for the current business day (one dashboard, not two); Sales Trend and
// Orders by hour, Products by Category, Order Status Distribution and Expenses (with an explicit empty state); Top
// Selling Products. EasAlpha's extras (tax queue, needs attention, khata, checklist, recent orders) sit in a lower section.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ReceiptText, Wallet, AlertTriangle, PiggyBank, FileCheck2, Lock, Package, Users, Banknote, RefreshCw, BarChart3 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Dashboard, DashboardPeriod, DashboardSpec } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, SummaryCard, SummaryCardSkeleton, Table, TBody, TD, TH, THead, TR, EmptyRow, Tabs } from "@/components/ui";
import { TrendChart, BarsChart, Breakdown } from "@/components/charts/charts";
import { useAuthStore } from "@/store/auth";
import { DASHBOARD_PERIODS, hourLabel, specStatusVariant } from "@/components/admin/order-helpers";

export default function DashboardPage() {
  const qc = useQueryClient();
  const business = useAuthStore((s) => s.session?.business);
  const [period, setPeriodState] = useState<DashboardPeriod>("today");
  // Review 4.1: a dashboard of zeros is a poor first screen. When nothing has sold yet today and the owner has not
  // picked a period, it opens on the last 7 days instead and says so.
  const [picked, setPicked] = useState(false);
  const [fellBack, setFellBack] = useState(false);
  const setPeriod = (p: DashboardPeriod) => { setPicked(true); setFellBack(false); setPeriodState(p); };
  const [custom, setCustom] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const query = period === "custom" ? { period, from: custom.from, to: custom.to } : { period };
  // Review 6: the cards and the extras arrive in one call (cached on the server for up to a minute, and at once when
  // an order changes); Refresh asks for a fresh copy.
  const fresh = useRef(false);
  const all = useQuery({
    queryKey: ["dashboard", "all", query],
    queryFn: () => api<{ spec: DashboardSpec; extras: Dashboard | null }>("/reports/dashboard/all", { query: fresh.current ? { ...query, fresh: 1 } : query }).finally(() => { fresh.current = false; }),
    refetchInterval: 60_000,
  });
  const refresh = () => { fresh.current = true; return qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const d = all.data?.spec;
  const x = all.data?.extras ?? undefined;
  const cards = d?.cards;
  const trend = (d?.charts.sales_by_hour ?? []).map((r) => ({ hour: hourLabel(r.hour), revenue: r.revenue_minor, orders: r.orders }));
  const hasSales = trend.some((r) => r.revenue > 0 || r.orders > 0);
  const checklistDone = x?.checklist?.filter((c) => c.done).length ?? 0;
  useEffect(() => {
    if (!picked && period === "today" && d && d.cards.total_orders === 0) { setFellBack(true); setPeriodState("7d"); }
  }, [picked, period, d]);
  // No percentage when there is nothing to compare: no sales yet, or no baseline last week (review 4.1: Rs 0 showed
  // as a red -100%).
  const pct = (v: number | null | undefined, current: number) => (current <= 0 ? "No completed sales yet" : v === null || v === undefined ? "Nothing to compare last week" : `${v >= 0 ? "+" : ""}${formatPercent(v)} vs last week`);
  const paymentRows = x?.today?.by_payment_method ?? [];
  const hasPayments = Array.isArray(paymentRows) ? paymentRows.length > 0 : Object.keys(paymentRows).length > 0;
  const expenses = d?.charts.expenses_by_category ?? [];
  const statuses = d?.charts.order_status ?? [];
  const rangeLabel = d ? (d.from === d.to ? formatDate(d.from) : `${formatDate(d.from)} to ${formatDate(d.to)}`) : "";
  return (
    <>
      <PageHeader icon={LayoutDashboard} title={`Good day, ${business?.name ?? ""}`} description={`${rangeLabel}${x?.day_locked ? " · day locked" : ""}`}
        actions={<Button variant="secondary" onClick={refresh} loading={all.isFetching}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
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
      {fellBack ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-info-soft/60 px-4 py-3 text-sm text-info-ink">
          <span>Nothing has sold yet today, so this shows the last 7 days.</span>
          <button type="button" className="min-h-10 font-medium underline underline-offset-4" onClick={() => setPeriod("today")}>Show today</button>
        </div>
      ) : null}
      {all.error ? <ErrorState message={errorMessage(all.error)} onRetry={() => all.refetch()} /> : null}
      {/* Review 4.1: two tiers. The three figures an owner checks first, large; the rest in a compact strip. Skeletons
          hold their place while the figures load, so nobody reads a false Rs 0 (review 6). */}
      <Cards>
        {cards ? <SummaryCard size="large" label="Total revenue" value={formatMoney(cards.total_revenue_minor)} sub={period === "today" && x ? pct(x.change_vs_last_week_percent, cards.total_revenue_minor) : "Completed orders only"} icon={Wallet} tone="success" /> : <SummaryCardSkeleton size="large" />}
        {cards ? <SummaryCard size="large" label="Total orders" value={cards.total_orders} sub={cards.cancelled_orders ? `${cards.cancelled_orders} cancelled` : "None cancelled"} icon={ReceiptText} tone={cards.cancelled_orders ? "warning" : "primary"} /> : <SummaryCardSkeleton size="large" />}
        {x ? <SummaryCard size="large" label="Khata outstanding" value={formatMoney(x.khata_outstanding_minor)} sub="Customer credit to collect" icon={PiggyBank} tone="warning" /> : <SummaryCardSkeleton size="large" />}
      </Cards>
      <Cards className="-mt-2">
        {cards ? <SummaryCard size="compact" label="Incl. open orders" value={formatMoney(cards.incl_open_minor)} sub={`+ ${formatMoney(cards.open_minor)} still open`} icon={ReceiptText} tone="info" /> : <SummaryCardSkeleton size="compact" />}
        {cards ? <SummaryCard size="compact" label="Expenses" value={formatMoney(cards.expenses_minor)} sub="For the period" icon={Banknote} tone={cards.expenses_minor ? "danger" : "neutral"} /> : <SummaryCardSkeleton size="compact" />}
        {cards ? <SummaryCard size="compact" label="Customers" value={cards.total_customers} sub="Registered" icon={Users} tone="primary" /> : <SummaryCardSkeleton size="compact" />}
        {cards ? <SummaryCard size="compact" label="Products" value={cards.total_products} sub="Active in the catalog" icon={Package} tone="neutral" /> : <SummaryCardSkeleton size="compact" />}
        {x ? <SummaryCard size="compact" label="Shifts open" value={x.shifts_open ?? 0} sub={x.day_locked ? `${formatDate(x.business_day)} · locked` : `${formatDate(x.business_day)} · open`} icon={x.day_locked ? Lock : Wallet} tone="neutral" /> : <SummaryCardSkeleton size="compact" />}
        {x ? <SummaryCard size="compact" label="Needs attention" value={x.needs_attention ?? 0} sub="Records that failed to sync" icon={AlertTriangle} tone={x.needs_attention ? "danger" : "neutral"} /> : <SummaryCardSkeleton size="compact" />}
        {x ? <SummaryCard size="compact" label="Tax queue" value={`${x.tax_queue?.queued ?? 0} queued`} sub={`${x.tax_queue?.failed ?? 0} failed`} icon={FileCheck2} tone={x.tax_queue?.failed ? "danger" : "neutral"} /> : <SummaryCardSkeleton size="compact" />}
      </Cards>
      {cards ? (
        <>
          {/* Charts with nothing to draw are left out rather than drawn as empty boxes; when nothing at all has sold in
              the period, one message says so. */}
          {!hasSales && !hasPayments ? <EmptyState icon={BarChart3} className="mb-6" title="No completed sales in this period" hint="Sales charts appear here as soon as orders are paid. Pick a longer period above to see earlier days." /> : null}
          {/* Which charts show depends on the data, so when their count is odd the last card takes the full row
              instead of sitting alone beside an empty half (review 1.1). */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
            {hasSales ? (
              <Card>
                <CardHeader><CardTitle>Sales Trend (Rs)</CardTitle><span className="text-xs text-fg-muted">Completed revenue by hour</span></CardHeader>
                <CardBody><TrendChart data={trend} x="hour" series={[{ key: "revenue", label: "Revenue", money: true }]} money /></CardBody>
              </Card>
            ) : null}
            {hasSales ? (
              <Card>
                <CardHeader><CardTitle>Orders (count)</CardTitle><span className="text-xs text-fg-muted">Completed orders by hour</span></CardHeader>
                <CardBody><BarsChart data={trend} x="hour" series={[{ key: "orders", label: "Orders" }]} /></CardBody>
              </Card>
            ) : null}
            {hasPayments ? (
              <Card>
                <CardHeader><CardTitle>Today by payment method</CardTitle><span className="text-xs text-fg-muted">{x ? `Business day ${formatDate(x.business_day)}` : ""}</span></CardHeader>
                <CardBody><Breakdown data={paymentRows} /></CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader><CardTitle>Recent orders</CardTitle><Link href="/admin/orders" className="text-xs text-primary">All orders</Link></CardHeader>
              <Table>
                <THead><tr><TH>Order</TH><TH>Status</TH><TH>When</TH><TH right>Total</TH></tr></THead>
                <TBody>
                  {x?.recent_orders?.length ? x.recent_orders.map((o) => (
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
            <Card>
              <CardHeader><CardTitle>Products by Category</CardTitle><span className="text-xs text-fg-muted">Catalog distribution</span></CardHeader>
              <CardBody><Breakdown data={d!.charts.products_by_category.map((r) => ({ label: r.category, value: r.products }))} money={false} /></CardBody>
            </Card>
            {statuses.some((r) => r.orders > 0) ? (
              <Card>
                <CardHeader><CardTitle>Order Status Distribution</CardTitle><span className="text-xs text-fg-muted">For the period</span></CardHeader>
                {/* One list: the review found the same six figures printed twice, as bars and again as pills. */}
                <CardBody><Breakdown data={statuses.map((r) => ({ label: titleCase(r.status), value: r.orders }))} money={false} colorBy="status" /></CardBody>
              </Card>
            ) : null}
            {expenses.length ? (
              <Card>
                <CardHeader><CardTitle>Expenses by category</CardTitle><Link href="/admin/expenses" className="text-xs text-primary">All expenses</Link></CardHeader>
                <CardBody><Breakdown data={expenses.map((r) => ({ label: `${r.category} (${r.count})`, value: r.amount_minor }))} /></CardBody>
              </Card>
            ) : null}
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
    </>
  );
}
