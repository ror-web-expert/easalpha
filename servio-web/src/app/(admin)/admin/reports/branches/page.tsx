"use client";
import { useState } from "react";
import { GitCompare } from "lucide-react";
import type { BranchCompare } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, ShareBar, useReport } from "@/components/admin/report-shell";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { BarsChart } from "@/components/charts/charts";

export default function BranchComparisonPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useReport<BranchCompare>("branches", range);
  const d = q.data;
  const rows = d?.rows ?? [];
  const chart = rows.map((r) => ({ branch: r.branch.code || r.branch.name, revenue: r.revenue_minor, gross_profit: r.gross_profit_minor }));
  return (
    <ReportShell icon={GitCompare} title="Branch comparison" description="A Servio extra: every outlet side by side for the period, with revenue share, voids, expenses, cost of goods and gross profit."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "branches", landscape: true,
        columns: [{ header: "Branch", key: "branch" }, { header: "Orders", key: "orders", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }, { header: "Share", key: "share", align: "right" }, { header: "Average order", key: "average", align: "right" }, { header: "Discounts", key: "discounts", align: "right" }, { header: "Voided", key: "voided", align: "right" }, { header: "On account", key: "khata", align: "right" }, { header: "Expenses", key: "expenses", align: "right" }, { header: "Cost of goods", key: "cogs", align: "right" }, { header: "Gross profit", key: "gross_profit", align: "right" }, { header: "By type", key: "by_type" }],
        rows: rows.map((r) => ({ branch: r.branch.name, orders: r.orders, revenue: formatMoney(r.revenue_minor), share: `${r.share_percent}%`, average: formatMoney(r.average_order_minor), discounts: formatMoney(r.discounts_minor), voided: `${r.voided} (${formatMoney(r.voided_minor)})`, khata: formatMoney(r.khata_minor), expenses: formatMoney(r.expenses_minor), cogs: formatMoney(r.cost_of_goods_minor), gross_profit: formatMoney(r.gross_profit_minor), by_type: Object.entries(r.by_type).map(([k, v]) => `${titleCase(k)} ${v}`).join(", ") })),
        footer: d ? [`${rows.length} branches  |  ${d.total_orders} orders  |  Revenue ${formatMoney(d.total_revenue_minor)}`] : undefined,
      }}>
      <Cards className="lg:grid-cols-3 xl:grid-cols-3">
        <SummaryCard label="Branches" value={rows.length} tone="info" />
        <SummaryCard label="Orders" value={d?.total_orders ?? 0} tone="primary" />
        <SummaryCard label="Revenue" value={formatMoney(d?.total_revenue_minor)} sub={rows[0] ? `Top: ${rows.slice().sort((a, b) => b.revenue_minor - a.revenue_minor)[0].branch.name}` : ""} tone="success" />
      </Cards>
      <Card className="mb-4"><CardHeader><CardTitle>Revenue and gross profit by branch (Rs)</CardTitle></CardHeader><CardBody><BarsChart data={chart} x="branch" series={[{ key: "revenue", label: "Revenue", money: true }, { key: "gross_profit", label: "Gross profit", money: true }]} money /></CardBody></Card>
      <Table>
        <THead><tr><TH>Branch</TH><TH right>Orders</TH><TH right>Revenue</TH><TH>Share</TH><TH right>Avg order</TH><TH right>Discounts</TH><TH right>Voided</TH><TH right>On account</TH><TH right>Expenses</TH><TH right>Cost of goods</TH><TH right>Gross profit</TH></tr></THead>
        <TBody>
          {rows.length ? rows.map((r) => (
            <TR key={r.branch.id}>
              <TD><div className="font-medium">{r.branch.name}{r.branch.is_main ? <Badge className="ml-2" variant="primary">main</Badge> : null}</div><div className="text-xs text-fg-secondary">{Object.entries(r.by_type).map(([k, v]) => `${titleCase(k)} ${v}`).join(" · ") || "-"}</div></TD>
              <TD right>{r.orders}</TD>
              <TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD>
              <TD><ShareBar percent={r.share_percent} /></TD>
              <TD right className="text-fg-secondary">{formatMoney(r.average_order_minor)}</TD>
              <TD right className="text-fg-secondary">{formatMoney(r.discounts_minor)}</TD>
              <TD right className={r.voided ? "text-danger" : "text-fg-muted"}>{r.voided} · {formatMoney(r.voided_minor)}</TD>
              <TD right className="text-fg-secondary">{formatMoney(r.khata_minor)}</TD>
              <TD right className="text-fg-secondary">{formatMoney(r.expenses_minor)}</TD>
              <TD right className="text-fg-secondary">{formatMoney(r.cost_of_goods_minor)}</TD>
              <TD right className={`font-medium ${r.gross_profit_minor < 0 ? "text-danger" : "text-success"}`}>{formatMoney(r.gross_profit_minor)}</TD>
            </TR>
          )) : <EmptyRow colSpan={11}>No active branches</EmptyRow>}
        </TBody>
      </Table>
    </ReportShell>
  );
}
