"use client";
import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, FileText, SlidersHorizontal } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer, Ledger, LedgerEntry } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { exportTablePdf } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { Cards, PageHeader } from "@/components/admin/page";
import { CustomerPicker } from "@/components/admin/customers-picker";
import { balanceLabel } from "@/components/admin/marketing-helpers";
import { AdjustBalanceDialog, BillActions, OpeningBalanceDialog, PeriodPicker, ReverseAdjustmentDialog, useAdjustments, type ReversibleAdjustment } from "@/components/admin/customer-accounts";
import {
  ALL_TIME, billLines, canReverseEntry, entryDay, entryDetails, entryKindLabel, entryKindVariant, entryRef, isAllTime, ledgerRows, periodError, periodLabel, periodQuery, signedMoney,
  type LedgerRow, type Period,
} from "@/components/admin/customer-accounts-helpers";
import { Badge, Button, Card, EmptyRow, EmptyState, ErrorState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { OrderDrawer } from "@/components/admin/order-drawer";

// SPEC Customer Ledger: every charge put on account, every payment and refund, opening balances, adjustments and
// their reversals, with a running balance and how old the open amount is. A period shows the balance brought forward,
// the entries inside it and the closing balance; the bill for that period can be downloaded or sent from here.
// Rows are the API's ledger entries (Customers::Ledger), oldest first so the balance reads down.

const columns = [
  { header: "Date", key: "date" }, { header: "Entered", key: "at" }, { header: "Business day", key: "business_day" }, { header: "Entry", key: "kind" }, { header: "Order / ref", key: "ref" },
  { header: "Details", key: "details" }, { header: "Method", key: "method" }, { header: "Status", key: "status" },
  { header: "Amount", key: "amount", align: "right" as const }, { header: "Balance", key: "balance", align: "right" as const },
];

const isPayment = (e: LedgerEntry) => e.kind === "payment" || e.kind === "paid_out";
/** Payments show their method in the Method column; everything else shows items or the reason in Details. */
const detailsOf = (e: LedgerEntry) => (isPayment(e) ? "" : entryDetails(e));
const methodOf = (e: LedgerEntry) => (isPayment(e) ? entryDetails(e) : "");

function exportRow(r: LedgerRow): Record<string, string> {
  if (r.type !== "entry") {
    return { date: formatDate(r.day), at: "", business_day: "", kind: r.type === "brought_forward" ? "Balance brought forward" : "Closing balance", ref: "", details: "", method: "", status: "", amount: "", balance: formatMoney(r.balance_minor) };
  }
  const e = r.entry;
  return {
    date: formatDate(entryDay(e)), at: formatDateTime(e.at), business_day: formatDate(e.business_day), kind: entryKindLabel(e.kind), ref: entryRef(e), details: detailsOf(e), method: methodOf(e),
    status: e.reversed ? "Reversed" : "", amount: signedMoney(e.amount_minor), balance: formatMoney(e.balance_minor),
  };
}

function LedgerScreen() {
  const params = useSearchParams();
  const presetId = params.get("customer_id");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const applied = useRef(false);
  const preset = useQuery({ queryKey: ["customer", presetId], queryFn: () => api<Customer>(`/customers/${presetId}`), enabled: !!presetId && !applied.current });
  useEffect(() => { if (preset.data && !applied.current) { applied.current = true; setCustomer(preset.data); } }, [preset.data]);
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [selected, setSelected] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reversing, setReversing] = useState<ReversibleAdjustment | null>(null);
  const bad = periodError(period);
  const q = useQuery({ queryKey: ["ledger", customer?.id, period.from, period.to], queryFn: () => api<Ledger>(`/customers/${customer!.id}/ledger`, { query: periodQuery(period) }), enabled: !!customer && !bad });
  const adjustments = useAdjustments(customer?.id);
  const c = q.data?.customer ?? customer;
  const a = q.data?.aging;
  const entries = q.data?.entries ?? [];
  const rows = q.data ? ledgerRows(q.data, period) : [];
  const exportRows = rows.map(exportRow);
  const hasPeriod = !isAllTime(period);
  // The bill covers the chosen period; for all time, from the first entry to today.
  const billPeriod: Period | null = hasPeriod ? period : entries.length ? { from: entryDay(entries[0]), to: isoDay() } : null;
  const fileBase = `ledger-${c?.khata_no ?? c?.name ?? "customer"}${hasPeriod ? `-${period.from}-${period.to}` : ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const totalsLine = q.data?.totals && hasPeriod ? billLines({ brought_forward_minor: q.data.brought_forward_minor ?? 0, totals: q.data.totals }).map((l) => `${l.label} ${formatMoney(l.amount_minor)}`).join(", ") : null;
  const exportPdf = () => c && exportTablePdf({
    title: `Customer ledger: ${c.name}`, filename: `${fileBase}.pdf`, landscape: true, columns, rows: exportRows,
    subtitle: [c.khata_no ? `Khata ${c.khata_no}` : null, c.member_no ? `Roll ${c.member_no}` : null, c.room ? `Room ${c.room}` : null, periodLabel(period), `Balance ${formatMoney(c.balance_minor)} (${balanceLabel(c.balance_minor)})`].filter(Boolean).join(" · "),
    footer: [
      totalsLine ? `${totalsLine}. Closing balance ${formatMoney(q.data?.closing_balance_minor ?? 0)}.` : null,
      a ? `Aging: current ${formatMoney(a.current)}, 31-60 ${formatMoney(a["31_60"])}, 61-90 ${formatMoney(a["61_90"])}, over 90 ${formatMoney(a.over_90)}` : null,
    ].filter((x): x is string => !!x),
  });
  const openOpening = adjustments.data?.open_opening ?? null;
  const walkIn = !!c?.is_walk_in;
  return (
    <>
      <PageHeader icon={BookOpen} title="Customer Ledger" description="Purchases on account, payments, refunds, opening balances and adjustments, with the running balance and how old the open amount is." actions={c ? <>
        <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(fileBase, columns, exportRows)}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="secondary" disabled={!rows.length} onClick={exportPdf}><FileText className="h-4 w-4" /> PDF</Button>
        <Link href={`/admin/customers/${c.id}`}><Button variant="secondary">Open customer</Button></Link>
      </> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-md"><CustomerPicker value={customer} onChange={(v) => { setCustomer(v); applied.current = true; }} autoFocus={!presetId} /></div>
        <PeriodPicker value={period} onChange={setPeriod} allowAll />
      </div>
      {!customer ? (presetId && preset.isLoading ? <Loading /> : <EmptyState icon={BookOpen} title="Pick a customer" hint="Search by name, phone, khata no, roll or room to open their ledger." />)
        : bad ? <EmptyState icon={BookOpen} title="Check the dates" hint={bad} />
        : q.isLoading ? <Loading /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : c ? (
        <>
          <Cards className="xl:grid-cols-5">
            <SummaryCard label={balanceLabel(c.balance_minor)} value={formatMoney(Math.abs(c.balance_minor))} sub={c.khata_no ? `Khata ${c.khata_no}` : "No khata no"} tone={c.balance_minor > 0 ? "danger" : "success"} />
            <SummaryCard label="Current (0-30)" value={formatMoney(a?.current)} tone="success" />
            <SummaryCard label="31-60 days" value={formatMoney(a?.["31_60"])} tone="warning" />
            <SummaryCard label="61-90 days" value={formatMoney(a?.["61_90"])} tone="warning" />
            <SummaryCard label="Over 90" value={formatMoney(a?.over_90)} tone="danger" />
          </Cards>
          {!walkIn ? (
            <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAdjusting(true)}><SlidersHorizontal className="h-4 w-4" /> Adjust balance</Button>
                {openOpening ? (
                  <span className="text-xs text-fg-muted">Opening balance {formatMoney(Math.abs(openOpening.amount_minor))}{openOpening.amount_minor < 0 ? " in advance" : ""} on {formatDate(openOpening.effective_on)} ({openOpening.label})</span>
                ) : adjustments.data ? <Button size="sm" variant="secondary" onClick={() => setOpening(true)}>Opening balance</Button> : null}
              </div>
              {billPeriod ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-fg-muted">Bill for {periodLabel(billPeriod)}</span>
                  <BillActions customer={c} period={billPeriod} labels={{ download: "Download bill PDF", send: "Send bill" }} />
                </div>
              ) : <span className="text-xs text-fg-muted">Nothing on account yet, so there is no bill.</span>}
            </Card>
          ) : null}
          {hasPeriod && q.data?.totals ? (
            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-2xl border bg-card px-5 py-3 text-sm">
              {billLines({ brought_forward_minor: q.data.brought_forward_minor ?? 0, totals: q.data.totals }).map((l) => (
                <span key={l.key}><span className="text-fg-secondary">{l.label}</span> <span className="ml-1 font-medium tabular">{l.key === "previous" ? formatMoney(l.amount_minor) : signedMoney(l.amount_minor)}</span></span>
              ))}
              <span><span className="text-fg-secondary">Closing balance</span> <span className="ml-1 font-semibold tabular">{formatMoney(q.data.closing_balance_minor ?? 0)}</span></span>
            </div>
          ) : null}
          <Table>
            <THead><tr><TH>Date</TH><TH>Entry</TH><TH>Order / ref</TH><TH>Details</TH><TH>Method</TH><TH right>Amount</TH><TH right>Balance</TH><TH></TH></tr></THead>
            <TBody>
              {rows.map((r) => r.type !== "entry" ? (
                <Fragment key={r.type}>
                {r.type === "closing" && !entries.length ? <EmptyRow colSpan={8}>No account activity in this period.</EmptyRow> : null}
                <TR className="bg-muted/60 font-medium">
                  <TD className="whitespace-nowrap text-fg-secondary">{formatDate(r.day)}</TD>
                  <TD colSpan={5}>{r.type === "brought_forward" ? "Balance brought forward" : "Closing balance"}</TD>
                  <TD right className="font-semibold">{formatMoney(r.balance_minor)}</TD>
                  <TD />
                </TR>
                </Fragment>
              ) : (
                <TR key={`${r.entry.kind}-${r.entry.ref}`} onClick={r.entry.order_id ? () => setSelected(r.entry.order_id!) : undefined} className={r.entry.reversed ? "text-fg-muted" : undefined}>
                  <TD className="whitespace-nowrap text-fg-secondary" title={formatDateTime(r.entry.at)}>{formatDate(entryDay(r.entry))}</TD>
                  <TD className="whitespace-nowrap"><Badge variant={entryKindVariant(r.entry.kind)}>{entryKindLabel(r.entry.kind)}</Badge>{r.entry.reversed ? <Badge variant="outline" className="ml-1.5">Reversed</Badge> : null}</TD>
                  <TD className="whitespace-nowrap font-mono text-xs">{entryRef(r.entry) || "-"}</TD>
                  <TD className="max-w-96 truncate text-fg-secondary" title={detailsOf(r.entry)}>{detailsOf(r.entry) || "-"}</TD>
                  <TD className="whitespace-nowrap text-fg-secondary">{methodOf(r.entry) || "-"}</TD>
                  <TD right className={cn(r.entry.reversed && "line-through", !r.entry.reversed && (r.entry.amount_minor < 0 ? "text-success" : "text-danger"))}>{signedMoney(r.entry.amount_minor)}</TD>
                  <TD right className="font-medium">{formatMoney(r.entry.balance_minor)}</TD>
                  <TD right>{canReverseEntry(r.entry) ? <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setReversing({ id: r.entry.ref, label: r.entry.label, kind: r.entry.kind, amount_minor: r.entry.amount_minor, reason: r.entry.reason }); }}>Reverse</Button> : null}</TD>
                </TR>
              ))}
              {!entries.length && !hasPeriod ? <EmptyRow colSpan={8}>No account activity for this customer.</EmptyRow> : null}
            </TBody>
          </Table>
          <AdjustBalanceDialog customer={c} open={adjusting} onClose={() => setAdjusting(false)} />
          <OpeningBalanceDialog customer={c} open={opening} onClose={() => setOpening(false)} />
          <ReverseAdjustmentDialog adjustment={reversing} onClose={() => setReversing(null)} />
        </>
      ) : null}
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export default function CustomerLedgerPage() {
  return <Suspense fallback={<Loading />}><LedgerScreen /></Suspense>;
}
