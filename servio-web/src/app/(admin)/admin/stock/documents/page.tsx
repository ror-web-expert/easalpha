"use client";
import { useState } from "react";
import Link from "next/link";
import { FileStack, Plus } from "lucide-react";
import type { StockDocument } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { DOC_KINDS, docKindVariant, docStatusVariant, KIND_LABELS, sectionName, useSections } from "@/components/admin/stock";
import { Badge, Button, EmptyRow, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function StockDocumentsPage() {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const sections = useSections();
  const list = usePagedList<StockDocument>(["stock_documents"], "/stock_documents", { kind, status, section_id: section, from, to });
  return (
    <>
      <PageHeader icon={FileStack} title="Stock documents" description="Receipts, transfers, waste, adjustments, counts and supplier returns. Drafts can be edited; posted documents are cancelled with reversing entries." actions={<Link href="/admin/stock/documents/new"><Button><Plus className="h-4 w-4" /> New document</Button></Link>} />
      <FilterBar>
        <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}<option value="production">Production</option></Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option></Select>
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)}><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="text-xs text-fg-muted">to</span>
        <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Document</TH><TH>Kind</TH><TH>Status</TH><TH>From</TH><TH>To</TH><TH>Day</TH><TH right>Lines</TH><TH right>Cost</TH><TH>Reason / ref</TH><TH>Created</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((d) => (
              <TR key={d.id}>
                <TD><Link href={`/admin/stock/documents/${d.id}`} className="font-mono font-medium text-primary hover:underline">{d.label}</Link></TD>
                <TD><Badge variant={docKindVariant(d.kind)}>{KIND_LABELS[d.kind] ?? d.kind}</Badge></TD>
                <TD><Badge variant={docStatusVariant(d.status)}>{d.status}</Badge></TD>
                <TD className="text-fg-secondary">{sectionName(sections.data, d.from_section_id)}</TD>
                <TD className="text-fg-secondary">{sectionName(sections.data, d.to_section_id)}</TD>
                <TD className="text-fg-secondary">{formatDate(d.business_day)}</TD>
                <TD right>{d.line_count}</TD>
                <TD right>{d.total_cost_minor ? formatMoney(d.total_cost_minor) : "-"}</TD>
                <TD className="max-w-56 truncate text-fg-secondary">{d.reason ?? d.invoice_ref ?? d.note ?? ""}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(d.created_at)}</TD>
              </TR>
            )) : <EmptyRow colSpan={10}>No documents match. Receive stock or record waste to start.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
