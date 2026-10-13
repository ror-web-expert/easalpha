"use client";
import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, History, Printer, Send } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import type { BillRun, CustomerBillsResponse } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { Cards, FilterBar, PageHeader, SearchInput } from "@/components/admin/page";
import { SettingsScreenCard, useSettings } from "@/components/admin/settings-screen";
import { BillActions, BillRunResults, downloadPdf, PeriodPicker, SEND_BILL_PERMS } from "@/components/admin/customer-accounts";
import {
  billLines, billTargets, MAX_PRINT_IDS, periodError, periodFor, periodLabel, printIds, runCounts, sendErrorText, toggleAll, toggleId, triggerLabel, type Period,
} from "@/components/admin/customer-accounts-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Dialog, EmptyRow, ErrorState, Field, Input, Loading, MoneyInput, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// Monthly Bills (customer accounts): one row per customer for a period, last month by default: what they owed before,
// bought and paid, and what they owe now. Send the bills on WhatsApp (to the selection, or to everyone who owes at
// least the minimum from the settings), print them all as one PDF, see every past send, and set up the automatic
// month-end send in the Customer Accounts settings card.

const runPeriod = (r: BillRun): Period => ({ from: r.period_from, to: r.period_to });
const checkbox = "h-[18px] w-[18px] shrink-0 rounded-[2px] accent-[var(--primary)]";

