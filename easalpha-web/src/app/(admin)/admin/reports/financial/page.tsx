"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { api } from "@/lib/api";
import type { ProfitLoss } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, StatementLine } from "@/components/admin/report-shell";
import { marginTone } from "@/components/admin/report-helpers";
import { Badge, Card, CardBody, CardHeader, CardTitle, SummaryCard } from "@/components/ui";

type Line = { section: string; line: string; amount: string };

export default function FinancialReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useQuery({ queryKey: ["finance", "profit_loss", range], queryFn: () => api<ProfitLoss>("/finance/profit_loss", { query: { from: range.from, to: range.to } }) });
  const p = q.data;
  const lines: Line[] = p ? [
    { section: "Revenue", line: "Gross sales", amount: formatMoney(p.revenue.gross_sales_minor) },
    { section: "Revenue", line: "Discounts", amount: formatMoney(-p.revenue.discounts_minor) },
    { section: "Revenue", line: "Service charge", amount: formatMoney(p.revenue.service_charge_minor) },
    { section: "Revenue", line: "Delivery charge", amount: formatMoney(p.revenue.delivery_charge_minor) },
    { section: "Revenue", line: "Refunds", amount: formatMoney(-p.revenue.refunds_minor) },
    { section: "Revenue", line: "Net sales", amount: formatMoney(p.revenue.net_sales_minor) },
    { section: "Cost of goods", line: "Cost of goods sold", amount: formatMoney(-p.cost_of_goods_minor) },
    { section: "Gross profit", line: `Gross profit (${formatPercent(p.gross_margin_percent ?? 0)})`, amount: formatMoney(p.gross_profit_minor) },
    ...p.operating.expenses_by_category.map((c) => ({ section: "Operating expenses", line: `${c.category} (${c.count})`, amount: formatMoney(-c.amount_minor) })),
    { section: "Operating expenses", line: "Expenses", amount: formatMoney(-p.operating.expenses_minor) },
    ...p.operating.overheads.map((o) => ({ section: "Operating expenses", line: `Overhead: ${o.name}`, amount: formatMoney(-o.allocated_minor) })),
    { section: "Operating expenses", line: "Overheads", amount: formatMoney(-p.operating.overheads_minor) },
    { section: "Operating expenses", line: "Staff commissions", amount: formatMoney(-p.operating.commissions_minor) },
    { section: "Operating expenses", line: "Aggregator commission", amount: formatMoney(-p.operating.aggregator_commission_minor) },
    { section: "Operating expenses", line: "Waste", amount: formatMoney(-p.operating.waste_minor) },
    { section: "Operating expenses", line: "Total operating", amount: formatMoney(-p.operating.total_minor) },
    { section: "Net profit", line: `Net profit (${formatPercent(p.net_margin_percent ?? 0)})`, amount: formatMoney(p.net_profit_minor) },
  ] : [];
  return (
    <ReportShell icon={Landmark} title="Financial" description="Revenue against costs and expenses: the profit and loss statement for the period, with cost of goods from the stock ledger."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "financial",
        columns: [{ header: "Section", key: "section" }, { header: "Line", key: "line" }, { header: "Amount", key: "amount", align: "right" }],
        rows: lines,
        footer: p ? [`${p.orders} paid orders  |  Tax collected ${formatMoney(p.revenue.tax_collected_minor)} (not income)`] : undefined,
      }}>
      {p ? (
        <>
          <Cards>
            <SummaryCard label="Net sales" value={formatMoney(p.revenue.net_sales_minor)} sub={`${p.orders} paid orders`} tone="info" />
            <SummaryCard label="Gross profit" value={formatMoney(p.gross_profit_minor)} sub={<span className="inline-flex items-center gap-1">Margin <Badge variant={marginTone(p.gross_margin_percent)}>{p.gross_margin_percent === null ? "-" : formatPercent(p.gross_margin_percent)}</Badge></span>} tone="success" />
            <SummaryCard label="Operating expenses" value={formatMoney(p.operating.total_minor)} sub="Expenses, overheads, commissions, waste" tone="warning" />
            <SummaryCard label="Net profit" value={formatMoney(p.net_profit_minor)} sub={<span className="inline-flex items-center gap-1">Margin <Badge variant={marginTone(p.net_margin_percent)}>{p.net_margin_percent === null ? "-" : formatPercent(p.net_margin_percent)}</Badge></span>} tone={p.net_profit_minor < 0 ? "danger" : "primary"} />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
              <CardBody>
                <StatementLine label="Gross sales" value={formatMoney(p.revenue.gross_sales_minor)} />
                <StatementLine label="Discounts" value={formatMoney(-p.revenue.discounts_minor)} indent />
                <StatementLine label="Service charge" value={formatMoney(p.revenue.service_charge_minor)} indent />
                <StatementLine label="Delivery charge" value={formatMoney(p.revenue.delivery_charge_minor)} indent />
                <StatementLine label="Refunds" value={formatMoney(-p.revenue.refunds_minor)} indent />
                <StatementLine label="Net sales" value={formatMoney(p.revenue.net_sales_minor)} strong />
                <StatementLine label="Tax collected" value={formatMoney(p.revenue.tax_collected_minor)} indent right={<Badge variant="outline">not income</Badge>} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Cost of goods and gross profit</CardTitle></CardHeader>
              <CardBody>
                <StatementLine label="Net sales" value={formatMoney(p.revenue.net_sales_minor)} />
                <StatementLine label="Cost of goods sold" value={formatMoney(-p.cost_of_goods_minor)} indent />
                <StatementLine label="Gross profit" value={formatMoney(p.gross_profit_minor)} strong tone={p.gross_profit_minor < 0 ? "danger" : "success"} right={<Badge variant={marginTone(p.gross_margin_percent)}>{p.gross_margin_percent === null ? "-" : formatPercent(p.gross_margin_percent)}</Badge>} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Operating expenses</CardTitle><span className="text-sm text-fg-secondary">By category</span></CardHeader>
              <CardBody>
                {p.operating.expenses_by_category.map((c) => <StatementLine key={c.category} label={`${c.category}`} value={formatMoney(-c.amount_minor)} indent right={<span className="text-xs text-fg-muted">{c.count}</span>} />)}
                <StatementLine label="Expenses" value={formatMoney(-p.operating.expenses_minor)} strong />
                {p.operating.overheads.map((o) => <StatementLine key={o.id} label={o.name} value={formatMoney(-o.allocated_minor)} indent />)}
                <StatementLine label="Overheads" value={formatMoney(-p.operating.overheads_minor)} strong />
                <StatementLine label="Staff commissions" value={formatMoney(-p.operating.commissions_minor)} indent />
                <StatementLine label="Aggregator commission" value={formatMoney(-p.operating.aggregator_commission_minor)} indent />
                <StatementLine label="Waste" value={formatMoney(-p.operating.waste_minor)} indent />
                <StatementLine label="Total operating" value={formatMoney(-p.operating.total_minor)} strong />
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Net profit</CardTitle></CardHeader>
              <CardBody>
                <StatementLine label="Gross profit" value={formatMoney(p.gross_profit_minor)} />
                <StatementLine label="Operating expenses" value={formatMoney(-p.operating.total_minor)} indent />
                <StatementLine label="Net profit" value={formatMoney(p.net_profit_minor)} strong tone={p.net_profit_minor < 0 ? "danger" : "success"} right={<Badge variant={marginTone(p.net_margin_percent)}>{p.net_margin_percent === null ? "-" : formatPercent(p.net_margin_percent)}</Badge>} />
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
