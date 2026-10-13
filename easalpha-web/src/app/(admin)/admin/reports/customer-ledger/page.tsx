"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer, CustomerLedgerSummary, Ledger, Page } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { Cards, SearchInput } from "@/components/admin/page";
import { ReportShell } from "@/components/admin/report-shell";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, EmptyState, ErrorState, Loading, Stat, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const KIND_TONE: Record<string, "danger" | "success" | "warning" | "neutral"> = { charge: "danger", payment: "success", refund: "warning", paid_out: "neutral" };

export default function CustomerLedgerReportPage() {
  const [search, setSearch] = useState("");
  const dq = useDebounced(search.trim());
  const [picked, setPicked] = useState<Customer | null>(null);
  const summary = useQuery({ queryKey: ["customers", "ledger_summary"], queryFn: () => api<CustomerLedgerSummary>("/customers/ledger_summary") });
  const candidates = useQuery({
    queryKey: ["customers_pick", "ledger", dq],
    queryFn: () => api<Page<Customer>>("/customers", { query: dq ? { q: dq, limit: 15 } : { with_balance: "true", limit: 15 } }),
    enabled: !picked, select: (r) => r.data.filter((c) => !c.is_walk_in),
  });
  const ledger = useQuery({ queryKey: ["customer_ledger", picked?.id], queryFn: () => api<Ledger>(`/customers/${picked!.id}/ledger`), enabled: !!picked });
  const entries = ledger.data?.entries ?? [];
  const charges = entries.filter((e) => e.kind === "charge").reduce((a, e) => a + e.amount_minor, 0);
  const received = entries.filter((e) => e.kind === "payment").reduce((a, e) => a - e.amount_minor, 0);
  const s = summary.data;
  return (
    <ReportShell icon={BookOpen} title="Customer Ledger" description="Credit account movements: every charge to a customer's account, every payment received against it, and the running balance."
      filters={picked ? (
        <div className="flex items-center gap-2 text-sm"><span className="text-fg-secondary">Customer</span><Badge variant="primary">{picked.name}{picked.phone ? ` · ${picked.phone}` : ""}</Badge><Button variant="ghost" size="sm" onClick={() => { setPicked(null); setSearch(""); }}><X className="h-4 w-4" /> Change</Button></div>
      ) : <SearchInput value={search} onChange={setSearch} placeholder="Find a customer by name, phone or khata number" />}
      exportData={{
        name: picked ? `customer-ledger-${picked.khata_no ?? picked.id}` : "customer-ledger", subtitle: picked ? `${picked.name}${picked.phone ? ` · ${picked.phone}` : ""}` : undefined,
        columns: [{ header: "When", key: "at" }, { header: "Business day", key: "day" }, { header: "Entry", key: "kind" }, { header: "Reference", key: "ref" }, { header: "Charge", key: "debit", align: "right" }, { header: "Payment", key: "credit", align: "right" }, { header: "Balance", key: "balance", align: "right" }],
        rows: entries.map((e) => ({ at: formatDateTime(e.at), day: formatDate(e.business_day), kind: titleCase(e.kind), ref: e.order_label ?? e.number ?? "", debit: e.amount_minor > 0 ? formatMoney(e.amount_minor) : "", credit: e.amount_minor < 0 ? formatMoney(-e.amount_minor) : "", balance: formatMoney(e.balance_minor) })),
        footer: ledger.data ? [`Charged ${formatMoney(charges)}  |  Received ${formatMoney(received)}  |  Balance ${formatMoney(ledger.data.balance_minor)}  |  Over 90 days ${formatMoney(ledger.data.aging.over_90)}`] : undefined,
      }}>
      {!picked ? (
        <>
          {/* A failed summary (customer accounts switched off, say) shows why, not Rs 0 owed. */}
          {summary.error ? <div className="mb-6"><ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} /></div> : (
            <Cards>
              <SummaryCard label="Outstanding" value={formatMoney(s?.total_outstanding_minor)} sub={`${s?.customers_with_due ?? 0} customers owe`} tone="warning" />
              <SummaryCard label="Credit customers" value={s?.credit_customers ?? 0} sub={`of ${s?.total_customers ?? 0} customers`} tone="info" />
              <SummaryCard label="Collected this month" value={formatMoney(s?.collected_this_month_minor)} tone="success" />
              <SummaryCard label="Aging" value={<Link href="/admin/customers/ar-aging" className="text-base text-primary hover:underline">AR Aging report</Link>} sub="Outstanding balances by age" tone="neutral" />
            </Cards>
          )}
          <Card>
            <CardHeader><CardTitle>{dq ? "Matching customers" : "Customers with a balance"}</CardTitle><span className="text-sm text-fg-secondary">Pick one to open their ledger</span></CardHeader>
            {candidates.isLoading ? <Loading /> : candidates.error ? <div className="p-5"><ErrorState message={errorMessage(candidates.error)} onRetry={() => candidates.refetch()} /></div> : (
              <Table>
                <THead><tr><TH>Customer</TH><TH>Phone</TH><TH>Khata no</TH><TH right>Credit limit</TH><TH right>Balance</TH></tr></THead>
                <TBody>{candidates.data?.length ? candidates.data.map((c) => (
                  <TR key={c.id} onClick={() => setPicked(c)}><TD className="font-medium text-primary">{c.name}</TD><TD className="text-fg-secondary">{c.phone ?? "-"}</TD><TD className="font-mono text-fg-secondary">{c.khata_no ?? "-"}</TD><TD right className="text-fg-secondary">{c.credit_limit_minor !== null ? formatMoney(c.credit_limit_minor) : "-"}</TD><TD right className={c.balance_minor > 0 ? "font-medium text-danger" : ""}>{formatMoney(c.balance_minor)}</TD></TR>
                )) : <EmptyRow colSpan={5}>{dq ? "No customer matches" : "No customer owes anything"}</EmptyRow>}</TBody>
              </Table>
            )}
          </Card>
        </>
      ) : ledger.error ? <ErrorState message={errorMessage(ledger.error)} onRetry={() => ledger.refetch()} /> : ledger.isLoading || !ledger.data ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Balance" value={formatMoney(ledger.data.balance_minor)} sub={ledger.data.balance_minor > 0 ? "Owed to you" : ledger.data.balance_minor < 0 ? "In credit" : "Settled"} tone={ledger.data.balance_minor > 0 ? "danger" : "success"} />
            <SummaryCard label="Charged" value={formatMoney(charges)} sub={`${entries.filter((e) => e.kind === "charge").length} orders on account`} tone="warning" />
            <SummaryCard label="Received" value={formatMoney(received)} sub={`${entries.filter((e) => e.kind === "payment").length} payments`} tone="success" />
            <SummaryCard label="Credit limit" value={picked.credit_limit_minor !== null ? formatMoney(picked.credit_limit_minor) : "None"} sub={picked.khata_no ? `Khata ${picked.khata_no}` : ""} tone="neutral" />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            {entries.length ? (
              <Table>
                <THead><tr><TH>When</TH><TH>Entry</TH><TH>Reference</TH><TH right>Charge</TH><TH right>Payment</TH><TH right>Balance</TH></tr></THead>
                <TBody>{entries.map((e, i) => (
                  <TR key={`${e.ref}-${i}`}>
                    <TD className="text-fg-secondary">{formatDateTime(e.at)}</TD>
                    <TD><Badge variant={KIND_TONE[e.kind] ?? "neutral"}>{titleCase(e.kind)}</Badge>{e.method ? <span className="ml-2 text-xs text-fg-muted">{titleCase(e.method)}</span> : null}</TD>
                    <TD className="font-mono text-fg-secondary">{e.order_label ?? e.number ?? "-"}{e.reference ? <span className="ml-1 font-sans text-xs text-fg-muted">{e.reference}</span> : null}</TD>
                    <TD right className={e.amount_minor > 0 ? "text-danger" : "text-fg-muted"}>{e.amount_minor > 0 ? formatMoney(e.amount_minor) : "-"}</TD>
                    <TD right className={e.amount_minor < 0 ? "text-success" : "text-fg-muted"}>{e.amount_minor < 0 ? formatMoney(-e.amount_minor) : "-"}</TD>
                    <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
                  </TR>
                ))}</TBody>
              </Table>
            ) : <EmptyState title="No account movements" hint="This customer has never been charged on account or paid against one." />}
            <Card className="h-fit">
              <CardHeader><CardTitle>Aging</CardTitle></CardHeader>
              <CardBody>
                <Stat label="Current (0 to 30 days)" value={formatMoney(ledger.data.aging.current)} />
                <Stat label="31 to 60 days" value={formatMoney(ledger.data.aging["31_60"])} />
                <Stat label="61 to 90 days" value={formatMoney(ledger.data.aging["61_90"])} />
                <Stat label="Over 90 days" value={formatMoney(ledger.data.aging.over_90)} tone={ledger.data.aging.over_90 ? "danger" : undefined} />
                <Stat label="Total due" value={formatMoney(ledger.data.aging.total)} className="border-t font-medium" />
                <p className="mt-3 text-xs text-fg-secondary">Open the <Link href={`/admin/customers/${picked.id}`} className="text-primary hover:underline">customer record</Link> to receive a payment.</p>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </ReportShell>
  );
}
