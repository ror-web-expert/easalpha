"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { AiInsight, AiPricingPayload } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Cards } from "@/components/admin/page";
import { ReportShell } from "@/components/admin/report-shell";
import { marginTone, suggestionLabel, suggestionTone } from "@/components/admin/report-helpers";
import { Badge, Button, Card, CardBody, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

export default function AiPricingPage() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const q = useQuery({ queryKey: ["report", "ai_pricing"], queryFn: () => api<AiInsight<AiPricingPayload>>("/reports/ai_pricing") });
  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await api<AiInsight<AiPricingPayload>>("/reports/ai_pricing", { query: { refresh: "true" } });
      qc.setQueryData(["report", "ai_pricing"], fresh);
      toast.success("Analysis refreshed", `${fresh.payload.summary.flagged} items flagged`);
    } catch (e) { toast.error("Could not refresh", errorMessage(e)); } finally { setRefreshing(false); }
  };
  const p = q.data?.payload;
  const rows = p?.rows ?? [];
  return (
    <ReportShell icon={Sparkles} title="AI Pricing" description="AI Pricing Analysis reads a period's sales and suggests underpriced items and revenue opportunities. Advisory only; nothing changes until you edit the price."
      loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      actions={<Button variant="soft" onClick={refresh} loading={refreshing}><RefreshCw className="h-4 w-4" /> Refresh analysis</Button>}
      exportData={{
        name: "ai-pricing", landscape: true, subtitle: p ? `Sales ${formatDate(p.from)} to ${formatDate(p.to)}` : undefined,
        columns: [{ header: "Item", key: "name" }, { header: "Sold", key: "quantity", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }, { header: "Share", key: "share", align: "right" }, { header: "Price", key: "price", align: "right" }, { header: "Cost", key: "cost", align: "right" }, { header: "Margin", key: "margin", align: "right" }, { header: "Discounted", key: "discount", align: "right" }, { header: "Suggestion", key: "suggestion" }, { header: "Suggested price", key: "suggested", align: "right" }, { header: "Reason", key: "reason" }],
        rows: rows.map((r) => ({ name: r.name, quantity: r.quantity, revenue: formatMoney(r.revenue_minor), share: `${r.revenue_share}%`, price: formatMoney(r.price_minor), cost: r.cost_minor === null ? "" : formatMoney(r.cost_minor), margin: r.margin_percent === null ? "" : formatPercent(r.margin_percent), discount: formatMoney(r.discount_minor), suggestion: suggestionLabel(r.suggestion), suggested: r.suggested_price_minor ? formatMoney(r.suggested_price_minor) : "", reason: r.reason ?? "" })),
        footer: p ? [`${p.summary.items_reviewed} items reviewed  |  ${p.summary.flagged} flagged  |  Underpriced ${p.summary.underpriced}  |  Promote ${p.summary.promote}  |  Review cost ${p.summary.review_cost}  |  Revenue opportunity ${formatMoney(p.summary.revenue_opportunity_minor)}`] : undefined,
      }}>
      {q.data && p ? (
        <>
          <Card className="mb-6 border-info/40 bg-info-soft/40"><CardBody className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-secondary"><span>Based on sales from {formatDate(p.from)} to {formatDate(p.to)}. Generated {formatDateTime(q.data.generated_at)} by the {q.data.engine} engine.</span><span>Margins use the recipe cost; items without a recipe are flagged for a cost review.</span></CardBody></Card>
          <Cards className="xl:grid-cols-5">
            <SummaryCard label="Items reviewed" value={p.summary.items_reviewed} sub={`${p.summary.flagged} flagged`} tone="neutral" />
            <SummaryCard label="Underpriced" value={p.summary.underpriced} sub="Raise price" tone="success" />
            <SummaryCard label="Promote" value={p.summary.promote} sub="Strong margin, little volume" tone="info" />
            <SummaryCard label="Review cost" value={p.summary.review_cost} sub="No recipe or selling at a loss" tone="warning" />
            <SummaryCard label="Revenue opportunity" value={formatMoney(p.summary.revenue_opportunity_minor)} sub="If suggested prices had applied" tone="primary" />
          </Cards>
          <Table>
            <THead><tr><TH>Item</TH><TH right>Sold</TH><TH right>Revenue</TH><TH right>Share</TH><TH right>Price</TH><TH right>Cost</TH><TH right>Margin</TH><TH right>Discounted</TH><TH>Suggestion</TH><TH right>Suggested price</TH><TH>Reason</TH></tr></THead>
            <TBody>
              {rows.length ? rows.map((r, i) => (
                <TR key={r.product_id ?? i}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD right>{r.quantity}</TD>
                  <TD right>{formatMoney(r.revenue_minor)}</TD>
                  <TD right className="text-fg-secondary">{r.revenue_share}%</TD>
                  <TD right>{formatMoney(r.price_minor)}</TD>
                  <TD right className="text-fg-secondary">{r.cost_minor === null ? "-" : formatMoney(r.cost_minor)}</TD>
                  <TD right>{r.margin_percent === null ? <Badge variant="neutral">unknown</Badge> : <Badge variant={marginTone(r.margin_percent)}>{formatPercent(r.margin_percent)}</Badge>}</TD>
                  <TD right className="text-fg-secondary">{r.discount_minor ? formatMoney(r.discount_minor) : "-"}</TD>
                  <TD><Badge variant={suggestionTone(r.suggestion)}>{suggestionLabel(r.suggestion)}</Badge></TD>
                  <TD right className="font-medium">{r.suggested_price_minor ? formatMoney(r.suggested_price_minor) : "-"}</TD>
                  <TD className="max-w-xs text-xs text-fg-secondary">{r.reason ?? "-"}</TD>
                </TR>
              )) : <EmptyRow colSpan={11}>Nothing to flag: every item reviewed looks priced sensibly</EmptyRow>}
            </TBody>
          </Table>
        </>
      ) : null}
    </ReportShell>
  );
}
