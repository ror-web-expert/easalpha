"use client";
import { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Download, ExternalLink, Eye, Send } from "lucide-react";
import { api, API_URL, ApiError, errorCode, errorMessage } from "@/lib/api";
import type { BillRunResult, Customer, CustomerAdjustment, CustomerBill, DuplicateCustomer } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useAuthStore, useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { useApproval } from "@/components/approval";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, ErrorState, Field, Input, Loading, MoneyInput, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import {
  accountPhones, balanceText, billEntryLabel, billFileName, billLines, closingMessage, duplicateQuery, entryDay, entryDetails, entryKindLabel, entryKindVariant, isApprovalCancelled,
  isFutureDay, openingAmount, periodError, periodFor, periodLabel, periodQuery, presetOf, runStatusLabel, runStatusVariant, sendErrorText, signedAmount, signedMoney,
  type Direction, type DuplicateFields, type Period, type PeriodPreset,
} from "./customer-accounts-helpers";

// Customer accounts (khata) building blocks shared by the customer, ledger, account and monthly bills screens:
// opening balances, balance adjustments and their reversals (each may need a manager PIN), the possible-duplicates
// panel, bill actions (view, PDF, WhatsApp) and the bill itself, which the public bill page renders too.

/** Who may send bills on WhatsApp (the API's SEND list). */
export const SEND_BILL_PERMS = ["SEND_ACCOUNT_BILL", "CUSTOMER_ACCOUNT", "customers.manage"];

/** Every query that shows a balance, refreshed after an account change. */
const ACCOUNT_KEYS = ["ledger", "customer", "customers", "customer_adjustments", "ledger_summary", "customer_bills", "customer_bill", "customer_search", "aging", "customer_insights"];

export function useRefreshAccounts() {
  const qc = useQueryClient();
  return useCallback(() => ACCOUNT_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] })), [qc]);
}

/** Runs an API call; when it answers approval.required, asks for a manager PIN and retries with approver_pin.
 *  Returns null on failure (after a toast) or when the PIN dialog is closed. */
export function usePinRetry() {
  const { run, dialog } = useApproval();
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async <T,>(fn: (pin?: string) => Promise<T>, opts: { label: string; success?: string; failure?: string }): Promise<T | null> => {
    setBusy(true);
    try {
      const out = await run(fn, opts.label);
      if (opts.success) toast.success(opts.success);
      return out;
    } catch (e) {
      if (!isApprovalCancelled(e)) toast.error(opts.failure ?? "Could not save", errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [run]);
  return { submit, busy, dialog };
}

/** Fetches a PDF with the admin token and saves it. Arrays go as key[]=a&key[]=b. A stale token is refreshed once. */
export async function downloadPdf(path: string, query: Record<string, string | string[] | undefined>, fallbackName: string) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(`${k}[]`, x));
    else if (v) params.set(k, v);
  }
  const qs = params.toString();
  const get = () => {
    const s = useAuthStore.getState();
    const headers: Record<string, string> = {};
    if (s.session?.access_token) headers.Authorization = `Bearer ${s.session.access_token}`;
    if (s.branchId) headers["X-Branch-Id"] = s.branchId;
    return fetch(`${API_URL}${path}${qs ? `?${qs}` : ""}`, { headers });
  };
  let res: Response;
  try {
    res = await get();
    if (res.status === 401) {
      await api("/me", { auth: "admin" }).catch(() => null);
      res = await get();
    }
  } catch {
    throw new ApiError("network", "Cannot reach the server", 0);
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    let msg = res.statusText || "Download failed";
    try { const body = await res.json(); code = body?.error?.code ?? code; msg = body?.error?.message ?? msg; } catch { /* not JSON */ }
    throw new ApiError(code, msg, res.status);
  }
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Period picker ----

