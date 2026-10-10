"use client";
// SPEC Rider Reports (Riders group) and Delivery Riders (Reports group) are the same report in two places: deliveries
// and charges per rider over a period, assigned against completed, failed, cash collected and minutes to deliver.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { RiderReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { lifetimeLabel } from "@/components/admin/riders-helpers";
import { Badge, Button, EmptyRow, ErrorState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const PDF_COLUMNS = [
  { header: "Rider", key: "rider" }, { header: "Assigned", key: "assigned", align: "right" as const }, { header: "Completed", key: "completed", align: "right" as const }, { header: "Failed", key: "failed", align: "right" as const },
  { header: "Open", key: "open", align: "right" as const }, { header: "Charges", key: "charges", align: "right" as const }, { header: "Rider pay", key: "pay", align: "right" as const }, { header: "Cash collected", key: "cash", align: "right" as const },
  { header: "Order value", key: "value", align: "right" as const }, { header: "Avg min", key: "avg", align: "right" as const }, { header: "Float", key: "float", align: "right" as const },
];

export function RidersReport({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  const [range, setRange] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const q = useQuery({ queryKey: ["reports_riders", range], queryFn: () => api<RiderReport>("/reports/riders", { query: { from: range.from, to: range.to } }) });
  const r = q.data;
  const rows = r?.rows ?? [];
  const exportPdf = () => {
    if (!r) return;
    exportTablePdf({
      title, subtitle: `${range.from} to ${range.to}`, columns: PDF_COLUMNS, landscape: true, filename: `delivery-riders-${range.from}-${range.to}.pdf`,
      rows: rows.map((x) => ({ rider: x.rider.name + (x.temporary ? " (temporary)" : ""), assigned: x.assigned, completed: x.completed, failed: x.failed, open: x.open, charges: formatMoney(x.charges_minor), pay: formatMoney(x.rider_pay_minor), cash: formatMoney(x.cash_collected_minor), value: formatMoney(x.order_value_minor), avg: x.avg_minutes ?? "", float: formatMoney(x.float_minor) })),
      footer: [`Riders ${r.totals.riders} (${r.totals.temporary_riders} temporary)  |  Assigned ${r.totals.assigned}  |  Completed ${r.totals.completed}  |  Failed ${r.totals.failed}`, `Charges ${formatMoney(r.totals.charges_minor)}  |  Rider pay ${formatMoney(r.totals.rider_pay_minor)}  |  Cash collected ${formatMoney(r.totals.cash_collected_minor)}`],
    });
  };
  return (
    <>
      <PageHeader icon={icon} title={title} description={description} actions={<Button variant="secondary" onClick={exportPdf} disabled={!rows.length}><FileDown className="h-4 w-4" /> PDF</Button>} />
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      <Cards>
        <SummaryCard label="Assigned" value={r?.totals.assigned ?? 0} sub={`${r?.totals.riders ?? 0} riders, ${r?.totals.temporary_riders ?? 0} temporary`} tone="info" />
        <SummaryCard label="Completed" value={r?.totals.completed ?? 0} sub={r && r.totals.assigned ? `${Math.round((r.totals.completed / r.totals.assigned) * 100)}% of assigned` : "No deliveries"} tone="success" />
        <SummaryCard label="Failed" value={r?.totals.failed ?? 0} tone={r?.totals.failed ? "danger" : "neutral"} />
        <SummaryCard label="Delivery charges" value={formatMoney(r?.totals.charges_minor ?? 0)} sub="Charged to customers" tone="primary" />
        <SummaryCard label="Rider pay" value={formatMoney(r?.totals.rider_pay_minor ?? 0)} sub="Completed deliveries times each rider's charge" tone="warning" />
        <SummaryCard label="Cash collected" value={formatMoney(r?.totals.cash_collected_minor ?? 0)} sub="Cash on delivery taken by riders" tone="neutral" />
      </Cards>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message="Could not load the rider report" onRetry={() => q.refetch()} /> : (
        <Table>
          <THead><tr><TH>Rider</TH><TH right>Assigned</TH><TH right>Completed</TH><TH right>Failed</TH><TH right>Open</TH><TH right>Charges</TH><TH right>Rider pay</TH><TH right>Cash collected</TH><TH right>Order value</TH><TH right>Avg minutes</TH><TH right>Float now</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((x) => (
              <TR key={x.rider.id}>
                <TD><div className="font-medium">{x.rider.name}</div>{x.temporary ? <Badge variant="outline">Temporary · {x.rider.lifetime_label ?? lifetimeLabel(x.rider.lifetime_kind, x.rider.lifetime_value)}</Badge> : <div className="text-xs text-fg-muted">{x.rider.phone ?? ""}</div>}</TD>
                <TD right>{x.assigned}</TD>
                <TD right className="font-medium">{x.completed}</TD>
                <TD right className={x.failed ? "text-danger" : "text-fg-muted"}>{x.failed}</TD>
                <TD right className={x.open ? "" : "text-fg-muted"}>{x.open}</TD>
                <TD right>{formatMoney(x.charges_minor)}</TD>
                <TD right>{formatMoney(x.rider_pay_minor)}</TD>
                <TD right>{formatMoney(x.cash_collected_minor)}</TD>
                <TD right className="text-fg-secondary">{formatMoney(x.order_value_minor)}</TD>
                <TD right className="text-fg-secondary">{x.avg_minutes ?? "-"}</TD>
                <TD right className={x.float_minor ? "font-medium" : "text-fg-muted"}>{formatMoney(x.float_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={11}>No deliveries were assigned to riders in this period.</EmptyRow>}
          </TBody>
          {rows.length && r ? (
            <tfoot><tr className="border-t bg-muted/40 font-medium"><TD>Total</TD><TD right>{r.totals.assigned}</TD><TD right>{r.totals.completed}</TD><TD right>{r.totals.failed}</TD><TD right>{rows.reduce((a, x) => a + x.open, 0)}</TD><TD right>{formatMoney(r.totals.charges_minor)}</TD><TD right>{formatMoney(r.totals.rider_pay_minor)}</TD><TD right>{formatMoney(r.totals.cash_collected_minor)}</TD><TD right>{formatMoney(rows.reduce((a, x) => a + x.order_value_minor, 0))}</TD><TD right>-</TD><TD right>{formatMoney(rows.reduce((a, x) => a + x.float_minor, 0))}</TD></tr></tfoot>
          ) : null}
        </Table>
      )}
    </>
  );
}
