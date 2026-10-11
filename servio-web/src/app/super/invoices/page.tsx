"use client";
import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useSuperApi, superKey } from "@/components/super/api";
import { SuperPageHeader, ErrorNote } from "@/components/super/shell";
import { invoiceActionable, invoiceStatusVariant } from "@/components/super/super-helpers";
import { useAction } from "@/components/admin/crud";
import { FilterBar, LoadMore } from "@/components/admin/page";
import type { Page, SuperInvoice } from "@/lib/types";
import { Badge, Button, ConfirmDialog, EmptyRow, Loading, Select, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";

const STATUSES = ["open", "reported", "paid", "void"];

export default function SuperInvoicesPage() {
  const sapi = useSuperApi();
  const [status, setStatus] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const list = useInfiniteQuery({
    queryKey: superKey("invoices", { status }),
    queryFn: ({ pageParam }) => sapi<Page<SuperInvoice>>("/super/invoices", { query: { status, cursor: pageParam, limit: 50 } }),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const confirm = useAction<string>(["super"], (id) => sapi(`/super/invoices/${id}/confirm`, { method: "POST" }), "Payment confirmed; the business is active again");
  const run = useAction<void>(["super"], () => sapi("/super/billing/run_lifecycle", { method: "POST" }), "Billing lifecycle ran");
  const target = rows.find((r) => r.id === confirmId);

  return (
    <>
      <SuperPageHeader title="Invoices" description="Subscription invoices across every business. Confirm a payment the restaurant reported by bank transfer or JazzCash."
        actions={<Button variant="secondary" onClick={() => setRunOpen(true)}><Play className="h-4 w-4" /> Run billing lifecycle</Button>} />
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
      </FilterBar>
      <ErrorNote error={list.error} />
      <Table compact>
        <THead><tr><TH>Number</TH><TH>Business</TH><TH right>Amount</TH><TH>Status</TH><TH>Due</TH><TH>Payment</TH><TH right>Action</TH></tr></THead>
        <TBody>
          {list.isLoading ? <tr><td colSpan={7}><Loading /></td></tr> : rows.length === 0 ? <EmptyRow colSpan={7}>No invoices{status ? ` with status ${status}` : " yet"}</EmptyRow> : rows.map((i) => (
            <TR key={i.id}>
              <TD className="font-mono text-xs">{i.number ?? <span className="text-fg-muted">draft</span>}</TD>
              <TD><Link href={`/super/businesses/${i.business.id}`} className="font-medium hover:text-primary hover:underline">{i.business.name}</Link><div className="font-mono text-xs text-fg-muted">{i.business.slug}</div></TD>
              <TD right className="font-medium">{formatMoney(i.amount_minor, i.currency)}</TD>
              <TD><Badge variant={invoiceStatusVariant(i.status)}>{titleCase(i.status)}</Badge></TD>
              <TD className="whitespace-nowrap">{i.due_on ? formatDate(i.due_on) : <span className="text-fg-muted">-</span>}</TD>
              <TD>
                {i.payment_method || i.payment_reference || i.reported_at ? (
                  <div className="text-xs leading-4">
                    {i.payment_method ? <div className="font-medium">{titleCase(i.payment_method)}</div> : null}
                    {i.payment_reference ? <div className="font-mono text-fg-secondary">{i.payment_reference}</div> : null}
                    {i.reported_at ? <div className="text-fg-muted">reported {formatDateTime(i.reported_at)}</div> : null}
                  </div>
                ) : <span className="text-fg-muted">-</span>}
              </TD>
              <TD right>{invoiceActionable(i.status) ? <Button size="sm" variant={i.status === "reported" ? "primary" : "secondary"} onClick={() => setConfirmId(i.id)}>Confirm payment</Button> : null}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <LoadMore cursor={list.hasNextPage ? "more" : null} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />

      <ConfirmDialog open={!!target} onClose={() => setConfirmId(null)} loading={confirm.isPending} confirmLabel="Mark as paid"
        title={target ? `Confirm ${formatMoney(target.amount_minor, target.currency)} from ${target.business.name}?` : ""}
        description={target ? `Invoice ${target.number ?? "(draft)"} becomes paid and the business goes back to active.${target.payment_reference ? ` Reference: ${target.payment_reference}.` : ""}` : undefined}
        onConfirm={() => target && confirm.mutate(target.id, { onSuccess: () => setConfirmId(null) })} />
      <ConfirmDialog open={runOpen} onClose={() => setRunOpen(false)} loading={run.isPending} confirmLabel="Run now" title="Run the billing lifecycle now?"
        description="Issues due invoices, moves overdue businesses to grace or read-only and ends expired trials, exactly as the nightly job does."
        onConfirm={() => run.mutate(undefined, { onSuccess: () => setRunOpen(false) })} />
    </>
  );
}