/** Preset (last month, this month, all time) plus two dates. */
export function PeriodPicker({ value, onChange, allowAll, className }: { value: Period; onChange: (p: Period) => void; allowAll?: boolean; className?: string }) {
  const [custom, setCustom] = useState(false);
  const preset: PeriodPreset = custom ? "custom" : presetOf(value);
  const err = periodError(value);
  const pick = (v: PeriodPreset) => {
    if (v === "custom") { setCustom(true); if (!value.from && !value.to) onChange(periodFor("this_month")); return; }
    setCustom(false);
    onChange(periodFor(v));
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select className="w-auto" value={preset} onChange={(e) => pick(e.target.value as PeriodPreset)} aria-label="Period">
        <option value="last_month">Last month</option>
        <option value="this_month">This month</option>
        {allowAll ? <option value="all">All time</option> : null}
        <option value="custom">Choose dates</option>
      </Select>
      {preset !== "all" ? (
        <>
          <Input type="date" className="w-auto" value={value.from} onChange={(e) => { setCustom(true); onChange({ ...value, from: e.target.value }); }} aria-label="From" />
          <span className="text-xs text-fg-muted">to</span>
          <Input type="date" className="w-auto" value={value.to} onChange={(e) => { setCustom(true); onChange({ ...value, to: e.target.value }); }} aria-label="To" />
        </>
      ) : null}
      {err ? <span className="text-xs text-danger">{err}</span> : null}
    </div>
  );
}

// ---- Opening balance, adjustments, reversals ----

type AccountCustomer = Pick<Customer, "id" | "name" | "balance_minor">;
type AdjustmentResult = { adjustment: CustomerAdjustment; customer: Customer };

export function useAdjustments(customerId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["customer_adjustments", customerId],
    queryFn: () => api<{ data: CustomerAdjustment[]; open_opening: CustomerAdjustment | null }>(`/customers/${customerId}/adjustments`),
    enabled: !!customerId && enabled,
  });
}

