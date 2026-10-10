"use client";
import { useState } from "react";
import Link from "next/link";
import { FileStack, Plus } from "lucide-react";
import type { StockDocument } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { sectionName, useSections } from "@/components/admin/stock";
import { staffName, useStaff } from "@/components/admin/phase3";
import { DOC_KIND_META, DOC_STATUSES } from "@/components/admin/inventory-helpers";
import { DocKindBadge, DocStatusBadge } from "@/components/admin/inventory-document";
import { Button, EmptyRow, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC Stock Actions: a document register. Every movement is a numbered document with a type, a status and a posting date.
export default function StockActionsPage() {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const sections = useSections();
  const staff = useStaff();
  const list = usePagedList<StockDocument>(["stock_documents"], "/stock_documents", { kind, status, section_id: section, from, to });
  const who = (id: string | null) => (staff.isError ? "-" : staffName(staff.data, id));
  const sectionsOf = (d: StockDocument) => {
    const f = d.from_section_id ? sectionName(sections.data, d.from_section_id) : null;
    const t = d.to_section_id ? sectionName(sections.data, d.to_section_id) : null;
    if (f && t) return `${f} → ${t}`;
    return f ?? t ?? "-";
  };
  return (
    <>
      <PageHeader icon={FileStack} title="Stock Actions" description="Every stock movement is a numbered document with a type, a status and a posting date. Drafts can be edited; posted documents are voided with reversing entries, never deleted." actions={<Link href="/admin/inventory/stock-actions/new"><Button><Plus className="h-4 w-4" /> New stock action</Button></Link>} />
      <FilterBar>
        <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type"><option value="">All types</option>{DOC_KIND_META.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option>{DOC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section"><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="text-xs text-fg-muted">to</span>
        <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Number</TH><TH>Type</TH><TH>Status</TH><TH>Posting date</TH><TH>Sections</TH><TH right>Lines</TH><TH right>Total value</TH><TH>Created by</TH><TH>Created</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((d) => (
              <TR key={d.id}>
                <TD>
                  <Link href={`/admin/inventory/stock-actions/${d.id}`} className="font-mono font-medium text-primary hover:underline">{d.label}</Link>
                  {d.purchase_order_id ? <Link href={`/admin/purchasing/purchase-orders/${d.purchase_order_id}`} className="ml-2 text-xs text-primary hover:underline">PO</Link> : null}
                  {d.reason || d.invoice_ref ? <div className="max-w-56 truncate text-xs text-fg-muted">{d.invoice_ref ?? d.reason}</div> : null}
                </TD>
                <TD><DocKindBadge kind={d.kind} /></TD>
                <TD><DocStatusBadge status={d.status} /></TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDate(d.posting_date ?? d.business_day)}</TD>
                <TD className="text-fg-secondary">{sectionsOf(d)}</TD>
                <TD right>{d.line_count}</TD>
                <TD right>{d.total_cost_minor ? formatMoney(d.total_cost_minor) : "-"}</TD>
                <TD className="text-fg-secondary">{who(d.by_membership_id)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(d.created_at)}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No stock actions match. Receive goods, record waste or post an opening balance to start.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
