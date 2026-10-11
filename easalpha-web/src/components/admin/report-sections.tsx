"use client";
// The report sections extracted from the original tabbed Reports page. Each has a presentational part that takes
// rows (so a report page can export the same rows) and a range wrapper that fetches them (used by Business Overview).
import type { ByDayRow, ByHourRow, CashierRow, CategoryRow, CustomerRow, DiscountsReport, GrandReport, ItemRow, ModifiedRow, ReportOverview, Shift, VoidsReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import type { PdfColumn } from "@/lib/pdf";
import { Cards, type DateRange } from "@/components/admin/page";
import { useReport } from "@/components/admin/report-shell";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyRow, Loading, Stat, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { BarsChart, Breakdown, TrendChart } from "@/components/charts/charts";

export interface OrderTakerRow { membership_id: string | null; name: string | null; orders: number; revenue_minor: number }

export function OverviewCards({ o }: { o: ReportOverview }) {
  return (
    <Cards>
      <SummaryCard label="Revenue" value={formatMoney(o.revenue_minor)} sub={`${o.orders} paid orders · avg ${formatMoney(o.average_order_minor)}`} tone="success" />
      <SummaryCard label="Discounts" value={formatMoney(o.discount_minor)} sub={`Tax ${formatMoney(o.tax_minor)} · service ${formatMoney(o.service_charge_minor)}`} tone="neutral" />
      <SummaryCard label="Voided" value={formatMoney(o.voided_minor)} sub={`${o.voided} orders · refunds ${formatMoney(o.refunds_minor)}`} tone="danger" />
      <SummaryCard label="Customers" value={o.customers} sub={`${o.staff_meals} staff meals · tips ${formatMoney(o.tips_minor)}`} tone="info" />
    </Cards>
  );
}

export function OverviewCharts({ o, byDay, byHour }: { o: ReportOverview; byDay: ByDayRow[]; byHour: ByHourRow[] }) {
  const days = byDay.map((r) => ({ day: formatDate(r.business_day).slice(0, 6), revenue: r.revenue_minor, orders: r.orders, discount: r.discount_minor }));
  const hours = byHour.map((r) => ({ hour: `${r.hour}:00`, revenue: r.revenue_minor, orders: r.orders }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Revenue by day (Rs)</CardTitle></CardHeader><CardBody><TrendChart data={days} x="day" series={[{ key: "revenue", label: "Revenue", money: true }, { key: "discount", label: "Discounts", money: true }]} money /></CardBody></Card>
      <Card><CardHeader><CardTitle>Orders by day (count)</CardTitle></CardHeader><CardBody><BarsChart data={days} x="day" series={[{ key: "orders", label: "Orders" }]} /></CardBody></Card>
      <Card><CardHeader><CardTitle>Revenue by hour (Rs)</CardTitle></CardHeader><CardBody><BarsChart data={hours} x="hour" series={[{ key: "revenue", label: "Revenue", money: true }]} money /></CardBody></Card>
      <Card><CardHeader><CardTitle>By payment method</CardTitle></CardHeader><CardBody><Breakdown data={o.by_payment_method} /></CardBody></Card>
      <Card><CardHeader><CardTitle>By order type</CardTitle></CardHeader><CardBody><Breakdown data={o.by_order_type} /></CardBody></Card>
      <Card><CardHeader><CardTitle>By source</CardTitle></CardHeader><CardBody><Breakdown data={o.by_source} /></CardBody></Card>
    </div>
  );
}

export function Overview({ range }: { range: DateRange }) {
  const o = useReport<ReportOverview>("overview", range);
  const byDay = useReport<{ data: ByDayRow[] }>("by_day", range);
  const byHour = useReport<{ data: ByHourRow[] }>("by_hour", range);
  if (o.isLoading || !o.data) return <Loading />;
  return (
    <>
      <OverviewCards o={o.data} />
      <OverviewCharts o={o.data} byDay={byDay.data?.data ?? []} byHour={byHour.data?.data ?? []} />
    </>
  );
}

// ---- Items (Products & Deals) ----
export const ITEM_COLUMNS: PdfColumn[] = [{ header: "Item", key: "name" }, { header: "Type", key: "type" }, { header: "Qty", key: "quantity", align: "right" }, { header: "Orders", key: "orders", align: "right" }, { header: "Discount", key: "discount", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }];
export const itemExportRows = (rows: ItemRow[]) => rows.map((r) => ({ name: r.name, type: r.deal_id ? "Deal" : "Product", quantity: r.quantity, orders: r.orders, discount: formatMoney(r.discount_minor), revenue: formatMoney(r.revenue_minor) }));

export function ItemsTable({ rows }: { rows: ItemRow[] }) {
  return (
    <Table><THead><tr><TH>Item</TH><TH right>Qty</TH><TH right>Orders</TH><TH right>Discount</TH><TH right>Revenue</TH></tr></THead>
      <TBody>{rows.length ? rows.map((r, i) => <TR key={i}><TD className="font-medium">{r.name}{r.deal_id ? <Badge className="ml-1" variant="accent">deal</Badge> : null}</TD><TD right>{r.quantity}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.discount_minor)}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={5} />}</TBody></Table>
  );
}

export function Items({ range }: { range: DateRange }) {
  const q = useReport<{ data: ItemRow[] }>("items", range);
  if (q.isLoading) return <Loading />;
  return <ItemsTable rows={q.data?.data ?? []} />;
}

// ---- Categories ----
export const CATEGORY_COLUMNS: PdfColumn[] = [{ header: "Category", key: "name" }, { header: "Qty", key: "quantity", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }, { header: "Share", key: "share", align: "right" }];
export const categoryExportRows = (rows: CategoryRow[]) => {
  const total = rows.reduce((a, r) => a + r.revenue_minor, 0);
  return rows.map((r) => ({ name: r.name, quantity: r.quantity, revenue: formatMoney(r.revenue_minor), share: total ? `${((r.revenue_minor * 100) / total).toFixed(1)}%` : "0%" }));
};

export function CategoriesSection({ rows }: { rows: CategoryRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Revenue by category</CardTitle></CardHeader><CardBody><Breakdown data={rows.map((r) => ({ label: r.name, value: r.revenue_minor }))} /></CardBody></Card>
      <Table><THead><tr><TH>Category</TH><TH right>Qty</TH><TH right>Revenue</TH></tr></THead><TBody>{rows.length ? rows.map((r, i) => <TR key={i}><TD>{r.name}</TD><TD right>{r.quantity}</TD><TD right>{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={3} />}</TBody></Table>
    </div>
  );
}

export function Categories({ range }: { range: DateRange }) {
  const q = useReport<{ data: CategoryRow[] }>("categories", range);
  if (q.isLoading) return <Loading />;
  return <CategoriesSection rows={q.data?.data ?? []} />;
}

// ---- Cashiers and order takers ----
export const CASHIER_COLUMNS: PdfColumn[] = [{ header: "Cashier", key: "name" }, { header: "Orders", key: "orders", align: "right" }, { header: "Discounts", key: "discounts", align: "right" }, { header: "Voids", key: "voids", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }];
export const cashierExportRows = (rows: CashierRow[]) => rows.map((r) => ({ name: r.name ?? "Unknown", orders: r.orders, discounts: formatMoney(r.discount_minor), voids: r.voids, revenue: formatMoney(r.revenue_minor) }));
export const ORDER_TAKER_COLUMNS: PdfColumn[] = [{ header: "Staff", key: "name" }, { header: "Orders", key: "orders", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }, { header: "Average order", key: "average", align: "right" }];
export const orderTakerExportRows = (rows: OrderTakerRow[]) => rows.map((r) => ({ name: r.name ?? "Unknown", orders: r.orders, revenue: formatMoney(r.revenue_minor), average: formatMoney(r.orders ? Math.round(r.revenue_minor / r.orders) : 0) }));

export function CashiersTable({ rows }: { rows: CashierRow[] }) {
  return (
    <Table><THead><tr><TH>Cashier</TH><TH right>Orders</TH><TH right>Discounts</TH><TH right>Voids</TH><TH right>Revenue</TH></tr></THead><TBody>{rows.length ? rows.map((r, i) => <TR key={i}><TD>{r.name ?? "Unknown"}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.discount_minor)}</TD><TD right>{r.voids}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={5} />}</TBody></Table>
  );
}

export function OrderTakersTable({ rows }: { rows: OrderTakerRow[] }) {
  return (
    <Table><THead><tr><TH>Staff</TH><TH right>Orders</TH><TH right>Revenue</TH><TH right>Average order</TH></tr></THead><TBody>{rows.length ? rows.map((r, i) => <TR key={i}><TD>{r.name ?? "Unknown"}</TD><TD right>{r.orders}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD><TD right className="text-fg-secondary">{formatMoney(r.orders ? Math.round(r.revenue_minor / r.orders) : 0)}</TD></TR>) : <EmptyRow colSpan={4} />}</TBody></Table>
  );
}

export function Cashiers({ range }: { range: DateRange }) {
  const q = useReport<{ data: CashierRow[] }>("cashiers", range);
  const t = useReport<{ data: OrderTakerRow[] }>("order_takers", range);
  if (q.isLoading) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Cashiers (who took payment)</CardTitle></CardHeader><CashiersTable rows={q.data?.data ?? []} /></Card>
      <Card><CardHeader><CardTitle>Order takers</CardTitle></CardHeader><OrderTakersTable rows={t.data?.data ?? []} /></Card>
    </div>
  );
}

// ---- Voids (cancelled orders) ----
export const VOID_COLUMNS: PdfColumn[] = [{ header: "Order", key: "label" }, { header: "Reason", key: "reason" }, { header: "By", key: "by" }, { header: "Approved by", key: "approved_by" }, { header: "When", key: "at" }, { header: "Amount", key: "amount", align: "right" }];
export const voidExportRows = (rows: VoidsReport["rows"]) => rows.map((r) => ({ label: r.label, reason: r.reason, by: r.by ?? "", approved_by: r.approved_by ?? "", at: formatDateTime(r.at), amount: formatMoney(r.amount_minor) }));

export function VoidsSection({ report, cards = true }: { report: VoidsReport; cards?: boolean }) {
  return (
    <>
      {cards ? <Cards><SummaryCard label="Voided orders" value={report.count} tone="danger" /><SummaryCard label="Voided amount" value={formatMoney(report.amount_minor)} tone="danger" /></Cards> : null}
      <Table><THead><tr><TH>Order</TH><TH>Reason</TH><TH>By</TH><TH>Approved by</TH><TH>When</TH><TH right>Amount</TH></tr></THead><TBody>{report.rows.length ? report.rows.map((r, i) => <TR key={i}><TD className="font-mono">{r.label}</TD><TD>{r.reason}</TD><TD>{r.by ?? "-"}</TD><TD>{r.approved_by ?? "-"}</TD><TD className="text-fg-secondary">{formatDateTime(r.at)}</TD><TD right>{formatMoney(r.amount_minor)}</TD></TR>) : <EmptyRow colSpan={6}>No voids</EmptyRow>}</TBody></Table>
    </>
  );
}

export function Voids({ range }: { range: DateRange }) {
  const q = useReport<VoidsReport>("voids", range);
  if (q.isLoading || !q.data) return <Loading />;
  return <VoidsSection report={q.data} />;
}

// ---- Discounts ----
export const DISCOUNT_COLUMNS: PdfColumn[] = [{ header: "Order", key: "label" }, { header: "Discount", key: "discount" }, { header: "Reason", key: "reason" }, { header: "By", key: "by" }, { header: "Approved by", key: "approved_by" }, { header: "When", key: "at" }, { header: "Amount", key: "amount", align: "right" }];
export const discountExportRows = (rows: DiscountsReport["rows"]) => rows.map((r) => ({ label: r.label, discount: `${r.kind} ${r.value}${r.kind === "percent" ? "%" : ""}`, reason: r.reason ?? "", by: r.by ?? "", approved_by: r.approved_by ?? "", at: formatDateTime(r.at), amount: formatMoney(r.amount_minor) }));

export function DiscountsSection({ report, cards = true }: { report: DiscountsReport; cards?: boolean }) {
  return (
    <>
      {cards ? <Cards><SummaryCard label="Discounts given" value={report.count} /><SummaryCard label="Amount" value={formatMoney(report.amount_minor)} tone="warning" /></Cards> : null}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card><CardHeader><CardTitle>By reason</CardTitle></CardHeader><CardBody><Breakdown data={report.by_reason} /></CardBody></Card>
        <Table><THead><tr><TH>Order</TH><TH>Discount</TH><TH>Reason</TH><TH>By</TH><TH>When</TH><TH right>Amount</TH></tr></THead><TBody>{report.rows.length ? report.rows.map((r, i) => <TR key={i}><TD className="font-mono">{r.label}</TD><TD>{r.kind} {r.value}{r.kind === "percent" ? "%" : ""}</TD><TD>{r.reason ?? "-"}</TD><TD>{r.by ?? "-"}{r.approved_by ? <span className="text-xs text-fg-muted"> · ok {r.approved_by}</span> : null}</TD><TD className="text-fg-secondary">{formatDateTime(r.at)}</TD><TD right>{formatMoney(r.amount_minor)}</TD></TR>) : <EmptyRow colSpan={6}>No discounts</EmptyRow>}</TBody></Table>
      </div>
    </>
  );
}

export function Discounts({ range }: { range: DateRange }) {
  const q = useReport<DiscountsReport>("discounts", range);
  if (q.isLoading || !q.data) return <Loading />;
  return <DiscountsSection report={q.data} />;
}

// ---- Modified orders ----
export const MODIFIED_COLUMNS: PdfColumn[] = [{ header: "Order", key: "label" }, { header: "Status", key: "status" }, { header: "Changes", key: "changes", align: "right" }, { header: "Tickets", key: "tickets" }, { header: "Total", key: "total", align: "right" }];
export const modifiedExportRows = (rows: ModifiedRow[]) => rows.map((r) => ({ label: r.label, status: r.status, changes: r.tickets.length, tickets: r.tickets.map((t) => `${t.kind}: ${t.lines.join(", ")} (${formatDateTime(t.at)})`).join(" | "), total: formatMoney(r.total_minor) }));

export function ModifiedTable({ rows }: { rows: ModifiedRow[] }) {
  return (
    <Table><THead><tr><TH>Order</TH><TH>Status</TH><TH>Tickets</TH><TH right>Total</TH></tr></THead><TBody>{rows.length ? rows.map((r) => <TR key={r.order_id}><TD className="font-mono">{r.label}</TD><TD><Badge>{r.status}</Badge></TD><TD className="text-xs">{r.tickets.map((t, i) => <div key={i}><Badge variant={t.kind === "cancelled" ? "danger" : "warning"}>{t.kind}</Badge> {t.lines.join(", ")} <span className="text-fg-muted">{formatDateTime(t.at)}</span></div>)}</TD><TD right>{formatMoney(r.total_minor)}</TD></TR>) : <EmptyRow colSpan={4}>No orders were changed after sending</EmptyRow>}</TBody></Table>
  );
}

export function Modified({ range }: { range: DateRange }) {
  const q = useReport<{ data: ModifiedRow[] }>("modified", range);
  if (q.isLoading) return <Loading />;
  return <ModifiedTable rows={q.data?.data ?? []} />;
}

// ---- Customers ----
export const CUSTOMER_COLUMNS: PdfColumn[] = [{ header: "Customer", key: "name" }, { header: "Phone", key: "phone" }, { header: "Orders", key: "orders", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }, { header: "Balance", key: "balance", align: "right" }, { header: "Last order", key: "last_order" }];
export const customerExportRows = (rows: CustomerRow[]) => rows.map((r) => ({ name: r.name ?? "", phone: r.phone ?? "", orders: r.orders, revenue: formatMoney(r.revenue_minor), balance: r.balance_minor ? formatMoney(r.balance_minor) : "", last_order: formatDateTime(r.last_order_at) }));

export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  return (
    <Table><THead><tr><TH>Customer</TH><TH>Phone</TH><TH right>Orders</TH><TH right>Revenue</TH><TH right>Balance</TH><TH>Last order</TH></tr></THead><TBody>{rows.length ? rows.map((r) => <TR key={r.customer_id}><TD className="font-medium">{r.name}</TD><TD className="text-fg-secondary">{r.phone}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.revenue_minor)}</TD><TD right className={r.balance_minor ? "text-danger" : ""}>{r.balance_minor ? formatMoney(r.balance_minor) : "-"}</TD><TD className="text-fg-secondary">{formatDateTime(r.last_order_at)}</TD></TR>) : <EmptyRow colSpan={6} />}</TBody></Table>
  );
}