export function AdjustBalanceDialog({ customer, open, onClose }: { customer: AccountCustomer | null; open: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<Direction>("increase");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(isoDay());
  useEffect(() => { if (open) { setDirection("increase"); setAmount(0); setReason(""); setOn(isoDay()); } }, [open]);
  const { submit, busy, dialog } = usePinRetry();
  const refresh = useRefreshAccounts();
  if (!customer) return null;
  const signed = signedAmount(direction, amount);
  const future = isFutureDay(on);
  const save = async () => {
    const out = await submit(
      (pin) => api<AdjustmentResult>(`/customers/${customer.id}/adjustments`, { method: "POST", body: { kind: "adjustment", amount_minor: signed, reason: reason.trim(), effective_on: on || undefined, approver_pin: pin } }),
      { label: `${direction === "increase" ? "Increase" : "Decrease"} ${customer.name}'s balance by ${formatMoney(amount)}`, success: "Balance adjusted", failure: "Could not adjust the balance" },
    );
    if (out) { refresh(); onClose(); }
  };
  return (
    <>
      <Dialog open={open} onClose={onClose} title="Adjust balance" size="sm"
        description={`${customer.name}: ${balanceText(customer.balance_minor)}. The change is saved with your name and the reason. A mistake is reversed, not edited.`}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={amount <= 0 || !reason.trim() || future} onClick={save}>Save adjustment</Button></>}>
        <div className="space-y-3">
          <Field label="Change">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="increase">Increase: the customer owes more</option>
              <option value="decrease">Decrease: the customer owes less</option>
            </Select>
          </Field>
          <Field label="Amount"><MoneyInput value={amount} onChange={(v) => setAmount(Math.abs(v))} min={0} autoFocus /></Field>
          <Field label="Reason" hint="Required. Shown on the ledger and the bill."><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Charged twice, mess fee, discount agreed" /></Field>
          <Field label="Date" error={future ? "The date cannot be in the future" : undefined}><Input type="date" value={on} max={isoDay()} onChange={(e) => setOn(e.target.value)} /></Field>
          {amount > 0 ? <p className="text-xs text-fg-muted">Balance after: <span className="font-medium text-fg tabular">{balanceText(customer.balance_minor + signed)}</span></p> : null}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}

export function OpeningBalanceDialog({ customer, open, onClose }: { customer: AccountCustomer | null; open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState(0);
  const [advance, setAdvance] = useState(false);
  const [reason, setReason] = useState("Opening balance");
  const [on, setOn] = useState(isoDay());
  useEffect(() => { if (open) { setAmount(0); setAdvance(false); setReason("Opening balance"); setOn(isoDay()); } }, [open]);
  const { submit, busy, dialog } = usePinRetry();
  const refresh = useRefreshAccounts();
  if (!customer) return null;
  const signed = openingAmount(amount, advance);
  const future = isFutureDay(on);
  const save = async () => {
    const out = await submit(
      (pin) => api<AdjustmentResult>(`/customers/${customer.id}/adjustments`, { method: "POST", body: { kind: "opening", amount_minor: signed, reason: reason.trim() || "Opening balance", effective_on: on || undefined, approver_pin: pin } }),
      { label: `Opening balance ${formatMoney(amount)}${advance ? " in advance" : ""} for ${customer.name}`, success: "Opening balance saved", failure: "Could not save the opening balance" },
    );
    if (out) { refresh(); onClose(); }
  };
  return (
    <>
      <Dialog open={open} onClose={onClose} title="Opening balance" size="sm"
        description={`What ${customer.name} already owed before this system, for example from the paper register. A customer has one opening balance; reverse it to enter it again.`}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={amount <= 0 || future} onClick={save}>Save opening balance</Button></>}>
        <div className="space-y-3">
          <Field label="Amount"><MoneyInput value={amount} onChange={(v) => setAmount(Math.abs(v))} min={0} autoFocus /></Field>
          <Field label="This amount is">
            <Select value={advance ? "advance" : "owes"} onChange={(e) => setAdvance(e.target.value === "advance")}>
              <option value="owes">Owed by the customer</option>
              <option value="advance">Paid in advance by the customer</option>
            </Select>
          </Field>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Date" hint="The day the balance counts from." error={future ? "The date cannot be in the future" : undefined}><Input type="date" value={on} max={isoDay()} onChange={(e) => setOn(e.target.value)} /></Field>
          {amount > 0 ? <p className="text-xs text-fg-muted">Balance after: <span className="font-medium text-fg tabular">{balanceText(customer.balance_minor + signed)}</span></p> : null}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}

/** What a reversal needs to know about the row it undoes; a ledger entry or an adjustment both fit. */
export interface ReversibleAdjustment { id: string; label?: string | null; kind: string; amount_minor: number; reason?: string | null }

export function ReverseAdjustmentDialog({ adjustment, onClose }: { adjustment: ReversibleAdjustment | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (adjustment) setReason(""); }, [adjustment]);
  const { submit, busy, dialog } = usePinRetry();
  const refresh = useRefreshAccounts();
  const a = adjustment;
  const save = async () => {
    if (!a) return;
    const out = await submit(
      (pin) => api<AdjustmentResult>(`/customer_adjustments/${a.id}/reverse`, { method: "POST", body: { reason: reason.trim(), approver_pin: pin } }),
      { label: `Reverse ${a.label ?? entryKindLabel(a.kind)} (${signedMoney(a.amount_minor)})`, success: "Reversed", failure: "Could not reverse" },
    );
    if (out) { refresh(); onClose(); }
  };
  return (
    <>
      <Dialog open={!!a} onClose={onClose} title={`Reverse ${a?.label ?? "entry"}`} size="sm"
        description="A new entry of the opposite amount is added today. The original stays on the ledger, marked reversed."
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="destructive" loading={busy} disabled={!reason.trim()} onClick={save}>Reverse</Button></>}>
        {a ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="font-medium">{entryKindLabel(a.kind)}</span><span className="font-semibold tabular">{signedMoney(a.amount_minor)}</span></div>
              {a.reason ? <div className="mt-0.5 text-fg-secondary">{a.reason}</div> : null}
            </div>
            <Field label="Why is it being reversed?" hint="Required."><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entered twice, wrong customer" autoFocus /></Field>
          </div>
        ) : null}
      </Dialog>
      {dialog}
    </>
  );
}

