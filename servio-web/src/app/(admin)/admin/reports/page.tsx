"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Printer } from "lucide-react";
import { api } from "@/lib/api";
import type { ByDayRow, ByHourRow, CashierRow, CategoryRow, CustomerRow, DiscountsReport, GrandReport, ItemRow, ModifiedRow, ReportOverview, Shift, VoidsReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, daysAgo, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, Loading, Stat, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { BarsChart, Breakdown, TrendChart } from "@/components/charts/charts";

type Tab = "overview" | "items" | "categories" | "cashiers" | "voids" | "discounts" | "modified" | "customers" | "shifts" | "grand";

function useReport<T>(name: string, range: DateRange, enabled = true) {
  return useQuery({ queryKey: ["report", name, range], queryFn: () => api<T>(`/reports/${name}`, { query: { from: range.from, to: range.to } }), enabled });
}

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const [tab, setTab] = useState<Tab>("overview");
  // The SPEC sidebar lists each report as its own entry; until the page is split, /admin/reports#items opens that tab.
  useEffect(() => {
    const apply = () => { const h = window.location.hash.slice(1) as Tab; if (h && tabs.some((t) => t.value === h)) setTab(h); };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: "Overview" }, { value: "items", label: "Items" }, { value: "categories", label: "Categories" }, { value: "cashiers", label: "Cashiers" },
    { value: "voids", label: "Voids" }, { value: "discounts", label: "Discounts" }, { value: "modified", label: "Modified" }, { value: "customers", label: "Customers" }, { value: "shifts", label: "Shifts" }, { value: "grand", label: "Grand report" },
  ];
  return (
    <>
      <PageHeader icon={BarChart3} title="Reports" description="Paid orders by business day. Money in rupees." actions={<Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>} />
      <FilterBar className="no-print"><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      <Tabs value={tab} onChange={setTab} items={tabs} className="no-print mb-4 w-fit max-w-full" />
      <div className="print-area">
        {tab === "overview" ? <Overview range={range} /> : null}
        {tab === "items" ? <Items range={range} /> : null}
        {tab === "categories" ? <Categories range={range} /> : null}
        {tab === "cashiers" ? <Cashiers range={range} /> : null}
        {tab === "voids" ? <Voids range={range} /> : null}
        {tab === "discounts" ? <Discounts range={range} /> : null}
        {tab === "modified" ? <Modified range={range} /> : null}
        {tab === "customers" ? <Customers range={range} /> : null}
        {tab === "shifts" ? <Shifts range={range} /> : null}
        {tab === "grand" ? <Grand range={range} /> : null}
      </div>
    </>
  );
}

function OverviewCards({ o }: { o: ReportOverview }) {
  return (
    <Cards>
      <SummaryCard label="Revenue" value={formatMoney(o.revenue_minor)} sub={`${o.orders} paid orders · avg ${formatMoney(o.average_order_minor)}`} tone="success" />
      <SummaryCard label="Discounts" value={formatMoney(o.discount_minor)} sub={`Tax ${formatMoney(o.tax_minor)} · service ${formatMoney(o.service_charge_minor)}`} tone="neutral" />
      <SummaryCard label="Voided" value={formatMoney(o.voided_minor)} sub={`${o.voided} orders · refunds ${formatMoney(o.refunds_minor)}`} tone="danger" />
      <SummaryCard label="Customers" value={o.customers} sub={`${o.staff_meals} staff meals · tips ${formatMoney(o.tips_minor)}`} tone="info" />
    </Cards>
  );
}

