"use client";
import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import type { GrandReportFull } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, ShareBar, useReport } from "@/components/admin/report-shell";
import { GrandSections } from "@/components/admin/report-sections";
import { methodTotalsText } from "@/components/admin/report-helpers";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function GrandReportPage() {
  const [range, setRange] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const q = useReport<GrandReportFull>("grand", range);
  const g = q.data;
  const s = g?.spec;
  const methods = s?.methods ?? [];
  const exportRows = [
    ...methods.map((m) => ({ line: titleCase(m.method), count: m.count, amount: formatMoney(m.amount_minor), share: `${m.share_percent}%` })),
    ...(s ? [
      { line: "Unpaid", count: s.unpaid.count, amount: formatMoney(s.unpaid.amount_minor), share: `${s.unpaid.share_percent}%` },
      { line: "Complimentary", count: s.complimentary.count, amount: formatMoney(s.complimentary.amount_minor), share: `${s.complimentary.share_percent}%` },
      { line: "Account receipts", count: s.account_receipts.count, amount: formatMoney(s.account_receipts.amount_minor), share: methodTotalsText(s.account_receipts.by_method) },
    ] : []),
  ];
  return (
    <ReportShell icon={FileSpreadsheet} title="Grand Report" description="Sales split by every payment method with counts and share, Unpaid and Complimentary as a share of sales, plus payments received against customer accounts."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "grand-report",
        columns: [{ header: "Line", key: "line" }, { header: "Count", key: "count", align: "right" }, { header: "Amount", key: "amount", align: "right" }, { header: "Share of sales", key: "share", align: "right" }],
        rows: exportRows,
        footer: s ? [`Sales ${formatMoney(s.sales_minor)}  |  ${s.orders} paid orders  |  Payments by method ${formatMoney(s.methods_total_minor)}  |  On account ${formatMoney(s.on_account_minor)}`] : undefined,
      }}>
      {g && s ? (
        <div className="space-y-4">
          <Cards>
            <SummaryCard label="Sales" value={formatMoney(s.sales_minor)} sub={`${s.orders} paid orders`} tone="success" />
            <SummaryCard label="Orders" value={s.orders} sub="Paid, closed or refunded" tone="info" />
            <SummaryCard label="Payments by method" value={formatMoney(s.methods_total_minor)} sub={`${methods.length} methods used`} tone="primary" />
            <SummaryCard label="On account" value={formatMoney(s.on_account_minor)} sub="Charged to customer khata" tone={s.on_account_minor ? "warning" : "neutral"} />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader><CardTitle>Payment methods</CardTitle><span className="text-sm text-fg-secondary">Share is of sales</span></CardHeader>
              <Table>
                <THead><tr><TH>Method</TH><TH right>Count</TH><TH right>Amount</TH><TH>Share</TH></tr></THead>
                <TBody>
                  {methods.length ? methods.map((m) => (
                    <TR key={m.method}><TD className="font-medium">{titleCase(m.method)}</TD><TD right>{m.count}</TD><TD right className="font-medium">{formatMoney(m.amount_minor)}</TD><TD><ShareBar percent={m.share_percent} /></TD></TR>
                  )) : <EmptyRow colSpan={4}>No payments in this period</EmptyRow>}
                </TBody>
                {methods.length ? <tfoot><tr className="border-t bg-muted/40 font-medium"><TD>Total</TD><TD right>{methods.reduce((a, m) => a + m.count, 0)}</TD><TD right>{formatMoney(s.methods_total_minor)}</TD><TD><ShareBar percent={s.sales_minor ? (s.methods_total_minor * 100) / s.sales_minor : 0} /></TD></tr></tfoot> : null}
              </Table>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Unpaid</CardTitle><Badge variant={s.unpaid.count ? "warning" : "neutral"}>{s.unpaid.count} orders</Badge></CardHeader>
                <CardBody><div className="text-2xl tabular">{formatMoney(s.unpaid.amount_minor)}</div><div className="mt-2 flex items-center justify-between text-xs text-fg-secondary"><span>Share of sales</span></div><ShareBar percent={s.unpaid.share_percent} className="mt-1" /></CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Complimentary</CardTitle><Badge variant={s.complimentary.count ? "info" : "neutral"}>{s.complimentary.count} orders</Badge></CardHeader>
                <CardBody><div className="text-2xl tabular">{formatMoney(s.complimentary.amount_minor)}</div><div className="mt-2 text-xs text-fg-secondary">Staff meals at list price, share of sales</div><ShareBar percent={s.complimentary.share_percent} className="mt-1" /></CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Account receipts</CardTitle><Badge variant="outline">{s.account_receipts.count} received</Badge></CardHeader>
                <CardBody>
                  <div className="text-2xl tabular">{formatMoney(s.account_receipts.amount_minor)}</div>
                  <div className="mt-2 text-xs text-fg-secondary">Payments received against customer accounts</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(s.account_receipts.by_method).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Badge key={k} variant="outline">{titleCase(k)} {formatMoney(v)}</Badge>)}
                    {!Object.keys(s.account_receipts.by_method).length ? <span className="text-xs text-fg-muted">None in this period</span> : null}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
          <GrandSections g={g} heading={false} />
        </div>
      ) : null}
    </ReportShell>
  );
}
