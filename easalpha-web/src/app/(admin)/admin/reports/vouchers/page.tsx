"use client";
import { useState } from "react";
import { Ticket } from "lucide-react";
import type { VouchersReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { Badge, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const valueText = (b: VouchersReport["rows"][number]["batch"]) => b.value_kind === "percent" ? `${b.value}%` : formatMoney(b.value * 100);

export default function VouchersReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useReport<VouchersReport>("vouchers", range);
  const d = q.data;
  const rows = d?.rows ?? [];
  return (
    <ReportShell icon={Ticket} title="Vouchers" description="Voucher issue and redemption: per batch, how many were issued and redeemed in the period and what the redemptions cost."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "vouchers",
        columns: [{ header: "Batch", key: "name" }, { header: "Kind", key: "kind" }, { header: "Code", key: "code" }, { header: "Value", key: "value" }, { header: "Issued in period", key: "issued_in_period", align: "right" }, { header: "Issued total", key: "issued", align: "right" }, { header: "Redeemed in period", key: "redeemed_in_period", align: "right" }, { header: "Redeemed total", key: "redeemed_total", align: "right" }, { header: "Amount", key: "amount", align: "right" }, { header: "Status", key: "status" }],
        rows: rows.map((r) => ({ name: r.batch.name, kind: titleCase(r.batch.kind), code: r.batch.public_code ?? "", value: valueText(r.batch), issued_in_period: r.issued_in_period, issued: r.issued, redeemed_in_period: r.redeemed_in_period, redeemed_total: r.redeemed_total, amount: formatMoney(r.amount_minor), status: r.batch.expired ? "Expired" : r.batch.exhausted ? "Exhausted" : r.batch.active ? "Active" : "Inactive" })),
        footer: d ? [`Issued ${d.totals.issued}  |  Redeemed ${d.totals.redeemed}  |  Discount given ${formatMoney(d.totals.amount_minor)}`] : undefined,
      }}>
      <Cards className="lg:grid-cols-3 xl:grid-cols-3">
        <SummaryCard label="Issued" value={d?.totals.issued ?? 0} sub="Vouchers created in the period" tone="info" />
        <SummaryCard label="Redeemed" value={d?.totals.redeemed ?? 0} sub="On paid orders in the period" tone="success" />
        <SummaryCard label="Discount given" value={formatMoney(d?.totals.amount_minor)} tone="warning" />
      </Cards>
      <Table>
        <THead><tr><TH>Batch</TH><TH>Code</TH><TH>Value</TH><TH right>Issued in period</TH><TH right>Issued total</TH><TH right>Redeemed in period</TH><TH right>Redeemed total</TH><TH right>Amount</TH><TH>Status</TH></tr></THead>
        <TBody>
          {rows.length ? rows.map((r) => (
            <TR key={r.batch.id}>
              <TD><div className="font-medium">{r.batch.name}</div><div className="text-xs text-fg-secondary">{titleCase(r.batch.kind)}{r.batch.expires_on ? ` · expires ${formatDate(r.batch.expires_on)}` : ""}</div></TD>
              <TD className="font-mono text-fg-secondary">{r.batch.public_code ?? "-"}</TD>
              <TD>{valueText(r.batch)}</TD>
              <TD right>{r.issued_in_period}</TD>
              <TD right className="text-fg-secondary">{r.issued}</TD>
              <TD right className="font-medium">{r.redeemed_in_period}</TD>
              <TD right className="text-fg-secondary">{r.redeemed_total}</TD>
              <TD right className="font-medium">{formatMoney(r.amount_minor)}</TD>
              <TD>{r.batch.expired ? <Badge variant="neutral">Expired</Badge> : r.batch.exhausted ? <Badge variant="warning">Exhausted</Badge> : r.batch.active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
            </TR>
          )) : <EmptyRow colSpan={9}>No voucher batches yet. Create them under Settings, Vouchers.</EmptyRow>}
        </TBody>
      </Table>
    </ReportShell>
  );
}