function Overview({ range }: { range: DateRange }) {
  const o = useReport<ReportOverview>("overview", range);
  const byDay = useReport<{ data: ByDayRow[] }>("by_day", range);
  const byHour = useReport<{ data: ByHourRow[] }>("by_hour", range);
  if (o.isLoading || !o.data) return <Loading />;
  const days = (byDay.data?.data ?? []).map((r) => ({ day: formatDate(r.business_day).slice(0, 6), revenue: r.revenue_minor, orders: r.orders, discount: r.discount_minor }));
  const hours = (byHour.data?.data ?? []).map((r) => ({ hour: `${r.hour}:00`, revenue: r.revenue_minor, orders: r.orders }));
  return (
    <>
      <OverviewCards o={o.data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Revenue by day (Rs)</CardTitle></CardHeader><CardBody><TrendChart data={days} x="day" series={[{ key: "revenue", label: "Revenue", money: true }, { key: "discount", label: "Discounts", money: true }]} money /></CardBody></Card>
        <Card><CardHeader><CardTitle>Orders by day (count)</CardTitle></CardHeader><CardBody><BarsChart data={days} x="day" series={[{ key: "orders", label: "Orders" }]} /></CardBody></Card>
        <Card><CardHeader><CardTitle>Revenue by hour (Rs)</CardTitle></CardHeader><CardBody><BarsChart data={hours} x="hour" series={[{ key: "revenue", label: "Revenue", money: true }]} money /></CardBody></Card>
        <Card><CardHeader><CardTitle>By payment method</CardTitle></CardHeader><CardBody><Breakdown data={o.data.by_payment_method} /></CardBody></Card>
        <Card><CardHeader><CardTitle>By order type</CardTitle></CardHeader><CardBody><Breakdown data={o.data.by_order_type} /></CardBody></Card>
        <Card><CardHeader><CardTitle>By source</CardTitle></CardHeader><CardBody><Breakdown data={o.data.by_source} /></CardBody></Card>
      </div>
    </>
  );
}

function Items({ range }: { range: DateRange }) {
  const q = useReport<{ data: ItemRow[] }>("items", range);
  if (q.isLoading) return <Loading />;
  return (
    <Table><THead><tr><TH>Item</TH><TH right>Qty</TH><TH right>Orders</TH><TH right>Discount</TH><TH right>Revenue</TH></tr></THead>
      <TBody>{q.data?.data.length ? q.data.data.map((r, i) => <TR key={i}><TD className="font-medium">{r.name}{r.deal_id ? <Badge className="ml-1" variant="accent">deal</Badge> : null}</TD><TD right>{r.quantity}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.discount_minor)}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={5} />}</TBody></Table>
  );
}

function Categories({ range }: { range: DateRange }) {
  const q = useReport<{ data: CategoryRow[] }>("categories", range);
  if (q.isLoading) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Revenue by category</CardTitle></CardHeader><CardBody><Breakdown data={(q.data?.data ?? []).map((r) => ({ label: r.name, value: r.revenue_minor }))} /></CardBody></Card>
      <Table><THead><tr><TH>Category</TH><TH right>Qty</TH><TH right>Revenue</TH></tr></THead><TBody>{q.data?.data.length ? q.data.data.map((r, i) => <TR key={i}><TD>{r.name}</TD><TD right>{r.quantity}</TD><TD right>{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={3} />}</TBody></Table>
    </div>
  );
}

function Cashiers({ range }: { range: DateRange }) {
  const q = useReport<{ data: CashierRow[] }>("cashiers", range);
  const t = useReport<{ data: { membership_id: string; name: string | null; orders: number; revenue_minor: number }[] }>("order_takers", range);
  if (q.isLoading) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Cashiers (who took payment)</CardTitle></CardHeader>
        <Table><THead><tr><TH>Cashier</TH><TH right>Orders</TH><TH right>Discounts</TH><TH right>Voids</TH><TH right>Revenue</TH></tr></THead><TBody>{q.data?.data.length ? q.data.data.map((r, i) => <TR key={i}><TD>{r.name ?? "Unknown"}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.discount_minor)}</TD><TD right>{r.voids}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={5} />}</TBody></Table></Card>
      <Card><CardHeader><CardTitle>Order takers</CardTitle></CardHeader>
        <Table><THead><tr><TH>Staff</TH><TH right>Orders</TH><TH right>Revenue</TH></tr></THead><TBody>{t.data?.data.length ? t.data.data.map((r, i) => <TR key={i}><TD>{r.name ?? "Unknown"}</TD><TD right>{r.orders}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={3} />}</TBody></Table></Card>
    </div>
  );
}

