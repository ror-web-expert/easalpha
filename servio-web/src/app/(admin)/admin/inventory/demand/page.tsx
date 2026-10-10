"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Forecast, ReorderSuggestion } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatBaseQty } from "@/lib/units";
import { useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useStockCategories } from "@/components/admin/stock";
import { Badge, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type Tab = "suggestions" | "forecast";

export default function ReorderPage() {
  const [tab, setTab] = useState<Tab>("suggestions");
  const suggestions = useQuery({ queryKey: ["purchasing_suggestions"], queryFn: () => api<{ data: ReorderSuggestion[] }>("/purchasing/suggestions"), select: (r) => r.data });
  const [lookback, setLookback] = useState("30");
  const [days, setDays] = useState("7");
  const [safety, setSafety] = useState("10");
  const [budget, setBudget] = useState(0);
  const [category, setCategory] = useState("");
  const cats = useStockCategories();
  const q = useDebounced({ lookback_days: lookback, forecast_days: days, safety_percent: safety, budget_minor: budget || "", category }, 400);
  const forecast = useQuery({ queryKey: ["purchasing_forecast", q], queryFn: () => api<Forecast>("/purchasing/forecast", { query: q }), enabled: tab === "forecast" });
  const sTotal = suggestions.data?.reduce((a, r) => a + r.est_cost_minor, 0) ?? 0;
  const f = forecast.data;
  const toOrder = f?.rows.filter((r) => Number(r.order_qty) > 0) ?? [];
  return (
    <>
      <PageHeader icon={TrendingUp} title="Reorder and forecast" description="Suggestions come from minimum levels; the forecast projects recent usage forward and can be capped by a budget." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "suggestions", label: "Suggestions", count: suggestions.data?.length }, { value: "forecast", label: "Forecast" }]} className="mb-4 w-fit" />
      {tab === "suggestions" ? (
        <>
          <Cards>
            <SummaryCard label="Items below minimum" value={suggestions.data?.length ?? 0} tone={suggestions.data?.length ? "warning" : "success"} />
            <SummaryCard label="Estimated cost to restock" value={formatMoney(sTotal)} sub="At the last supplier price or average cost" tone="primary" />
          </Cards>
          {suggestions.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Item</TH><TH right>On hand</TH><TH right>Minimum</TH><TH right>Suggested</TH><TH>Last supplier</TH><TH right>Est. cost</TH></tr></THead>
              <TBody>
                {suggestions.data?.length ? suggestions.data.map((r) => (
                  <TR key={r.item.id}>
                    <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.category ? <span className="ml-2 text-xs text-fg-muted">{r.item.category}</span> : null}</TD>
                    <TD right className={Number(r.on_hand) <= 0 ? "font-medium text-danger" : "text-warning"}>{formatBaseQty(r.on_hand, r.unit_code)}</TD>
                    <TD right className="text-fg-secondary">{formatBaseQty(r.minimum, r.unit_code)}</TD>
                    <TD right className="font-medium">{formatBaseQty(r.suggested_qty, r.unit_code)}</TD>
                    <TD>{r.supplier ? <Link href={`/admin/purchasing/payables-aging/purchase-orders/new?supplier_id=${r.supplier.id}`} className="text-primary hover:underline">{r.supplier.name}</Link> : <span className="text-fg-muted">Never bought</span>}</TD>
                    <TD right>{formatMoney(r.est_cost_minor)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={6}>Nothing is below its minimum. Set minimums on stock items to get suggestions.</EmptyRow>}
              </TBody>
            </Table>
          )}
        </>
      ) : (
        <>
          <FilterBar className="items-end">
            <Field label="Look back (days)"><Input type="number" min={7} max={365} className="w-28 tabular" value={lookback} onChange={(e) => setLookback(e.target.value)} /></Field>
            <Field label="Forecast (days)"><Input type="number" min={1} max={90} className="w-28 tabular" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
            <Field label="Safety %"><Input type="number" min={0} className="w-24 tabular" value={safety} onChange={(e) => setSafety(e.target.value)} /></Field>
            <Field label="Budget" hint="0 = no cap"><MoneyInput className="w-36" value={budget} onChange={setBudget} /></Field>
            <Field label="Category"><Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All</option>{cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          </FilterBar>
          <Cards>
            <SummaryCard label="To order" value={toOrder.length} sub={`of ${f?.rows.length ?? 0} items with usage`} tone="primary" />
            <SummaryCard label="Estimated cost" value={formatMoney(f?.total_cost_minor)} sub={`${f?.forecast_days ?? days} days + ${formatPercent(Number(f?.safety_percent ?? safety), 0)} safety`} tone="info" />
            {f?.budget_minor ? <SummaryCard label="Within budget" value={formatMoney(f.within_budget_minor)} sub={`Budget ${formatMoney(f.budget_minor)} · ${f.rows.filter((r) => r.within_budget === false).length} items left out`} tone={f.total_cost_minor > f.budget_minor ? "warning" : "success"} /> : null}
          </Cards>
          {forecast.isLoading || !f ? <Loading /> : (
            <Table>
              <THead><tr><TH>Item</TH><TH right>Daily usage</TH><TH right>On hand</TH><TH right>Days left</TH><TH right>Needed</TH><TH right>Order</TH><TH>Last supplier</TH><TH right>Est. cost</TH></tr></THead>
              <TBody>
                {f.rows.length ? f.rows.map((r) => {
                  const out = r.within_budget === false;
                  return (
                    <TR key={r.item.id} className={out ? "opacity-50" : ""}>
                      <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{out ? <Badge className="ml-2" variant="warning">over budget</Badge> : null}</TD>
                      <TD right className="text-fg-secondary">{formatBaseQty(r.daily_usage, r.unit_code)}</TD>
                      <TD right>{formatBaseQty(r.on_hand, r.unit_code)}</TD>
                      <TD right className={r.days_left !== null && r.days_left < Number(days) ? "font-medium text-danger" : ""}>{r.days_left === null ? "-" : r.days_left > 999 ? "999+" : r.days_left}</TD>
                      <TD right className="text-fg-secondary">{formatBaseQty(r.needed, r.unit_code)}</TD>
                      <TD right className={Number(r.order_qty) > 0 ? "font-medium" : "text-fg-muted"}>{Number(r.order_qty) > 0 ? formatBaseQty(r.order_qty, r.unit_code) : "Enough"}</TD>
                      <TD>{r.supplier ? <Link href={`/admin/purchasing/payables-aging/purchase-orders/new?supplier_id=${r.supplier.id}`} className="text-primary hover:underline">{r.supplier.name}</Link> : <span className="text-fg-muted">-</span>}</TD>
                      <TD right>{formatMoney(r.est_cost_minor)}</TD>
                    </TR>
                  );
                }) : <EmptyRow colSpan={8}>No usage in the look-back period. Sales with recipes and production feed the forecast.</EmptyRow>}
              </TBody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
