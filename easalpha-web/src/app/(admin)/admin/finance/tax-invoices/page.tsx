"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, RotateCw } from "lucide-react";
import { api } from "@/lib/api";
import type { TaxInvoice, TaxQueueSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, EmptyRow, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function TaxInvoicesPage() {
  const [status, setStatus] = useState("");
  const list = usePagedList<TaxInvoice>(["tax_invoices"], "/tax_invoices", { status });
  const summary = useQuery({ queryKey: ["tax_summary"], queryFn: () => api<TaxQueueSummary>("/tax_invoices/summary") });
  const retry = useAction<string>(["tax_invoices", "tax_summary"], (id) => api(`/tax_invoices/${id}/retry`, { method: "POST" }), "Retried");
  const s = summary.data;
  return (
    <>
      <PageHeader icon={FileCheck2} title="Tax invoices" description={s ? (s.registered ? `Registered with ${(s.registration?.authority ?? "").toUpperCase()} · POS ${s.registration?.pos_id ?? "-"}` : "Not registered: set the authority on the branch to start issuing invoices.") : ""} />
      <Cards>
        <SummaryCard label="Queued" value={s?.queued ?? 0} sub={s?.oldest_pending_at ? `Oldest ${formatDateTime(s.oldest_pending_at)}` : ""} tone="info" />
        <SummaryCard label="Failed" value={s?.failed ?? 0} tone={s?.failed ? "danger" : "neutral"} />
        <SummaryCard label="Accepted" value={s?.accepted ?? 0} sub={s?.last_accepted_at ? `Last ${formatDateTime(s.last_accepted_at)}` : ""} tone="success" />
      </Cards>
      <FilterBar><Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="queued">Queued</option><option value="failed">Failed</option><option value="accepted">Accepted</option></Select></FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Order</TH><TH>Authority</TH><TH>Status</TH><TH>Invoice no</TH><TH>Attempts</TH><TH>Last error</TH><TH right>Total</TH><TH right></TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((i) => (
              <TR key={i.id}>
                <TD className="font-mono">{i.order_label}</TD>
                <TD className="uppercase">{i.authority}</TD>
                <TD><Badge variant={i.status === "accepted" ? "success" : i.status === "failed" ? "danger" : "info"}>{i.status}</Badge></TD>
                <TD className="font-mono text-xs">{i.invoice_number ?? "-"}</TD>
                <TD>{i.attempts}{i.next_attempt_at && i.status !== "accepted" ? <span className="text-xs text-fg-muted"> · next {formatDateTime(i.next_attempt_at)}</span> : null}</TD>
                <TD className={cn("max-w-xs truncate text-xs", i.last_error ? "text-danger" : "text-fg-muted")} title={i.last_error ?? ""}>{i.last_error ?? "-"}</TD>
                <TD right>{formatMoney(i.total_minor)}</TD>
                <TD right>{i.status !== "accepted" ? <Button size="sm" variant="secondary" onClick={() => retry.mutate(i.id)}><RotateCw className="h-3 w-3" /> Retry</Button> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No invoices in this state.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