function Voids({ range }: { range: DateRange }) {
  const q = useReport<VoidsReport>("voids", range);
  if (q.isLoading || !q.data) return <Loading />;
  return (
    <>
      <Cards><SummaryCard label="Voided orders" value={q.data.count} tone="danger" /><SummaryCard label="Voided amount" value={formatMoney(q.data.amount_minor)} tone="danger" /></Cards>
      <Table><THead><tr><TH>Order</TH><TH>Reason</TH><TH>By</TH><TH>Approved by</TH><TH>When</TH><TH right>Amount</TH></tr></THead><TBody>{q.data.rows.length ? q.data.rows.map((r, i) => <TR key={i}><TD className="font-mono">{r.label}</TD><TD>{r.reason}</TD><TD>{r.by ?? "-"}</TD><TD>{r.approved_by ?? "-"}</TD><TD className="text-fg-secondary">{formatDateTime(r.at)}</TD><TD right>{formatMoney(r.amount_minor)}</TD></TR>) : <EmptyRow colSpan={6}>No voids</EmptyRow>}</TBody></Table>
    </>
  );
}

function Discounts({ range }: { range: DateRange }) {
  const q = useReport<DiscountsReport>("discounts", range);
  if (q.isLoading || !q.data) return <Loading />;
  return (
    <>
      <Cards><SummaryCard label="Discounts given" value={q.data.count} /><SummaryCard label="Amount" value={formatMoney(q.data.amount_minor)} tone="warning" /></Cards>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card><CardHeader><CardTitle>By reason</CardTitle></CardHeader><CardBody><Breakdown data={q.data.by_reason} /></CardBody></Card>
        <Table><THead><tr><TH>Order</TH><TH>Discount</TH><TH>Reason</TH><TH>By</TH><TH>When</TH><TH right>Amount</TH></tr></THead><TBody>{q.data.rows.length ? q.data.rows.map((r, i) => <TR key={i}><TD className="font-mono">{r.label}</TD><TD>{r.kind} {r.value}{r.kind === "percent" ? "%" : ""}</TD><TD>{r.reason ?? "-"}</TD><TD>{r.by ?? "-"}{r.approved_by ? <span className="text-xs text-fg-muted"> · ok {r.approved_by}</span> : null}</TD><TD className="text-fg-secondary">{formatDateTime(r.at)}</TD><TD right>{formatMoney(r.amount_minor)}</TD></TR>) : <EmptyRow colSpan={6}>No discounts</EmptyRow>}</TBody></Table>
      </div>
    </>
  );
}

function Modified({ range }: { range: DateRange }) {
  const q = useReport<{ data: ModifiedRow[] }>("modified", range);
  if (q.isLoading) return <Loading />;
  return (
    <Table><THead><tr><TH>Order</TH><TH>Status</TH><TH>Tickets</TH><TH right>Total</TH></tr></THead><TBody>{q.data?.data.length ? q.data.data.map((r) => <TR key={r.order_id}><TD className="font-mono">{r.label}</TD><TD><Badge>{r.status}</Badge></TD><TD className="text-xs">{r.tickets.map((t, i) => <div key={i}><Badge variant={t.kind === "cancelled" ? "danger" : "warning"}>{t.kind}</Badge> {t.lines.join(", ")} <span className="text-fg-muted">{formatDateTime(t.at)}</span></div>)}</TD><TD right>{formatMoney(r.total_minor)}</TD></TR>) : <EmptyRow colSpan={4}>No orders were changed after sending</EmptyRow>}</TBody></Table>
  );
}

function Customers({ range }: { range: DateRange }) {
  const q = useReport<{ data: CustomerRow[] }>("customers", range);
  if (q.isLoading) return <Loading />;
  return (
    <Table><THead><tr><TH>Customer</TH><TH>Phone</TH><TH right>Orders</TH><TH right>Revenue</TH><TH right>Balance</TH><TH>Last order</TH></tr></THead><TBody>{q.data?.data.length ? q.data.data.map((r) => <TR key={r.customer_id}><TD className="font-medium">{r.name}</TD><TD className="text-fg-secondary">{r.phone}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.revenue_minor)}</TD><TD right className={r.balance_minor ? "text-danger" : ""}>{r.balance_minor ? formatMoney(r.balance_minor) : "-"}</TD><TD className="text-fg-secondary">{formatDateTime(r.last_order_at)}</TD></TR>) : <EmptyRow colSpan={6} />}</TBody></Table>
  );
}