export function Customers({ range }: { range: DateRange }) {
  const q = useReport<{ data: CustomerRow[] }>("customers", range);
  if (q.isLoading) return <Loading />;
  return <CustomersTable rows={q.data?.data ?? []} />;
}

// ---- Shifts ----
export function ShiftsTable({ rows }: { rows: Shift[] }) {
  return (
    <Table><THead><tr><TH>Cashier</TH><TH>Opened</TH><TH>Status</TH><TH right>Net sales</TH><TH right>Expected</TH><TH right>Counted</TH><TH right>Over / short</TH></tr></THead><TBody>{rows.length ? rows.map((s) => <TR key={s.id}><TD>{s.cashier ?? "-"}</TD><TD className="text-fg-secondary">{formatDateTime(s.opened_at)}</TD><TD><Badge>{s.status}</Badge></TD><TD right>{formatMoney(s.net_sales_minor)}</TD><TD right>{formatMoney(s.expected_cash_minor)}</TD><TD right>{s.counted_cash_minor !== null ? formatMoney(s.counted_cash_minor) : "-"}</TD><TD right className={(s.over_short_minor ?? 0) < 0 ? "text-danger" : ""}>{s.over_short_minor !== null && s.over_short_minor !== undefined ? formatMoney(s.over_short_minor) : "-"}</TD></TR>) : <EmptyRow colSpan={7} />}</TBody></Table>
  );
}

export function Shifts({ range }: { range: DateRange }) {
  const q = useReport<{ data: Shift[] }>("shifts", range);
  if (q.isLoading) return <Loading />;
  return <ShiftsTable rows={q.data?.data ?? []} />;
}

// ---- Grand report body (the original sections; the SPEC shares sit above them on the Grand Report page) ----
export function GrandSections({ g, heading = true }: { g: GrandReport; heading?: boolean }) {
  return (
    <div className="space-y-4">
      {heading ? <h2 className="text-lg font-semibold">Grand report {formatDate(g.from)} – {formatDate(g.to)}</h2> : null}
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

export function Grand({ range }: { range: DateRange }) {
  const q = useReport<GrandReport>("grand", range);
  if (q.isLoading || !q.data) return <Loading />;
  return <GrandSections g={q.data} />;
}