/** Opening balances, adjustments and reversals of one customer, newest first, with Reverse. */
export function AdjustmentsTable({ rows, onReverse }: { rows: CustomerAdjustment[]; onReverse?: (a: CustomerAdjustment) => void }) {
  return (
    <Table compact>
      <THead><tr><TH>Date</TH><TH>No.</TH><TH>Kind</TH><TH>Reason</TH><TH right>Amount</TH><TH></TH></tr></THead>
      <TBody>
        {rows.length ? rows.map((a) => (
          <TR key={a.id} className={a.reversed ? "text-fg-muted" : undefined}>
            <TD className="whitespace-nowrap text-fg-secondary">{formatDate(a.effective_on)}</TD>
            <TD className="font-mono text-xs">{a.label}</TD>
            <TD className="whitespace-nowrap"><Badge variant={entryKindVariant(a.kind)}>{entryKindLabel(a.kind)}</Badge>{a.reversed ? <Badge variant="outline" className="ml-1.5">Reversed{a.reversed_by_label ? ` by ${a.reversed_by_label}` : ""}</Badge> : null}</TD>
            <TD className="max-w-80 truncate" title={a.reason}>{a.kind === "reversal" && a.reverses_label ? <span className="mr-1 font-mono text-xs text-fg-muted">{a.reverses_label}:</span> : null}{a.reason}</TD>
            <TD right className={cn("font-medium", a.reversed && "line-through", !a.reversed && (a.amount_minor < 0 ? "text-success" : "text-danger"))}>{signedMoney(a.amount_minor)}</TD>
            <TD right>{onReverse && a.kind !== "reversal" && !a.reversed ? <Button size="sm" variant="ghost" onClick={() => onReverse(a)}>Reverse</Button> : null}</TD>
          </TR>
        )) : <EmptyRow colSpan={6}>No opening balance or adjustments yet.</EmptyRow>}
      </TBody>
    </Table>
  );
}

// ---- Possible duplicates ----