function Shifts({ range }: { range: DateRange }) {
  const q = useReport<{ data: Shift[] }>("shifts", range);
  if (q.isLoading) return <Loading />;
  return (
    <Table><THead><tr><TH>Cashier</TH><TH>Opened</TH><TH>Status</TH><TH right>Net sales</TH><TH right>Expected</TH><TH right>Counted</TH><TH right>Over / short</TH></tr></THead><TBody>{q.data?.data.length ? q.data.data.map((s) => <TR key={s.id}><TD>{s.cashier ?? "-"}</TD><TD className="text-fg-secondary">{formatDateTime(s.opened_at)}</TD><TD><Badge>{s.status}</Badge></TD><TD right>{formatMoney(s.net_sales_minor)}</TD><TD right>{formatMoney(s.expected_cash_minor)}</TD><TD right>{s.counted_cash_minor !== null ? formatMoney(s.counted_cash_minor) : "-"}</TD><TD right className={(s.over_short_minor ?? 0) < 0 ? "text-danger" : ""}>{s.over_short_minor !== null && s.over_short_minor !== undefined ? formatMoney(s.over_short_minor) : "-"}</TD></TR>) : <EmptyRow colSpan={7} />}</TBody></Table>
  );
}

function Grand({ range }: { range: DateRange }) {
  const q = useReport<GrandReport>("grand", range);
  if (q.isLoading || !q.data) return <Loading />;
  const g = q.data;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Grand report {formatDate(g.from)} – {formatDate(g.to)}</h2>
      <OverviewCards o={g.overview} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Payment methods</CardTitle></CardHeader><CardBody><Breakdown data={g.overview.by_payment_method} /></CardBody></Card>
        <Card><CardHeader><CardTitle>Voids and discounts</CardTitle></CardHeader><CardBody><Stat label="Voids" value={`${g.voids.count} · ${formatMoney(g.voids.amount_minor)}`} tone="danger" /><Stat label="Discounts" value={`${g.discounts.count} · ${formatMoney(g.discounts.amount_minor)}`} />{Object.entries(g.discounts.by_reason ?? {}).map(([k, v]) => <Stat key={k} label={`· ${k}`} value={formatMoney(v)} />)}</CardBody></Card>
        <Card><CardHeader><CardTitle>Top items</CardTitle></CardHeader><Table><THead><tr><TH>Item</TH><TH right>Qty</TH><TH right>Revenue</TH></tr></THead><TBody>{g.items.map((r, i) => <TR key={i}><TD>{r.name}</TD><TD right>{r.quantity}</TD><TD right>{formatMoney(r.revenue_minor)}</TD></TR>)}</TBody></Table></Card>
        <Card><CardHeader><CardTitle>Categories</CardTitle></CardHeader><Table><THead><tr><TH>Category</TH><TH right>Qty</TH><TH right>Revenue</TH></tr></THead><TBody>{g.categories.map((r, i) => <TR key={i}><TD>{r.name}</TD><TD right>{r.quantity}</TD><TD right>{formatMoney(r.revenue_minor)}</TD></TR>)}</TBody></Table></Card>
        <Card><CardHeader><CardTitle>Cashiers</CardTitle></CardHeader><Table><THead><tr><TH>Cashier</TH><TH right>Orders</TH><TH right>Revenue</TH></tr></THead><TBody>{g.cashiers.map((r, i) => <TR key={i}><TD>{r.name ?? "-"}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.revenue_minor)}</TD></TR>)}</TBody></Table></Card>
        <Card><CardHeader><CardTitle>By day</CardTitle></CardHeader><Table><THead><tr><TH>Day</TH><TH right>Orders</TH><TH right>Revenue</TH></tr></THead><TBody>{g.by_day.map((r) => <TR key={r.business_day}><TD>{formatDate(r.business_day)}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.revenue_minor)}</TD></TR>)}</TBody></Table></Card>
      </div>
      {g.shifts?.length ? <Card><CardHeader><CardTitle>Shifts</CardTitle></CardHeader><CardBody className="grid gap-4 md:grid-cols-2">{g.shifts.map((s) => <div key={s.id} className="rounded-md border p-3"><div className="mb-1 text-sm font-semibold">{s.cashier ?? "Shift"} · {titleCase(s.status)}</div><Stat label="Net sales" value={formatMoney(s.net_sales_minor)} /><Stat label="Over / short" value={formatMoney(s.over_short_minor)} tone={(s.over_short_minor ?? 0) < 0 ? "danger" : undefined} /></div>)}</CardBody></Card> : null}
    </div>
  );
}