export default function MonthlyBillsPage() {
  const can = useCan();
  const canSend = can(...SEND_BILL_PERMS);
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>(() => periodFor("last_month"));
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const [minBalance, setMinBalance] = useState(0);
  // Every bill is rebuilt on the server for a new minimum, so typing 5000 asks once, not four times.
  const dMin = useDebounced(minBalance, 300);
  const [everyone, setEveryone] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const [result, setResult] = useState<BillRun | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const bad = periodError(period);
  const list = useQuery({
    queryKey: ["customer_bills", period.from, period.to, dq, dMin, everyone],
    queryFn: () => api<CustomerBillsResponse>("/customer_bills", { query: { from: period.from, to: period.to, q: dq || undefined, min_balance_minor: dMin > 0 ? dMin : undefined, all: everyone ? "true" : undefined }, timeoutMs: 60_000 }),
    enabled: !bad,
    placeholderData: keepPreviousData,
  });
  const runs = useQuery({ queryKey: ["bill_runs"], queryFn: () => api<{ data: BillRun[] }>("/bill_runs"), select: (r) => r.data });
  const settings = useSettings();
  const settingKeys = settings.data?.groups.store?.screens["Customer Accounts"];
  // The setting is in whole rupees; amounts on this screen are paisa.
  const minDue = (Number(settingKeys?.find((k) => k.key === "khata.monthly_bills.min_balance")?.value ?? 1) || 1) * 100;
  const data = list.data;
  const rows = data?.rows ?? [];
  const ids = rows.map((r) => r.customer.id);
  const chosen = rows.filter((r) => selected.has(r.customer.id));
  const allChosen = rows.length > 0 && chosen.length === rows.length;
  const targets = billTargets(rows, selected, minDue);
  const noPhone = targets.rows.filter((r) => !r.phones.length).length;
  const owing = rows.filter((r) => r.closing_balance_minor > 0).length;
  const filtered = !!dq || dMin > 0;
  const label = periodLabel(period);
  // While a new period or filter loads (or is still being typed), the rows on screen belong to the old one: hold Send and Print.
  const settled = !bad && !!data && !list.isPlaceholderData && dq === q.trim() && dMin === minBalance;

  const sendRun = useMutation({
    mutationFn: (customerIds: string[]) => api<BillRun>("/bill_runs", { method: "POST", body: { from: period.from, to: period.to, due_on: dueOn || undefined, customer_ids: customerIds }, timeoutMs: 300_000 }),
    onSuccess: (r) => {
      setConfirming(false);
      setSelected(new Set());
      setResult(r);
      const c = runCounts(r.results ?? []);
      toast.success("Bills sent", `${c.sent} sent, ${c.failed} failed, ${c.skipped} without a phone.`);
      qc.invalidateQueries({ queryKey: ["bill_runs"] });
      qc.invalidateQueries({ queryKey: ["customer_bills"] });
    },
    onError: (e) => { setConfirming(false); toast.error("Bills not sent", sendErrorText(errorCode(e), errorMessage(e))); },
  });

  const toPrint = printIds(rows, selected, filtered);
  const printLabel = chosen.length ? `Print selected (${chosen.length})` : toPrint ? `Print these (${toPrint.length})` : "Print all";
  const print = async () => {
    const customerIds = toPrint;
    if (customerIds && !customerIds.length) { toast.info("Nothing to print", "Nobody on this list has a bill for the period."); return; }
    if (customerIds && customerIds.length > MAX_PRINT_IDS) { toast.error("Too many bills to print at once", `Select up to ${MAX_PRINT_IDS} customers, or clear the search and minimum to print every bill.`); return; }
    setPrinting(true);
    try { await downloadPdf("/customer_bills.pdf", { from: period.from, to: period.to, customer_ids: customerIds }, `bills-${period.to.slice(0, 7)}.pdf`); }
    catch (e) { toast.error("Could not print the bills", errorMessage(e)); }
    finally { setPrinting(false); }
  };
  const openSend = () => { setDueOn(data?.due_on ?? ""); setConfirming(true); };
  const lastRun = data?.last_run ?? null;
  const shownRun = result ?? null;

  return (
    <>
      <PageHeader icon={FileText} title="Monthly Bills" description="Each customer's bill for a period: what they owed before, bought, paid and owe now. Send on WhatsApp or print them all." actions={<>
        <Button variant="secondary" loading={printing} disabled={!settled || !rows.length} onClick={print}>{printing ? null : <Printer className="h-4 w-4" />} {printLabel}</Button>
        <Button disabled={!settled || !canSend || !targets.rows.length} title={!canSend ? "Needs the Send Account Bill permission" : !targets.rows.length ? "Nobody on this list owes money" : undefined} onClick={openSend}>
          <Send className="h-4 w-4" /> {targets.selected ? `Send to selected (${targets.rows.length})` : "Send bills"}
        </Button>
      </>} />
      <FilterBar>
        <PeriodPicker value={period} onChange={setPeriod} />
        <SearchInput value={q} onChange={setQ} placeholder="Name, khata no, roll or room" />
        <div className="w-48" title="Only customers who owe at least this much at the end of the period"><MoneyInput value={minBalance} min={0} placeholder="Owes at least" aria-label="Owes at least" onChange={(v) => setMinBalance(Math.max(0, v))} /></div>
        <Checkbox label="Include customers with nothing on account" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
      </FilterBar>
      <Cards>
        <SummaryCard label="Customers" value={data?.totals.customers ?? 0} sub={`${owing} owe money`} />
        <SummaryCard label="Total due" value={formatMoney(data?.totals.due_minor)} sub={label} tone="warning" />
        <SummaryCard label="Purchases" value={formatMoney(data?.totals.charges_minor)} sub="On account in the period" tone="neutral" />
        <SummaryCard label="Payments" value={formatMoney(data?.totals.payments_minor)} sub="Received in the period" tone="success" />
      </Cards>
      {lastRun ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-5 py-3 text-sm">
          <History className="h-4 w-4 text-fg-secondary" />
          <span>Last sent {formatDateTime(lastRun.created_at)}, bills for {periodLabel(runPeriod(lastRun))} ({triggerLabel(lastRun.trigger).toLowerCase()}):</span>
          {lastRun.status === "running" ? <Badge variant="info">Sending</Badge> : null}
          <Badge variant="success">{lastRun.sent_count} sent</Badge>
          {lastRun.failed_count ? <Badge variant="danger">{lastRun.failed_count} failed</Badge> : null}
          {lastRun.skipped_count ? <Badge variant="warning">{lastRun.skipped_count} without a phone</Badge> : null}
          <Button size="sm" variant="ghost" onClick={() => setRunId(lastRun.id)}>Details</Button>
        </div>
      ) : null}
      {chosen.length ? (
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span className="font-medium">{chosen.length} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      ) : null}
      {bad ? <ErrorState message={bad} /> : list.isLoading ? <Loading label="Building the bills" /> : list.error ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
        <div className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")}>
          <Table>
            <THead>
              <tr>
                <TH className="w-10"><input type="checkbox" className={checkbox} aria-label="Select every customer shown" checked={allChosen} disabled={!rows.length}
                  ref={(el) => { if (el) el.indeterminate = chosen.length > 0 && !allChosen; }} onChange={() => setSelected(toggleAll(selected, ids))} /></TH>
                <TH>Khata No.</TH><TH>Customer</TH><TH>Roll / room</TH><TH right>Previous balance</TH><TH right>Purchases</TH><TH right>Payments</TH><TH right>Amount due</TH><TH>Phones</TH><TH right></TH>
              </tr>
            </THead>
            <TBody>
              {rows.length ? rows.map((r) => {
                const c = r.customer;
                const closing = r.closing_balance_minor;
                return (
                  <TR key={c.id} className={selected.has(c.id) ? "bg-primary-soft/40 even:bg-primary-soft/40" : undefined}>
                    <TD className="w-10"><input type="checkbox" className={checkbox} aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={() => setSelected(toggleId(selected, c.id))} /></TD>
                    <TD className="font-mono text-xs text-fg-secondary">{c.khata_no ?? "-"}</TD>
                    <TD className="whitespace-nowrap"><Link href={`/admin/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link></TD>
                    <TD className="whitespace-nowrap text-fg-secondary">{[c.member_no ? `Roll ${c.member_no}` : null, c.room ? `Room ${c.room}` : null].filter(Boolean).join(" · ") || "-"}</TD>
                    <TD right>{formatMoney(r.brought_forward_minor)}</TD>
                    <TD right>{r.totals.charges_minor ? formatMoney(r.totals.charges_minor) : <span className="text-fg-muted">-</span>}</TD>
                    <TD right className={r.totals.payments_minor ? "text-success" : undefined}>{r.totals.payments_minor ? formatMoney(r.totals.payments_minor) : <span className="text-fg-muted">-</span>}</TD>
                    <TD right title={billLines(r).map((l) => `${l.label}: ${formatMoney(l.amount_minor)}`).join("\n")}>
                      {closing > 0 ? <span className="font-semibold text-danger">{formatMoney(closing)}</span> : closing < 0 ? <span className="text-success">{formatMoney(-closing)} in advance</span> : <span className="text-fg-muted">Settled</span>}
                    </TD>
                    <TD className="max-w-56 truncate text-xs text-fg-secondary" title={r.phones.join(", ")}>{r.phones.length ? r.phones.join(", ") : <Badge variant="warning">No phone</Badge>}</TD>
                    <TD right><BillActions customer={c} period={period} variant="icons" className="flex-nowrap justify-end gap-0.5" /></TD>
                  </TR>
                );
              }) : <EmptyRow colSpan={10}>{dq || dMin > 0 ? "No customer matches the search and minimum." : `Nobody has anything on account for ${label}.`}</EmptyRow>}
            </TBody>
          </Table>
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Bills sent</CardTitle><span className="text-xs text-fg-muted">Automatic month-end sends and sends by staff</span></CardHeader>
          <CardBody className="p-0">
            {runs.isLoading ? <Loading /> : runs.error ? <div className="p-5"><ErrorState message={errorMessage(runs.error)} onRetry={() => runs.refetch()} /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-table-head text-left text-[13px] font-semibold text-heading"><tr><th className="h-10 px-5">Sent</th><th className="h-10 px-3">Bills for</th><th className="h-10 px-3 text-right">Sent</th><th className="h-10 px-3 text-right">Failed</th><th className="h-10 px-5 text-right">No phone</th></tr></thead>
                <tbody>
                  {runs.data?.length ? runs.data.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-t hover:bg-table-hover" tabIndex={0} aria-label={`Bills for ${periodLabel(runPeriod(r))}, sent ${formatDateTime(r.created_at)}`}
                      onClick={() => setRunId(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRunId(r.id); } }}>
                      <td className="h-10 px-5"><div className="whitespace-nowrap">{formatDateTime(r.created_at)}</div><div className="text-xs text-fg-muted">{triggerLabel(r.trigger)}{r.status === "running" ? " · sending" : ""}</div></td>
                      <td className="h-10 px-3">{periodLabel(runPeriod(r))}</td>
                      <td className="h-10 px-3 text-right tabular">{r.sent_count}</td>
                      <td className={cn("h-10 px-3 text-right tabular", r.failed_count ? "font-medium text-danger" : "text-fg-muted")}>{r.failed_count}</td>
                      <td className={cn("h-10 px-5 text-right tabular", r.skipped_count ? "text-warning-ink" : "text-fg-muted")}>{r.skipped_count}</td>
                    </tr>
                  )) : <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-fg-muted">No bills sent yet.</td></tr>}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
        {settingKeys?.length && can("settings.manage") ? <SettingsScreenCard screen="Customer Accounts" keys={settingKeys} /> : null}
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Send bills on WhatsApp" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button><Button loading={sendRun.isPending} disabled={!targets.rows.length} onClick={() => sendRun.mutate(targets.rows.map((r) => r.customer.id))}>{sendRun.isPending ? null : <Send className="h-4 w-4" />} Send {targets.rows.length} {targets.rows.length === 1 ? "bill" : "bills"}</Button></>}>
        <div className="space-y-3 text-sm">
          <p>
            The bill for <b>{label}</b> goes to {targets.selected ? <>the <b>{targets.rows.length}</b> customers you selected.</> : <>the <b>{targets.rows.length}</b> customers on this list who owe {minDue > 100 ? <>at least <b>{formatMoney(minDue)}</b> (the minimum in the settings)</> : "money"}.</>}
            {" "}Each bill goes to the customer&apos;s phone and, when set, the guardian&apos;s, with a link to view and download it.
          </p>
          {noPhone ? <p className="rounded-md bg-warning-soft px-3 py-2 text-warning-ink">{noPhone} of them {noPhone === 1 ? "has" : "have"} no phone and will be skipped.</p> : null}
          <Field label="Due date" hint="Printed on every bill. Leave blank to use the due days from the settings."><Input type="date" value={dueOn} min={period.to} onChange={(e) => setDueOn(e.target.value)} /></Field>
          {sendRun.isPending ? <p className="text-xs text-fg-muted">Sending one by one. This can take a minute for a long list.</p> : null}
        </div>
      </Dialog>
      <RunDialog run={shownRun} open={!!shownRun} onClose={() => setResult(null)} title="Bills sent" />
      <RunDetail id={runId} onClose={() => setRunId(null)} />
    </>
  );
}

function RunDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["bill_run", id], queryFn: () => api<BillRun>(`/bill_runs/${id}`), enabled: !!id });
  return <RunDialog run={q.data ?? null} open={!!id} onClose={onClose} loading={q.isLoading} error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} />;
}

function RunDialog({ run, open, onClose, title, loading, error, onRetry }: { run: BillRun | null; open: boolean; onClose: () => void; title?: string; loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const results = run?.results ?? [];
  const c = runCounts(results);
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={title ?? (run ? `Bills for ${periodLabel(runPeriod(run))}` : "Bills sent")}
      description={run ? `${triggerLabel(run.trigger)} on ${formatDateTime(run.created_at)}, bills for ${periodLabel(runPeriod(run))}.` : undefined}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={onRetry} /> : run ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{c.sent} sent</Badge>
            <Badge variant={c.failed ? "danger" : "neutral"}>{c.failed} failed</Badge>
            <Badge variant={c.skipped ? "warning" : "neutral"}>{c.skipped} without a phone</Badge>
          </div>
          {c.failed ? <p className="text-xs text-fg-muted">Failed bills can be sent again from the customer&apos;s row; the reason is shown below.</p> : null}
          <BillRunResults results={results} />
        </div>
      ) : null}
    </Dialog>
  );
}
