"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { WasteReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDateTime, isoDay } from "@/lib/dates";
import { formatSignedQty } from "@/lib/units";
import { titleCase } from "@/lib/utils";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { ledgerKindVariant } from "@/components/admin/stock";
import { Badge, Button, Card, CardHeader, CardTitle, EmptyRow, Loading, SummaryCard, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function WastePage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const [groupBy, setGroupBy] = useState<"reason" | "item">("reason");
  const q = useQuery({ queryKey: ["stock_waste", range, groupBy], queryFn: () => api<WasteReport>("/stock/waste", { query: { from: range.from, to: range.to, group_by: groupBy } }) });
  const d = q.data;
  const wasteValue = d?.rows.reduce((a, r) => a + r.waste_value_minor, 0) ?? 0;
  const entries = d?.rows.reduce((a, r) => a + r.entries, 0) ?? 0;
  return (
    <>
      <PageHeader icon={Trash2} title="Waste and adjustments" description="Waste, adjustments and count differences in the period. Negative values are stock lost." actions={<Link href="/admin/stock/documents/new"><Button><Plus className="h-4 w-4" /> Record waste</Button></Link>} />
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Tabs value={groupBy} onChange={setGroupBy} items={[{ value: "reason", label: "By reason" }, { value: "item", label: "By item" }]} />
      </FilterBar>
      <Cards>
        <SummaryCard label="Waste value" value={formatMoney(wasteValue)} sub="Waste documents only" tone="danger" />
        <SummaryCard label="Net adjustments" value={formatMoney(d?.total_value_minor)} sub="Waste, adjustments and counts" tone="warning" />
        <SummaryCard label="Entries" value={entries} tone="neutral" />
      </Cards>
      {q.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{groupBy === "reason" ? "By reason" : "By item"}</CardTitle></CardHeader>
            <Table>
              <THead><tr><TH>{groupBy === "reason" ? "Reason" : "Item"}</TH><TH right>Entries</TH>{groupBy === "item" ? <TH right>Quantity</TH> : null}<TH right>Value</TH><TH right>Of which waste</TH></tr></THead>
              <TBody>
                {d?.rows.length ? d.rows.map((r) => (
                  <TR key={r.key}>
                    <TD className="font-medium">{r.key}</TD>
                    <TD right>{r.entries}</TD>
                    {groupBy === "item" ? <TD right className={Number(r.quantity) < 0 ? "text-danger" : ""}>{Number(r.quantity).toLocaleString("en-US", { maximumFractionDigits: 3 })}</TD> : null}
                    <TD right className={r.value_minor < 0 ? "text-danger" : ""}>{formatMoney(r.value_minor)}</TD>
                    <TD right className="text-fg-secondary">{r.waste_value_minor ? formatMoney(r.waste_value_minor) : "-"}</TD>
                  </TR>
                )) : <EmptyRow colSpan={groupBy === "item" ? 5 : 4}>No waste or adjustments in this range.</EmptyRow>}
              </TBody>
            </Table>
            {groupBy === "item" ? <p className="px-4 py-2 text-xs text-fg-muted">Quantities are in each item&apos;s base unit.</p> : null}
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Entries</CardTitle><span className="text-sm text-fg-secondary">Latest {d?.entries.length ?? 0}</span></CardHeader>
            <Table>
              <THead><tr><TH>When</TH><TH>Kind</TH><TH>Item</TH><TH>Section</TH><TH right>Change</TH><TH right>Value</TH><TH>Reason</TH></tr></THead>
              <TBody>
                {d?.entries.length ? d.entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(e.occurred_at)}</TD>
                    <TD><Badge variant={ledgerKindVariant(e.kind)}>{titleCase(e.kind)}</Badge></TD>
                    <TD><Link href={`/admin/stock/items/${e.stock_item_id}`} className="font-medium text-primary hover:underline">{e.item_name}</Link></TD>
                    <TD className="text-fg-secondary">{e.section_name ?? "-"}</TD>
                    <TD right className={Number(e.quantity) < 0 ? "text-danger" : "text-success"}>{formatSignedQty(e.quantity, e.unit_code)}</TD>
                    <TD right>{formatMoney(e.value_minor)}</TD>
                    <TD className="text-fg-secondary">{e.reason ?? ""}{e.ref_table === "stock_documents" && e.ref_id ? <Link href={`/admin/stock/documents/${e.ref_id}`} className="ml-1 text-primary hover:underline">document</Link> : null}</TD>
                  </TR>
                )) : <EmptyRow colSpan={7}>Nothing recorded.</EmptyRow>}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
