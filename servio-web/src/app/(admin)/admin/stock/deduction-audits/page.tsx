"use client";
import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { DeductionAudit } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { AUDIT_STATUSES, auditStatusVariant } from "@/components/admin/purchasing";
import { Badge, Button, EmptyRow, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const HINTS: Record<string, string> = {
  ok: "Every line had a recipe and stock was deducted.", missing: "No line had a recipe; nothing was deducted.", partial: "Some lines had no recipe; those were not deducted.",
  reversed: "The order was voided before cooking and stock was returned.", waste: "Voided after cooking: the deduction stays as waste.", skipped: "Stock deduction on sale is switched off.", error: "Deduction failed; check the detail.",
};

export default function DeductionAuditsPage() {
  const [status, setStatus] = useState("");
  const [day, setDay] = useState("");
  const list = usePagedList<DeductionAudit>(["deduction_audits"], "/stock/deduction_audits", { status, business_day: day });
  return (
    <>
      <PageHeader icon={ShieldCheck} title="Deduction audits" description="One row per placed order: whether stock was deducted, for how many lines, and which products had no recipe." />
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{AUDIT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Business day" />
        {day ? <Button variant="ghost" size="sm" onClick={() => setDay("")}>Clear day</Button> : null}
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Order</TH><TH>Day</TH><TH>Status</TH><TH right>Entries</TH><TH>Detail</TH><TH>Checked</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((a) => {
              const missing = a.detail?.missing ?? [];
              return (
                <TR key={a.id}>
                  <TD><Link href={`/admin/orders?q=${encodeURIComponent(a.order_label)}`} className="font-mono font-medium text-primary hover:underline">{a.order_label}</Link></TD>
                  <TD className="text-fg-secondary">{formatDate(a.business_day)}</TD>
                  <TD><Badge variant={auditStatusVariant(a.status)} title={HINTS[a.status]}>{titleCase(a.status)}</Badge></TD>
                  <TD right>{a.entries}</TD>
                  <TD className="text-sm text-fg-secondary">
                    {missing.length ? <span>No recipe: <span className="text-fg">{missing.join(", ")}</span></span> : a.detail?.error ? <span className="text-danger">{String(a.detail.error)}</span> : HINTS[a.status] ?? ""}
                    {missing.length ? <Link href="/admin/stock/recipes" className="ml-2 text-xs text-primary hover:underline">Add recipes</Link> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(a.checked_at)}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={6}>No audits match.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