/** Shown while a customer is typed in: people who may already be on file, with why. Saving is still allowed. */
export function DuplicateWarning({ fields, excludeId, showBalance = true, className }: { fields: DuplicateFields; excludeId?: string; showBalance?: boolean; className?: string }) {
  const query = duplicateQuery(fields, excludeId);
  const key = useDebounced(query ? JSON.stringify(query) : "", 400);
  const q = useQuery({
    queryKey: ["customer_duplicates", key],
    queryFn: ({ signal }) => api<{ data: DuplicateCustomer[] }>("/customers/duplicates", { query: JSON.parse(key) as Record<string, string>, signal }),
    enabled: !!key,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    select: (r) => r.data,
  });
  const rows = key && query ? q.data ?? [] : [];
  if (!rows.length) return null;
  return (
    <div className={cn("w-full rounded-xl border border-warning/40 bg-warning-soft/50 px-3 py-2 text-left", className)} role="status">
      <div className="flex items-center gap-2 text-sm font-semibold text-warning-ink"><AlertTriangle className="h-4 w-4" /> Possible duplicates ({rows.length})</div>
      <p className="text-xs text-fg-secondary">Check these before saving. If it is a different person, you can still save.</p>
      <ul className="mt-1 max-h-40 divide-y overflow-y-auto">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2">
                <a href={`/admin/customers/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{d.name}<ExternalLink className="h-3 w-3" /></a>
                {d.khata_no ? <span className="font-mono text-xs text-fg-muted">Khata {d.khata_no}</span> : null}
                {d.member_no ? <span className="text-xs text-fg-secondary">Roll {d.member_no}</span> : null}
                {d.room ? <span className="text-xs text-fg-secondary">Room {d.room}</span> : null}
                {d.phone ? <span className="text-xs text-fg-secondary">{d.phone}</span> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">{d.reasons.map((r) => <Badge key={r} variant="warning">{r}</Badge>)}</div>
            </div>
            {showBalance ? <span className="shrink-0 text-xs font-medium tabular">{balanceText(d.balance_minor)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Bills ----

type BillCustomer = Pick<Customer, "id" | "name" | "khata_no"> & { phone?: string | null; guardian_phone?: string | null; notify_guardian?: boolean | null };
interface SendBillResult { sent: number; to: string[]; statuses: (string | null)[] }

/** Send, download and view one customer's bill for a period. */
export function useBillCommands(customer: BillCustomer, period: Period, onResult?: (message: string, ok: boolean) => void) {
  const can = useCan();
  const canSend = can(...SEND_BILL_PERMS);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const usable = !periodError(period) && !!period.from && !!period.to;
  const send = useMutation({
    mutationFn: () => api<SendBillResult>(`/customers/${customer.id}/send_bill`, { method: "POST", body: periodQuery(period), timeoutMs: 60_000 }),
    onSuccess: (r) => {
      setConfirming(false);
      const msg = r.to.length ? `Bill for ${periodLabel(period)} sent on WhatsApp to ${r.to.join(", ")}.` : "Bill sent.";
      toast.success("Bill sent", msg);
      onResult?.(msg, true);
    },
    onError: (e) => {
      setConfirming(false);
      const msg = sendErrorText(errorCode(e), errorMessage(e), customer.name);
      toast.error("Bill not sent", msg);
      onResult?.(msg, false);
    },
  });
  const download = async () => {
    setDownloading(true);
    try { await downloadPdf(`/customers/${customer.id}/bill.pdf`, periodQuery(period), billFileName(customer.khata_no, period.to)); }
    catch (e) { toast.error("Could not download the bill", errorMessage(e)); }
    finally { setDownloading(false); }
  };
  const phones = accountPhones(customer);
  const confirm = (
    <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={() => send.mutate()} loading={send.isPending} confirmLabel="Send"
      title="Send bill on WhatsApp"
      description={`Send ${customer.name}'s bill for ${periodLabel(period)}${phones.length ? ` to ${phones.join(" and ")}` : ""}? It has a link to view and download the bill.`} />
  );
  return { canSend, usable, download, downloading, askSend: () => setConfirming(true), sending: send.isPending, confirm };
}

/** View bill, Download PDF and Send on WhatsApp. With `picker`, the period is chosen here (last month by default);
 *  otherwise it comes from the screen. `icons` is the compact form for table rows. */
export function BillActions({ customer, period, picker, variant = "buttons", labels, onResult, className }: {
  customer: BillCustomer; period?: Period; picker?: boolean; variant?: "buttons" | "icons";
  labels?: { view?: string; download?: string; send?: string }; onResult?: (message: string, ok: boolean) => void; className?: string;
}) {
  const [own, setOwn] = useState<Period>(() => periodFor("last_month"));
  const p = picker || !period ? own : period;
  const [viewing, setViewing] = useState(false);
  const cmd = useBillCommands(customer, p, onResult);
  const sendTitle = !cmd.canSend ? "Needs the Send Account Bill permission" : undefined;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {picker ? <PeriodPicker value={own} onChange={setOwn} /> : null}
      {variant === "icons" ? (
        <>
          <Button size="icon-sm" variant="ghost" title="View bill" aria-label={`View ${customer.name}'s bill`} disabled={!cmd.usable} onClick={() => setViewing(true)}><Eye className="h-4 w-4" /></Button>
          <Button size="icon-sm" variant="ghost" title="Download PDF" aria-label={`Download ${customer.name}'s bill`} disabled={!cmd.usable} loading={cmd.downloading} onClick={cmd.download}>{cmd.downloading ? null : <Download className="h-4 w-4" />}</Button>
          <Button size="icon-sm" variant="ghost" title={sendTitle ?? "Send on WhatsApp"} aria-label={`Send ${customer.name}'s bill`} disabled={!cmd.usable || !cmd.canSend} loading={cmd.sending} onClick={cmd.askSend}>{cmd.sending ? null : <Send className="h-4 w-4" />}</Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="secondary" disabled={!cmd.usable} onClick={() => setViewing(true)}><Eye className="h-4 w-4" /> {labels?.view ?? "View bill"}</Button>
          <Button size="sm" variant="secondary" disabled={!cmd.usable} loading={cmd.downloading} onClick={cmd.download}>{cmd.downloading ? null : <Download className="h-4 w-4" />} {labels?.download ?? "Download PDF"}</Button>
          <Button size="sm" variant="secondary" disabled={!cmd.usable || !cmd.canSend} title={sendTitle} loading={cmd.sending} onClick={cmd.askSend}>{cmd.sending ? null : <Send className="h-4 w-4" />} {labels?.send ?? "Send on WhatsApp"}</Button>
        </>
      )}
      {cmd.confirm}
      <BillDialog customer={customer} period={p} open={viewing} onClose={() => setViewing(false)} commands={cmd} />
    </div>
  );
}

