"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { AiInsight, AiStockForecastPayload } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { formatBaseQty } from "@/lib/units";
import { Cards } from "@/components/admin/page";
import { ReportShell } from "@/components/admin/report-shell";
import { urgencyLabel, urgencyTone } from "@/components/admin/report-helpers";
import { Badge, Button, Card, CardBody, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

export default function AiStockForecastPage() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const q = useQuery({ queryKey: ["report", "ai_stock_forecast"], queryFn: () => api<AiInsight<AiStockForecastPayload>>("/reports/ai_stock_forecast") });
  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await api<AiInsight<AiStockForecastPayload>>("/reports/ai_stock_forecast", { query: { refresh: "true" } });
      qc.setQueryData(["report", "ai_stock_forecast"], fresh);
      toast.success("Forecast refreshed", `${fresh.payload.summary.critical} critical, ${fresh.payload.summary.soon} soon`);
    } catch (e) { toast.error("Could not refresh", errorMessage(e)); } finally { setRefreshing(false); }
  };
  const p = q.data?.payload;
  const rows = p?.rows ?? [];
  return (
    <ReportShell icon={Sparkles} title="AI Stock Forecast" description="AI Stock Forecast reads recent usage and says what will run out, when, and what to order to cover the coming week. Advisory only."
      loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      actions={<Button variant="soft" onClick={refresh} loading={refreshing}><RefreshCw className="h-4 w-4" /> Refresh forecast</Button>}
      exportData={{
        name: "ai-stock-forecast", landscape: true, subtitle: p ? `${p.lookback_days} days of usage, ${p.forecast_days} days ahead` : undefined,
        columns: [{ header: "Item", key: "name" }, { header: "SKU", key: "sku" }, { header: "Daily usage", key: "daily", align: "right" }, { header: "On hand", key: "on_hand", align: "right" }, { header: "Days left", key: "days_left", align: "right" }, { header: "Needed", key: "needed", align: "right" }, { header: "Order", key: "order_qty", align: "right" }, { header: "Est. cost", key: "cost", align: "right" }, { header: "Supplier", key: "supplier" }, { header: "Urgency", key: "urgency" }, { header: "Note", key: "note" }],
        rows: rows.map((r) => ({ name: r.item.name, sku: r.item.sku ?? "", daily: formatBaseQty(r.daily_usage, r.unit_code), on_hand: formatBaseQty(r.on_hand, r.unit_code), days_left: r.days_left ?? "", needed: formatBaseQty(r.needed, r.unit_code), order_qty: formatBaseQty(r.order_qty, r.unit_code), cost: formatMoney(r.est_cost_minor), supplier: r.supplier?.name ?? "", urgency: urgencyLabel(r.urgency), note: r.note })),
        footer: p ? [`${p.summary.items} items  |  ${p.summary.critical} critical  |  ${p.summary.soon} soon  |  Estimated order cost ${formatMoney(p.summary.est_cost_minor)}`] : undefined,
      }}>
      {q.data && p ? (
        <>
          <Card className="mb-6 border-info/40 bg-info-soft/40"><CardBody className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-secondary"><span>Usage over the last {p.lookback_days} days, forecast {p.forecast_days} days ahead with a safety margin. Generated {formatDateTime(q.data.generated_at)} by the {q.data.engine} engine.</span><Link href="/admin/inventory/demand" className="text-primary hover:underline">Turn this into purchase orders</Link></CardBody></Card>
          <Cards>
            <SummaryCard label="Items forecast" value={p.summary.items} sub="With usage in the lookback" tone="neutral" />
            <SummaryCard label="Critical" value={p.summary.critical} sub="Runs out within 2 days" tone={p.summary.critical ? "danger" : "neutral"} />
            <SummaryCard label="Soon" value={p.summary.soon} sub="Runs out inside the window" tone={p.summary.soon ? "warning" : "neutral"} />
            <SummaryCard label="Estimated order cost" value={formatMoney(p.summary.est_cost_minor)} sub="At the last purchase price" tone="primary" />
          </Cards>
          <Table>
            <THead><tr><TH>Item</TH><TH right>Daily usage</TH><TH right>On hand</TH><TH right>Days left</TH><TH right>Needed</TH><TH right>Order</TH><TH right>Est. cost</TH><TH>Supplier</TH><TH>Urgency</TH><TH>Note</TH></tr></THead>
            <TBody>
              {rows.length ? rows.map((r) => (
                <TR key={r.item.id}>
                  <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{r.item.sku}</span> : null}</TD>
                  <TD right className="text-fg-secondary">{formatBaseQty(r.daily_usage, r.unit_code)}</TD>
                  <TD right>{formatBaseQty(r.on_hand, r.unit_code)}</TD>
                  <TD right className={r.urgency === "critical" ? "font-medium text-danger" : ""}>{r.days_left ?? "-"}</TD>
                  <TD right className="text-fg-secondary">{formatBaseQty(r.needed, r.unit_code)}</TD>
                  <TD right className="font-medium">{formatBaseQty(r.order_qty, r.unit_code)}</TD>
                  <TD right>{formatMoney(r.est_cost_minor)}</TD>
                  <TD className="text-fg-secondary">{r.supplier?.name ?? "-"}</TD>
                  <TD><Badge variant={urgencyTone(r.urgency)}>{urgencyLabel(r.urgency)}</Badge></TD>
                  <TD className="max-w-xs text-xs text-fg-secondary">{r.note}</TD>
                </TR>
              )) : <EmptyRow colSpan={10}>Nothing to forecast: no stock was used in the lookback period</EmptyRow>}
            </TBody>
          </Table>
        </>
      ) : null}
    </ReportShell>
  );
}
