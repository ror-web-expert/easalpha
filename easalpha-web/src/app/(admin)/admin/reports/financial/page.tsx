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
import { marginTone, revenueLines, taxAndTips } from "@/components/admin/report-helpers";
import { Badge, Card, CardBody, CardHeader, CardTitle, SummaryCard } from "@/components/ui";

type Line = { section: string; line: string; amount: string };

export default function FinancialReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useQuery({ queryKey: ["finance", "profit_loss", range], queryFn: () => api<ProfitLoss>("/finance/profit_loss", { query: { from: range.from, to: range.to } }) });
  const p = q.data;
  const revenue = p ? revenueLines(p.revenue) : [];
  const beside = p ? taxAndTips(p.revenue) : [];
  const nb = p?.not_booked;
  const lines: Line[] = p && nb ? [
    ...revenue.map((l) => ({ section: "Revenue", line: l.label, amount: formatMoney(l.minor) })),
    ...beside.map((l) => ({ section: "Collected for others (not income)", line: l.label, amount: formatMoney(l.minor) })),
    { section: "Cost of goods", line: "Cost of goods sold", amount: formatMoney(-p.cost_of_goods_minor) },
    { section: "Gross profit", line: `Gross profit (${formatPercent(p.gross_margin_percent ?? 0)})`, amount: formatMoney(p.gross_profit_minor) },
    ...p.operating.expenses_by_category.map((c) => ({ section: "Operating expenses", line: `${c.category} (${c.count})`, amount: formatMoney(-c.amount_minor) })),
    { section: "Operating expenses", line: "Expenses", amount: formatMoney(-p.operating.expenses_minor) },
    { section: "Operating expenses", line: "Waste", amount: formatMoney(-p.operating.waste_minor) },
    { section: "Operating expenses", line: "Stock count and adjustment differences", amount: formatMoney(-p.operating.stock_differences_minor) },
    ...p.operating.other.map((o) => ({ section: "Other entries in the books", line: `${o.code} ${o.name}`, amount: formatMoney(-o.amount_minor) })),
    { section: "Operating expenses", line: "Total operating", amount: formatMoney(-p.operating.total_minor) },
    { section: "Net profit", line: `Net profit (${formatPercent(p.net_margin_percent ?? 0)})`, amount: formatMoney(p.net_profit_minor) },
    ...nb.overheads.map((o) => ({ section: "Not in the books", line: `Overhead: ${o.name}`, amount: formatMoney(-o.allocated_minor) })),
    { section: "Not in the books", line: "Staff commissions due", amount: formatMoney(-nb.commissions_minor) },
    { section: "Not in the books", line: "Aggregator commission", amount: formatMoney(-nb.aggregator_commission_minor) },
    { section: "Not in the books", line: "Net after these", amount: formatMoney(nb.net_after_minor) },
  ] : [];
  return (
    <ReportShell icon={Landmark} title="Financial" description="Revenue against costs and expenses: the profit and loss statement for the period, the books' own figure, with cost of goods from the stock ledger."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "financial",
        columns: [{ header: "Section", key: "section" }, { header: "Line", key: "line" }, { header: "Amount", key: "amount", align: "right" }],
        rows: lines,
        footer: p ? [`${p.orders} orders sold  |  Customers paid ${formatMoney(p.revenue.revenue_minor)}, of which tax ${formatMoney(p.revenue.tax_collected_minor)} and tips ${formatMoney(p.revenue.tips_minor)} (not income)`] : undefined,
      }}>
      {p && nb ? (
        <>
          <Cards>
            <SummaryCard label="Net sales" value={formatMoney(p.revenue.net_sales_minor)} sub={`${p.orders} orders sold`} tone="info" />
            <SummaryCard label="Gross profit" value={formatMoney(p.gross_profit_minor)} sub={<span className="inline-flex items-center gap-1">Margin <Badge variant={marginTone(p.gross_margin_percent)}>{p.gross_margin_percent === null ? "-" : formatPercent(p.gross_margin_percent)}</Badge></span>} tone="success" />
            <SummaryCard label="Operating expenses" value={formatMoney(p.operating.total_minor)} sub="Expenses, waste, stock differences, other entries" tone="warning" />
            <SummaryCard label="Net profit" value={formatMoney(p.net_profit_minor)} sub={<span className="inline-flex items-center gap-1">Margin <Badge variant={marginTone(p.net_margin_percent)}>{p.net_margin_percent === null ? "-" : formatPercent(p.net_margin_percent)}</Badge></span>} tone={p.net_profit_minor < 0 ? "danger" : "primary"} />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
              <CardBody>
                {revenue.map((l) => <StatementLine key={l.label} label={l.label} value={formatMoney(l.minor)} indent={l.indent} strong={l.strong} />)}
                {beside.map((l) => <StatementLine key={l.label} label={l.label} value={formatMoney(l.minor)} indent right={<Badge variant="outline">not income</Badge>} />)}
                <StatementLine label="Customers paid" value={formatMoney(p.revenue.revenue_minor)} strong />
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
                <StatementLine label="Waste" value={formatMoney(-p.operating.waste_minor)} indent />
                <StatementLine label="Stock count and adjustment differences" value={formatMoney(-p.operating.stock_differences_minor)} indent />
                {p.operating.other.length ? <p className="pt-2 text-xs text-fg-muted">Other entries in the books: drawer payouts, depreciation, adjustments, manual vouchers, and money booked on another day than its order</p> : null}
                {p.operating.other.map((o) => <StatementLine key={o.code} label={`${o.code} ${o.name}`} value={formatMoney(-o.amount_minor)} indent />)}
                <StatementLine label="Total operating" value={formatMoney(-p.operating.total_minor)} strong />
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Net profit</CardTitle><span className="text-sm text-fg-secondary">As the books hold it</span></CardHeader>
              <CardBody>
                <StatementLine label="Gross profit" value={formatMoney(p.gross_profit_minor)} />
                <StatementLine label="Operating expenses" value={formatMoney(-p.operating.total_minor)} indent />
                <StatementLine label="Net profit" value={formatMoney(p.net_profit_minor)} strong tone={p.net_profit_minor < 0 ? "danger" : "success"} right={<Badge variant={marginTone(p.net_margin_percent)}>{p.net_margin_percent === null ? "-" : formatPercent(p.net_margin_percent)}</Badge>} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Not in the books</CardTitle><span className="text-sm text-fg-secondary">Allocations and costs booked later</span></CardHeader>
              <CardBody>
                {nb.overheads.map((o) => <StatementLine key={o.id} label={`Overhead: ${o.name}`} value={formatMoney(-o.allocated_minor)} indent />)}
                <StatementLine label="Staff commissions due" value={formatMoney(-nb.commissions_minor)} indent right={<Badge variant="outline">booked with salaries</Badge>} />
                <StatementLine label="Aggregator commission" value={formatMoney(-nb.aggregator_commission_minor)} indent />
                <StatementLine label="Net after these" value={formatMoney(nb.net_after_minor)} strong tone={nb.net_after_minor < 0 ? "danger" : "success"} />
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