/** The bill as the customer sees it, with its link, PDF and Send. */
export function BillDialog({ customer, period, open, onClose, commands }: { customer: BillCustomer; period: Period; open: boolean; onClose: () => void; commands: ReturnType<typeof useBillCommands> }) {
  const q = useQuery({
    queryKey: ["customer_bill", customer.id, period.from, period.to],
    queryFn: () => api<CustomerBill>(`/customers/${customer.id}/bill`, { query: periodQuery(period) }),
    enabled: open && commands.usable,
  });
  const link = q.data?.link;
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); } catch { toast.error("Could not copy", link); }
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`Bill: ${customer.name}`} description={periodLabel(period)}
      footer={<>
        {link ? <Button variant="ghost" onClick={copy}><Copy className="h-4 w-4" /> Copy link</Button> : null}
        {link ? <a href={link} target="_blank" rel="noreferrer"><Button variant="ghost"><ExternalLink className="h-4 w-4" /> Open link</Button></a> : null}
        <Button variant="secondary" loading={commands.downloading} onClick={commands.download}>{commands.downloading ? null : <Download className="h-4 w-4" />} Download PDF</Button>
        <Button disabled={!commands.canSend} loading={commands.sending} onClick={commands.askSend}>{commands.sending ? null : <Send className="h-4 w-4" />} Send on WhatsApp</Button>
      </>}>
      {q.isLoading ? <Loading label="Loading the bill" /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.data ? <BillDocument bill={q.data} className="rounded-2xl border p-4 sm:p-6" /> : null}
    </Dialog>
  );
}

