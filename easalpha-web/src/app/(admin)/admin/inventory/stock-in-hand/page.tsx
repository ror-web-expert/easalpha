"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Boxes, AlertTriangle, TrendingDown, Plus, Package, Warehouse } from "lucide-react";
import { api } from "@/lib/api";
import type { StockLevelsReport, StockValuationRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatBaseQty, formatUnitCost } from "@/lib/units";
import { useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, PageHeader, SearchInput } from "@/components/admin/page";
import { sectionName, useSections } from "@/components/admin/stock";
import { stockStatusLabel } from "@/components/admin/stockreport-helpers";
import { Badge, Button, Checkbox, EmptyRow, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function StockOverviewPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [section, setSection] = useState("");
  const [low, setLow] = useState(false);
  const sections = useSections();
  const levels = useQuery({ queryKey: ["stock_levels", { section, dq, low }], queryFn: () => api<StockLevelsReport>("/stock/levels", { query: { section_id: section, q: dq, low: low ? "true" : "" } }) });
  const valuation = useQuery({ queryKey: ["stock_valuation"], queryFn: () => api<{ data: StockValuationRow[] }>("/stock/valuation"), select: (r) => r.data });
  const d = levels.data;
  return (
    <>
      <PageHeader icon={Boxes} title="Stock in Hand" description="On-hand quantities and value per section. Sales deduct stock automatically; receive, move, waste and count with documents. Negative stock is permitted and shown as short." actions={<>
        <Link href="/admin/inventory/items"><Button variant="secondary"><Package className="h-4 w-4" /> Items</Button></Link>
        <Link href="/admin/inventory/stock-actions/new"><Button><Plus className="h-4 w-4" /> New document</Button></Link>
      </>} />
      <Cards>
        <SummaryCard label="Total stock value" value={formatMoney(d?.total_value_minor)} sub={`${d?.rows.length ?? 0} items`} icon={Boxes} />
        <SummaryCard label="Below minimum" value={d?.below_minimum_count ?? 0} sub="Items under their minimum" icon={TrendingDown} tone={d?.below_minimum_count ? "warning" : "neutral"} />
        <SummaryCard label="Short" value={d?.negative_count ?? 0} sub="Below zero; count or adjust these" icon={AlertTriangle} tone={d?.negative_count ? "danger" : "neutral"} />
        {valuation.data?.map((v) => (
          <SummaryCard key={v.section.id} label={`${v.section.name} value`} value={formatMoney(v.value_minor)} sub={`${v.items} items with stock`} icon={Warehouse} tone="info" />
        ))}
      </Cards>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, SKU, category" />
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)}><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Checkbox label="Low only" checked={low} onChange={(e) => setLow(e.target.checked)} />
      </FilterBar>
      {levels.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH>Category</TH><TH right>On hand</TH><TH>By section</TH><TH right>Minimum</TH><TH right>Avg cost</TH><TH right>Value</TH><TH>Status</TH></tr></THead>
          <TBody>
            {d?.rows.length ? d.rows.map((r) => {
              const code = r.item.base_unit.code;
              const status = stockStatusLabel(r);
              return (
                <TR key={r.item.id}>
                  <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{r.item.sku}</span> : null}</TD>
                  <TD className="text-fg-secondary">{r.item.category ?? "-"}</TD>
                  <TD right className={r.negative ? "font-medium text-danger" : r.below_minimum ? "font-medium text-warning" : "font-medium"}>{formatBaseQty(r.quantity, code)}</TD>
                  <TD className="text-xs text-fg-secondary">{r.sections.length ? r.sections.map((s) => <span key={s.section_id} className="mr-3 whitespace-nowrap">{sectionName(sections.data, s.section_id)}: <span className="tabular">{formatBaseQty(s.quantity, code)}</span></span>) : "-"}</TD>
                  <TD right className="text-fg-secondary">{Number(r.item.minimum_qty) > 0 ? formatBaseQty(r.item.minimum_qty, code) : "-"}</TD>
                  <TD right className="text-fg-secondary">{formatUnitCost(r.item.avg_cost_minor_per_base, code, formatMoney)}</TD>
                  <TD right>{formatMoney(r.value_minor)}</TD>
                  <TD><Badge variant={status.variant}>{status.label}</Badge></TD>
                </TR>
              );
            }) : <EmptyRow colSpan={8}>{low ? "Nothing is low or short." : "No stock items yet. Add items or import a CSV."}</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
