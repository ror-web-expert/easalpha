"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import type { DailySheet } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { formatBaseQty, formatSignedQty } from "@/lib/units";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useSections } from "@/components/admin/stock";
import { EmptyRow, Input, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";

function Qty({ v, code, signed }: { v: string; code: string; signed?: boolean }) {
  const n = Number(v);
  if (n === 0) return <span className="text-fg-muted">-</span>;
  return <span className={cn(signed && n < 0 && "text-danger", signed && n > 0 && "text-success")}>{signed ? formatSignedQty(v, code) : formatBaseQty(v, code)}</span>;
}

export default function DailySheetPage() {
  const sections = useSections();
  const [section, setSection] = useState("");
  const [day, setDay] = useState(isoDay());
  const sectionId = section || sections.data?.find((s) => s.is_default)?.id || sections.data?.[0]?.id || "";
  const q = useQuery({ queryKey: ["daily_sheet", sectionId, day], queryFn: () => api<DailySheet>("/stock/daily_sheet", { query: { section_id: sectionId, business_day: day } }), enabled: !!sectionId });
  const d = q.data;
  const totals = d?.rows.reduce((a, r) => ({ in: a.in + Number(r.in), out: a.out + Number(r.out), waste: a.waste + Number(r.waste), sale: a.sale + Number(r.sale) }), { in: 0, out: 0, waste: 0, sale: 0 });
  return (
    <>
      <PageHeader icon={ClipboardList} title="Daily stock sheet" description="Opening, movements and closing per item for one section and business day. Closing = opening + in - out - waste - sale ± adjusted." />
      <FilterBar>
        <Select className="w-auto" value={sectionId} onChange={(e) => setSection(e.target.value)}>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Business day" />
      </FilterBar>
      <Cards>
        <SummaryCard label="Closing value" value={formatMoney(d?.closing_value_minor)} sub={d ? `${d.section.name} · ${formatDate(d.business_day)}` : undefined} />
        <SummaryCard label="Items on sheet" value={d?.rows.length ?? 0} tone="neutral" />
        <SummaryCard label="Items with waste" value={d?.rows.filter((r) => Number(r.waste) !== 0).length ?? 0} tone={totals?.waste ? "danger" : "neutral"} />
        <SummaryCard label="Items sold from" value={d?.rows.filter((r) => Number(r.sale) !== 0).length ?? 0} tone="info" />
      </Cards>
      {q.isLoading || !sectionId ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH right>Opening</TH><TH right>In</TH><TH right>Out</TH><TH right>Waste</TH><TH right>Sale</TH><TH right>Adjusted</TH><TH right>Closing</TH><TH right>Value</TH></tr></THead>
          <TBody>
            {d?.rows.length ? d.rows.map((r) => {
              const code = r.item.base_unit.code;
              return (
                <TR key={r.item.id}>
                  <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{r.item.sku}</span> : null}</TD>
                  <TD right className="text-fg-secondary">{formatBaseQty(r.opening, code)}</TD>
                  <TD right><Qty v={r.in} code={code} signed /></TD>
                  <TD right><Qty v={r.out} code={code} signed /></TD>
                  <TD right><Qty v={r.waste} code={code} signed /></TD>
                  <TD right><Qty v={r.sale} code={code} signed /></TD>
                  <TD right><Qty v={r.adjusted} code={code} signed /></TD>
                  <TD right className={cn("font-medium", Number(r.closing) < 0 && "text-danger")}>{formatBaseQty(r.closing, code)}</TD>
                  <TD right>{formatMoney(r.closing_value_minor)}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={9}>No stock movements for this section up to {formatDate(day)}.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
