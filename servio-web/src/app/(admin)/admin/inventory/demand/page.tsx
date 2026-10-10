"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ArrowLeftRight, ShoppingCart, AlertTriangle, PackageX, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import type { DemandBucket, DemandReport, Forecast } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatBaseQty } from "@/lib/units";
import { useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useSections, useStockCategories } from "@/components/admin/stock";
import { DEMAND_BUCKETS, demandBucketLabel, demandBucketVariant } from "@/components/admin/stockreport-helpers";
import { Badge, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type Tab = "demand" | "forecast";

export default function DemandPage() {
  const [tab, setTab] = useState<Tab>("demand");
  return (
    <>
      <PageHeader icon={TrendingUp} title="Demand" description="What to restock. Each item's stock is checked against its minimum and recent usage, what is already on order is subtracted, and the answer is split into what to transfer from another section and what to buy." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "demand", label: "Demand" }, { value: "forecast", label: "Forecast (Servio)" }]} className="mb-4 w-fit" />
      {tab === "demand" ? <DemandTab /> : <ForecastTab />}
    </>
  );
}

function DemandTab() {
  const [bucket, setBucket] = useState<DemandBucket>("all_needing");
  const [section, setSection] = useState("");
  const [category, setCategory] = useState("");
  const sections = useSections();
  const cats = useStockCategories();
  const dCategory = useDebounced(category, 300);
  const report = useQuery({ queryKey: ["stock_demand", { bucket, section, dCategory }], queryFn: () => api<DemandReport>("/stock/demand", { query: { bucket, section_id: section, category: dCategory } }) });
  const d = report.data;
  const bySection = !!section;
  return (
    <>
      <FilterBar>
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section"><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Input list="demand-categories" className="w-48" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" />
        <datalist id="demand-categories">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
        <Tabs value={bucket} onChange={setBucket} items={DEMAND_BUCKETS.map((b) => ({ value: b.value, label: b.label, count: b.value === "low" || b.value === "critical" || b.value === "out" ? d?.counts[b.value] : undefined }))} />
      </FilterBar>
      <Cards className="lg:grid-cols-5">
        <SummaryCard label="Low stock" value={d?.counts.low ?? 0} sub="Under the minimum" icon={TrendingDown} tone={d?.counts.low ? "info" : "neutral"} />
        <SummaryCard label="Critical" value={d?.counts.critical ?? 0} sub="Under half the minimum" icon={AlertTriangle} tone={d?.counts.critical ? "warning" : "neutral"} />
        <SummaryCard label="Out of stock" value={d?.counts.out ?? 0} sub="Nothing on hand" icon={PackageX} tone={d?.counts.out ? "danger" : "neutral"} />
        <SummaryCard label="Items to transfer" value={d?.transfer_count ?? 0} sub={bySection ? "Another section holds enough" : "Pick a section to see transfers"} icon={ArrowLeftRight} tone="info" />
        <SummaryCard label="Cost to buy" value={formatMoney(d?.buy_cost_minor)} sub="At average cost, after on-order stock" icon={ShoppingCart} tone="primary" />
      </Cards>
      {report.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH>Bucket</TH><TH right>On hand</TH><TH right>Minimum</TH><TH right>Daily usage</TH><TH right>Days left</TH><TH right>On order</TH><TH right>Transfer</TH><TH right>Buy</TH><TH right>Est. cost</TH></tr></THead>
          <TBody>
            {d?.rows.length ? d.rows.map((r) => {
              const transfer = Number(r.transfer_qty) > 0;
              const buy = Number(r.buy_qty) > 0;
              return (
                <TR key={r.item.id}>
                  <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{r.item.sku}</span> : null}{r.item.category ? <span className="ml-2 text-xs text-fg-muted">{r.item.category}</span> : null}</TD>
                  <TD><Badge variant={demandBucketVariant(r.bucket)}>{demandBucketLabel(r.bucket)}</Badge></TD>
                  <TD right className={r.bucket === "out" ? "font-medium text-danger" : r.bucket === "ok" ? "" : "font-medium text-warning"}>
                    {formatBaseQty(r.on_hand, r.unit_code)}
                    {bySection && r.total_on_hand !== r.on_hand ? <div className="text-xs font-normal text-fg-muted">{formatBaseQty(r.total_on_hand, r.unit_code)} in all sections</div> : null}
                  </TD>
                  <TD right className="text-fg-secondary">{Number(r.minimum) > 0 ? formatBaseQty(r.minimum, r.unit_code) : "-"}</TD>
                  <TD right className="text-fg-secondary">{Number(r.daily_usage) > 0 ? formatBaseQty(r.daily_usage, r.unit_code) : "-"}</TD>
                  <TD right className={r.days_left !== null && r.days_left < 3 ? "font-medium text-danger" : ""}>{r.days_left === null ? "-" : r.days_left > 999 ? "999+" : r.days_left}</TD>
                  <TD right className="text-fg-secondary">{Number(r.on_order) > 0 ? formatBaseQty(r.on_order, r.unit_code) : "-"}</TD>
                  <TD right className={transfer ? "font-medium text-info" : "text-fg-muted"}>{transfer ? formatBaseQty(r.transfer_qty, r.unit_code) : "-"}</TD>
                  <TD right className={buy ? "font-medium" : "text-fg-muted"}>{buy ? formatBaseQty(r.buy_qty, r.unit_code) : "-"}</TD>
                  <TD right className={buy ? "" : "text-fg-muted"}>{buy ? formatMoney(r.est_cost_minor) : "-"}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={10}>{bucket === "everything" ? "No items are in use. Sales with recipes and production create usage." : "Nothing needs stock in this bucket. Set minimums on items so Demand can flag them."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <p className="mt-2 text-xs text-fg-muted">Usage is the average over the last {d?.lookback_days ?? 14} days. Transfer appears only when a section is chosen and another section holds more than it needs.</p>
    </>
  );
}

/** Servio extra: the usage forecast that projects recent consumption forward and can be capped by a budget. */
function ForecastTab() {
  const [lookback, setLookback] = useState("30");
  const [days, setDays] = useState("7");
  const [safety, setSafety] = useState("10");
  const [budget, setBudget] = useState(0);
  const [category, setCategory] = useState("");
  const cats = useStockCategories();
  const q = useDebounced({ lookback_days: lookback, forecast_days: days, safety_percent: safety, budget_minor: budget || "", category }, 400);
  const forecast = useQuery({ queryKey: ["purchasing_forecast", q], queryFn: () => api<Forecast>("/purchasing/forecast", { query: q }) });
  const f = forecast.data;
  const toOrder = f?.rows.filter((r) => Number(r.order_qty) > 0) ?? [];
  return (
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
                  <TD>{r.supplier ? <Link href={`/admin/purchasing/purchase-orders/new?supplier_id=${r.supplier.id}`} className="text-primary hover:underline">{r.supplier.name}</Link> : <span className="text-fg-muted">-</span>}</TD>
                  <TD right>{formatMoney(r.est_cost_minor)}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={8}>No usage in the look-back period. Sales with recipes and production feed the forecast.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