/** The bill: business, bill number and period, the customer, the summary, every entry and what to pay. */
export function BillDocument({ bill, className }: { bill: CustomerBill; className?: string }) {
  const cur = bill.business.currency || "PKR";
  const m = (v: number) => formatMoney(v, cur);
  const closing = bill.closing_balance_minor;
  const c = bill.customer;
  const details: { label: string; value: string | number | null }[] = [
    { label: "Khata No.", value: c.khata_no },
    { label: "Roll / ID", value: c.member_no },
    { label: "Room", value: c.room },
    { label: "Phone", value: c.phone },
    { label: "Guardian", value: [c.guardian_name, c.guardian_phone].filter(Boolean).join(", ") || null },
  ].filter((d) => d.value !== null && d.value !== "");
  return (
    <article className={cn("bg-card text-fg", className)}>
      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-7 text-heading">{bill.business.name}</h2>
          {bill.business.address ? <p className="text-sm text-fg-secondary">{bill.business.address}</p> : null}
          {bill.business.phone ? <p className="text-sm text-fg-secondary">{bill.business.phone}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.04em] text-fg-muted">Bill</div>
          <div className="font-mono text-sm font-semibold">{bill.number}</div>
          <div className="text-xs text-fg-secondary">{formatDate(bill.bill_date)}</div>
        </div>
      </header>
      <section className="grid gap-3 border-b py-4 sm:grid-cols-2">
        <div className="rounded-xl bg-muted px-4 py-3">
          <div className="text-base font-semibold text-heading">{c.name}</div>
          <dl className="mt-1 space-y-0.5 text-sm">
            {details.map((d) => <div key={d.label} className="flex justify-between gap-3"><dt className="text-fg-secondary">{d.label}</dt><dd className="text-right font-medium">{d.value}</dd></div>)}
          </dl>
        </div>
        <dl className="space-y-1 text-sm sm:py-3">
          <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Bill for</dt><dd className="text-right font-semibold">{bill.period_label}</dd></div>
          {/* A month reads "September 2026" above; any other period is already its dates, so they are not repeated. */}
          {bill.period_label !== `${formatDate(bill.from)} to ${formatDate(bill.to)}` ? <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Period</dt><dd className="text-right">{formatDate(bill.from)} to {formatDate(bill.to)}</dd></div> : null}
          {bill.due_on ? <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Due date</dt><dd className="text-right font-semibold">{formatDate(bill.due_on)}</dd></div> : null}
        </dl>
      </section>
      <section className="border-b py-4">
        <dl className="space-y-1.5 text-sm">
          {billLines(bill).map((l) => (
            <div key={l.key} className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{l.label}</dt>
              <dd className="font-medium tabular">{l.key === "previous" ? m(l.amount_minor) : signedMoney(l.amount_minor, cur)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-end justify-between gap-3 rounded-xl bg-primary-soft px-4 py-3 text-primary-ink">
          <span className="text-sm font-semibold">{closing < 0 ? "In advance" : "Amount due"}</span>
          <span className="text-2xl font-bold tabular">{m(Math.abs(closing))}</span>
        </div>
      </section>
      <section className="py-4">
        <h3 className="mb-2 text-sm font-semibold text-heading">Entries</h3>
        {bill.entries.length ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-fg-muted"><th className="py-1.5 pr-2 font-medium">Date</th><th className="py-1.5 pr-2 font-medium">Details</th><th className="py-1.5 text-right font-medium">Amount</th><th className="hidden py-1.5 pl-3 text-right font-medium sm:table-cell">Balance</th></tr></thead>
            <tbody>
              {bill.entries.map((e, i) => {
                const detail = entryDetails(e);
                return (
                  <tr key={`${e.ref}-${i}`} className="border-b align-top last:border-b-0">
                    <td className="whitespace-nowrap py-2 pr-2 text-fg-secondary">{formatDate(entryDay(e))}</td>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{billEntryLabel(e.kind)}{e.order_label ? <span className="ml-1.5 font-mono text-xs text-fg-muted">{e.order_label}</span> : e.label ? <span className="ml-1.5 font-mono text-xs text-fg-muted">{e.label}</span> : null}{e.reversed ? <span className="ml-1.5 text-xs text-fg-muted">(reversed)</span> : null}</div>
                      {detail ? <div className="text-xs text-fg-secondary">{detail}</div> : null}
                    </td>
                    <td className={cn("whitespace-nowrap py-2 text-right font-medium tabular", e.amount_minor < 0 && "text-success")}>{signedMoney(e.amount_minor, cur)}</td>
                    <td className="hidden whitespace-nowrap py-2 pl-3 text-right tabular text-fg-secondary sm:table-cell">{m(e.balance_minor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-sm text-fg-muted">No purchases or payments in this period.</p>}
      </section>
      <footer className="border-t pt-4 text-center">
        <p className="text-base font-semibold text-heading">{closingMessage(bill, cur)}</p>
        {bill.business.footer ? <p className="mt-1 text-sm text-fg-secondary">{bill.business.footer}</p> : null}
      </footer>
    </article>
  );
}

/** Who got a bill, who did not and why. */
export function BillRunResults({ results }: { results: BillRunResult[] }) {
  return (
    <Table compact>
      <THead><tr><TH>Khata</TH><TH>Customer</TH><TH>Result</TH><TH>Sent to / reason</TH><TH right>Due</TH></tr></THead>
      <TBody>
        {results.length ? results.map((r) => (
          <TR key={r.customer_id}>
            <TD className="font-mono text-xs text-fg-secondary">{r.khata_no}</TD>
            <TD className="font-medium">{r.name}</TD>
            <TD><Badge variant={runStatusVariant(r.status)}>{runStatusLabel(r.status)}</Badge></TD>
            <TD className={cn("max-w-80 truncate text-xs", r.status === "sent" ? "text-fg-secondary" : "text-danger")} title={r.error ?? r.to?.join(", ")}>{r.status === "sent" ? (r.to ?? []).join(", ") : r.error ?? "-"}</TD>
            <TD right>{r.due_minor !== undefined ? formatMoney(r.due_minor) : "-"}</TD>
          </TR>
        )) : <EmptyRow colSpan={5}>Nobody was due a bill.</EmptyRow>}
      </TBody>
    </Table>
  );
}
