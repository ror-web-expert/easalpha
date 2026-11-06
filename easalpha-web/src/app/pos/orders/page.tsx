"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Printer, Ban, RotateCcw, Play, Pencil, Unlock, CheckCircle2 } from "lucide-react";
import { type LocalOrder } from "@/lib/db";
import { completeOrder, fetchReceipt, findLocalOrder, listLocalOrders, refreshOrdersFromServer, refundOrder, reopenOrder, resumeOrder, serverToLocal, storeServerOrder, voidOrder } from "@/lib/pos-actions";
import { isReceiptNumber, isTillSerial } from "@/lib/receipt-format";
import { defaultRefundMethod } from "@/lib/refund-method";
import { refundOffer } from "@/lib/refunds";
import { scannerConfig } from "@/lib/barcode";
import { useBarcodeScanner, playScanTone } from "@/components/pos/scanner";
import { isOnline } from "@/lib/sync";
import type { Order } from "@/lib/types";
import { businessDayFor } from "@/lib/business-day";
import { useDeviceStore, usePosCan } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { useCartStore } from "@/store/cart";
import { useSyncStore } from "@/store/sync";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Receipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { lineAmount } from "@/lib/pricing";
import { formatTime } from "@/lib/dates";
import { cn, titleCase, uuid } from "@/lib/utils";
import { hasPrinter, printJob, receiptLines } from "@/lib/print";
import { PosShell } from "@/components/pos/shell";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { ReasonDialog } from "@/components/pos/dialogs";
import { useApproval } from "@/components/approval";
import { Badge, Button, Dialog, Field, Input, MoneyInput, Select, Tabs, orderStatusVariant, orderTypeVariant, paymentStatusVariant } from "@/components/ui";
import { toast } from "@/store/toast";

const OPEN = ["draft", "held", "placed", "preparing", "ready", "served", "dispatched"];
const VOID_REASONS = ["Customer left", "Wrong order", "Duplicate", "Kitchen error", "Test order"];

/** A sale the server refused is not paid money of the business: it reads Rejected, never "Paid · Paid" beside it (QA K10). */
const rejected = (o: LocalOrder) => o.sync_status === "rejected";
const settledRow = (o: LocalOrder) => ["paid", "closed", "refunded"].includes(o.status) && !rejected(o);
/**
 * What an order is called here: its label, or, for one the server never numbered (a draft or a held order saved online
 * is "draft" there), its state and time, so held orders can be told apart (QA T13).
 */
const orderName = (o: Pick<LocalOrder, "label" | "status" | "created_at">) => (o.label && o.label !== "draft" ? o.label : `${o.status === "held" ? "Held" : "Draft"} ${formatTime(o.created_at)}`);
/** "3 items": the till's own lines when it holds them, else the count the server's order row carries ("?" was every server order). */
function itemsText(o: LocalOrder): string {
  const live = o.lines.filter((l) => l.status !== "cancelled").length;
  const n = live || o.item_count;
  return n == null ? "? items" : `${n} ${n === 1 ? "item" : "items"}`;
}
/** Open, sent, on the server and paid exactly its total: nothing is left to take, so it completes from here (QA T5). */
const finishable = (o: LocalOrder) => OPEN.includes(o.status) && !["draft", "held"].includes(o.status) && !o.local_only && !rejected(o) && o.paid_minor > 0 && o.paid_minor === o.total_minor;

function OrdersScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const branch = useDeviceStore((s) => s.branch);
  const can = usePosCan();
  const allMethods = useCatalogStore((s) => s.paymentMethods);
  const methods = useMemo(() => allMethods.filter((m) => !m.internal), [allMethods]);
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const settings = useCatalogStore((s) => s.catalog?.business.settings);
  const status = useSyncStore((s) => s.status);
  const load = useCartStore((s) => s.load);
  const { run, dialog } = useApproval();
  const day = businessDayFor(branch?.day_end_time);
  const [rows, setRows] = useState<LocalOrder[]>([]);
  const [tab, setTab] = useState<"open" | "paid" | "all">(params.get("held") ? "open" : "open");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<LocalOrder | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  // id: one refund id per opening of the dialog, sent with every try (web-till#5).
  const [refund, setRefund] = useState<{ id: string; amount: number; method: string; reason: string } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The local list cannot be read where IndexedDB is unavailable (some private windows): it stays as it was.
  const reload = useCallback(async () => { try { setRows(await listLocalOrders(day)); } catch {} }, [day]);
  // Review R31: whatever fails, the Refresh button stops spinning.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshOrdersFromServer(day); await reload(); } finally { setRefreshing(false); }
  }, [day, reload]);
  useEffect(() => { reload(); refresh(); }, [reload, refresh]);
  useEffect(() => { const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);

  /**
   * The receipt barcode scanned here or on the sell screen: a receipt number (yymmdd-BRANCH-serial), or the till serial
   * (T1-001) a receipt printed offline carries (QA T12). The order from the till's own list when it is today's, or
   * when the server cannot have it (not synced yet, or the till is offline), else from the server whatever day it
   * was, opened for a reprint, refund or reopen.
   */
  const openByReceipt = useCallback(async (code: string) => {
    const wanted = code.trim().toLowerCase();
    const serial = isTillSerial(code);
    const same = (o: LocalOrder) => [o.receipt_number, o.till_serial, o.label].some((v) => (v ?? "").toLowerCase() === wanted);
    const local = (await listLocalOrders(day).catch(() => [])).find(same) ?? (serial ? await findLocalOrder(code).catch(() => null) : null);
    const open = (o: LocalOrder) => { setTab("all"); setSel(o); };
    if (local && (local.business_day === day || local.local_only || !isOnline())) { open(local); return; }
    if (!isOnline()) { toast.error("Not on this till", `${code} is not in today's orders and the till is offline.`); return; }
    try {
      // A till serial names an order of any day (the counter never restarts), and the server keeps it as till_serial.
      const page = await api<{ data: Order[] }>("/orders", { auth: "pos", query: serial ? { q: code.trim(), all_days: true } : { q: code.trim() } });
      // Only the exact code: GET /orders?q= also matches customers and labels, and a scan must never open someone else's order.
      const found = page.data.find((o) => ((serial ? o.till_serial : o.receipt_number) ?? "").toLowerCase() === wanted);
      if (!found) { if (local) open(local); else toast.error("No such receipt", `No order has the receipt number ${code}.`); return; }
      // The search answers with summary rows, which carry no lines: the full order is what the dialog, a refund or a
      // reopen need (review R2). Should that call fail, the summary is stored and the lines already cached are kept.
      const full = await api<Order>(`/orders/${found.id}`, { auth: "pos" }).catch(() => found);
      setTab("all");
      setSel(await storeServerOrder(full).catch(() => serverToLocal(full)));
    } catch (e) { toast.error("Could not look up the receipt", errorMessage(e)); }
  }, [day]);
  const scanConfig = useMemo(() => scannerConfig(settings), [settings]);
  // Scans are taken while the list refreshes (review R31); an open order or receipt pauses them.
  useBarcodeScanner({ config: scanConfig, enabled: scanConfig.enabled && !sel && !receipt, onScan: (code) => {
    if (!isReceiptNumber(code)) { if (scanConfig.beep) playScanTone("unknown"); toast.error("Not a receipt", `${code} is not a receipt number. Scan the barcode at the bottom of a receipt.`); return; }
    if (scanConfig.beep) playScanTone("ok");
    void openByReceipt(code);
  } });
  const linked = params.get("receipt");
  // ?receipt= comes from a scan on the sell screen; anything not shaped like a receipt number is ignored, not searched.
  useEffect(() => { if (linked) { if (isReceiptNumber(linked)) void openByReceipt(linked); router.replace("/pos/orders"); } }, [linked, openByReceipt, router]);

  const filtered = rows.filter((o) => (tab === "open" ? OPEN.includes(o.status) : tab === "paid" ? settledRow(o) : true)).filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || (o.till_serial ?? "").toLowerCase().includes(q.toLowerCase()) || (o.customer_name ?? "").toLowerCase().includes(q.toLowerCase()) || (o.table_code ?? "").toLowerCase().includes(q.toLowerCase()));
  const openTotal = rows.filter((o) => OPEN.includes(o.status)).reduce((s, o) => s + o.total_minor, 0);
  // A paid order the server rejected (day locked, product archived) is not money the business has: it stays listed
  // under All, flagged, but is neither counted nor shown under Paid.
  const paidTotal = rows.filter((o) => ["paid", "closed"].includes(o.status) && !rejected(o)).reduce((s, o) => s + o.total_minor, 0);
  // A paid order's money, or what an open (reopened) order was paid above its total: the server completes it only once
  // that is back. Nothing for a sale the server refused: it has no money of it to give back.
  const refundable = sel && !rejected(sel) ? refundOffer(sel) : null;

  const doVoid = async (reason: string) => {
    if (!sel) return;
    setBusy(true);
    try { const r = await run((pin) => voidOrder(sel.id, reason, pin), `Void ${orderName(sel)}`); toast.success(r.offline ? "Voided on till; syncs later" : "Order voided"); setVoidOpen(false); setSel(null); reload(); }
    catch (e) { toast.error("Could not void", errorMessage(e)); }
    finally { setBusy(false); }
  };
  // Shown to every role (QA T11): the server asks for a manager's PIN when the role cannot refund, and the dialog takes it.
  const doRefund = async () => {
    if (!sel || !refund) return;
    setBusy(true);
    try {
      const r = await run((pin) => refundOrder(sel.id, refund.amount, refund.method, refund.reason, pin, refund.id), `Refund ${formatMoney(refund.amount, currency)} of ${orderName(sel)}`);
      toast.success("Refund recorded");
      setRefund(null);
      // The excess of an open order went back: it is paid in full now, and Complete is offered right here (QA T5).
      setSel(refundable?.excess && finishable(r.local) ? r.local : null);
      reload();
    } catch (e) { toast.error("Could not refund", errorMessage(e)); }
    finally { setBusy(false); }
  };
  /** An open order paid in full: completed here, its receipt shown for printing (QA T5). */
  const doComplete = async (o: LocalOrder) => {
    setBusy(true);
    try {
      const r = await completeOrder(o.id);
      toast.success(`${orderName(r.local)} completed`);
      setSel(null);
      setReceipt(r.receipt);
      reload();
    } catch (e) { toast.error("Could not complete", errorMessage(e)); }
    finally { setBusy(false); }
  };
  // SPEC reopen flow (REOPEN_ORDER): the server reopens the order, then the sell screen loads it in edit mode with the
  // reopened flags (loadOrderForEdit reads them from the server), so the catalog discounts attach as for any edit. A
  // role without REOPEN_ORDER is asked for a manager's PIN (QA T11).
  const doReopen = async (o: LocalOrder) => {
    if (status === "offline") { toast.error("Needs the internet", "Reopening an order is never queued."); return; }
    setBusy(true);
    try {
      const c = await run((pin) => reopenOrder(o.id, pin), `Reopen ${orderName(o)}`);
      toast.info(`${c.label} reopened`, "Make the changes, save them, then take payment to complete it again.");
      setSel(null);
      router.push(`/pos?order=${o.id}`);
    } catch (e) { if (!(e instanceof ApiError && e.code === "approval.cancelled")) toast.error("Could not reopen", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const openInSell = async (o: LocalOrder, resume = false) => {
    try {
      const c = resume ? await resumeOrder(o.id) : null;
      if (c) load(c); else router.push(`/pos?order=${o.id}`);
      if (c) router.push("/pos");
    } catch (e) { toast.error("Could not open", errorMessage(e)); }
  };
  const print = async (o: LocalOrder, reprint: boolean) => {
    try {
      const r = await run((pin) => fetchReceipt(o.id, reprint).then((x) => { void pin; return x; }), "Reprint receipt");
      setReceipt(r);
      // With the desktop app or a print server the duplicate goes straight to the printer; in a plain browser the dialog's Print button is the way.
      if (hasPrinter(settings)) {
        const res = await printJob({ role: "receipt", lines: receiptLines(r, { settings }) }, { settings });
        if (!res.ok) toast.error("Could not print", res.error);
      }
    } catch (e) { toast.error("No receipt", errorMessage(e)); }
  };

  return (
    <PosShell title={`Orders · ${day}`}>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2">
          <Tabs size="lg" value={tab} onChange={setTab} items={[{ value: "open", label: `Open · ${formatMoney(openTotal, currency)}`, count: rows.filter((o) => OPEN.includes(o.status)).length }, { value: "paid", label: `Paid · ${formatMoney(paidTotal, currency)}`, count: rows.filter(settledRow).length }, { value: "all", label: "All", count: rows.length }]} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search serial, table, customer" className="h-11 w-64" />
          <div className="flex-1" />
          <Button variant="secondary" size="lg" onClick={refresh} loading={refreshing} disabled={status === "offline"}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
        {/* content-start: a few cards keep their own height instead of stretching to share the whole screen. */}
        <div className="grid flex-1 grid-cols-1 content-start gap-2 overflow-y-auto p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((o) => (
            <button key={o.id} onClick={() => setSel(o)} className={cn("flex min-h-28 overflow-hidden rounded-lg border bg-card text-left shadow-sm", sel?.id === o.id && "border-primary")}>
              <div className={cn("w-2 shrink-0", o.order_type === "dine_in" ? "bg-primary" : o.order_type === "takeaway" ? "bg-accent" : o.order_type === "delivery" ? "bg-info" : "bg-inverse")} />
              <div className="flex min-w-0 flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl font-bold">{orderName(o)}</span>
                  <Badge variant={rejected(o) ? "danger" : orderStatusVariant(o.status)}>{rejected(o) ? "Rejected" : titleCase(o.status)}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs"><Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge>{rejected(o) ? <><Badge variant="danger" title={o.sync_error ?? undefined}>{o.sync_error ?? "The server refused it"}</Badge>{o.paid_minor > 0 ? <Badge variant="warning">Paid on this till only</Badge> : null}</> : <Badge variant={paymentStatusVariant(o.payment_status)}>{titleCase(o.payment_status)}</Badge>}{!rejected(o) && o.local_only ? <Badge variant="warning">not synced</Badge> : null}{o.table_code ? <Badge>Table {o.table_code}</Badge> : null}</div>
                <div className="mt-1 truncate text-sm text-fg-secondary">{o.customer_name ?? o.guest_name ?? "Walk-in"} · {itemsText(o)} · {formatTime(o.created_at)}</div>
                <div className="mt-auto pt-1 text-right text-lg font-semibold tabular">{formatMoney(o.total_minor, currency)}</div>
              </div>
            </button>
          ))}
          {!filtered.length ? <div className="col-span-full py-16 text-center text-fg-muted">{tab === "open" ? "No open orders" : "Nothing here"}</div> : null}
        </div>
      </div>
      <Dialog open={!!sel && !voidOpen && !refund} onClose={() => setSel(null)} title={sel ? `Order ${orderName(sel)}` : ""} description={sel ? `${rejected(sel) ? "Rejected" : titleCase(sel.status)} · ${titleCase(sel.order_type)} · ${formatTime(sel.created_at)}${sel.void_reason ? ` · ${sel.void_reason}` : ""}${rejected(sel) ? ` · The server refused it: ${sel.sync_error ?? "no reason given"}. See Attention.` : ""}` : undefined} size="md"
        footer={sel ? <>
          {OPEN.includes(sel.status) ? <Button variant="destructive" onClick={() => setVoidOpen(true)}><Ban className="h-4 w-4" /> Void</Button> : null}
          {/* Refund and Reopen show to every role (QA T11): one without the permission is asked for a manager's PIN. */}
          {refundable ? <Button variant="secondary" onClick={() => setRefund({ id: uuid(), amount: refundable.amount_minor, method: defaultRefundMethod(sel.payment_method_summary, methods, sel.payments), reason: "" })}><RotateCcw className="h-4 w-4" /> {refundable.excess ? "Refund overpaid" : "Refund"}</Button> : null}
          {finishable(sel) ? <Button onClick={() => doComplete(sel)} loading={busy} title="Paid in full: close the order"><CheckCircle2 className="h-4 w-4" /> Complete</Button> : null}
          {["paid", "closed"].includes(sel.status) && !sel.local_only && !rejected(sel) ? <Button variant="secondary" onClick={() => doReopen(sel)} loading={busy} title={can("REOPEN_ORDER") ? "Reopen this completed order for editing" : "Reopen this completed order for editing: a manager's PIN approves it"}><Unlock className="h-4 w-4" /> Reopen</Button> : null}
          {["paid", "closed", "refunded"].includes(sel.status) ? <Button variant="secondary" onClick={() => print(sel, true)}><Printer className="h-4 w-4" /> Reprint</Button> : null}
          {sel.status === "held" ? <Button onClick={() => openInSell(sel, true)}><Play className="h-4 w-4" /> Recall</Button> : OPEN.includes(sel.status) ? <Button onClick={() => openInSell(sel)}><Pencil className="h-4 w-4" /> Open</Button> : null}
        </> : undefined}>
        {sel ? (
          <ul className="divide-y text-base">
            {sel.lines.length ? sel.lines.map((l, i) => <li key={i} className={cn("flex justify-between py-2", l.status === "cancelled" && "line-through opacity-50")}><span>{l.quantity} × {l.name}{l.modifiers.length ? <span className="block text-xs text-fg-secondary">{l.modifiers.map((m) => m.name).join(", ")}</span> : null}{l.notes ? <span className="block text-xs italic text-fg-secondary">{l.notes}</span> : null}</span><span className="tabular">{formatMoney(lineAmount(l), currency)}</span></li>) : <li className="py-4 text-sm text-fg-muted">Line details not cached on this till.</li>}
            <li className="flex justify-between py-2 font-semibold"><span>Total</span><span className="tabular">{formatMoney(sel.total_minor, currency)}</span></li>
            {sel.paid_minor ? <li className="flex justify-between py-1 text-sm text-fg-secondary"><span>Paid</span><span className="tabular">{formatMoney(sel.paid_minor, currency)}</span></li> : null}
          </ul>
        ) : null}
      </Dialog>
      <ReasonDialog open={voidOpen} onClose={() => setVoidOpen(false)} onConfirm={doVoid} title={`Void ${sel ? orderName(sel) : ""}`} description="Reason is required. A manager PIN is asked for if your role cannot void." confirmLabel="Void order" loading={busy} presets={VOID_REASONS} />
      <Dialog open={!!refund} onClose={() => setRefund(null)} title={`Refund ${sel ? orderName(sel) : ""}`} description={refundable?.excess ? "What was paid above the new total goes back first; then Complete closes the order. A manager PIN is asked for if your role cannot refund." : "A manager PIN is asked for if your role cannot refund. Logged with both names."} size="sm" footer={<><Button variant="secondary" onClick={() => setRefund(null)}>Cancel</Button><Button variant="destructive" loading={busy} disabled={!refund?.reason.trim() || !refund?.amount} onClick={doRefund}>Refund {formatMoney(refund?.amount, currency)}</Button></>}>
        {refund ? <div className="space-y-3">
          <Field label="Amount"><MoneyInput value={refund.amount} onChange={(v) => setRefund({ ...refund, amount: v })} className="h-12" /></Field>
          <Field label="Method"><Select value={refund.method} onChange={(e) => setRefund({ ...refund, method: e.target.value })} className="h-12">{methods.filter((m) => m.active).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
          <Field label="Reason"><Input value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} className="h-12" /></Field>
        </div> : null}
      </Dialog>
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
      {dialog}
    </PosShell>
  );
}

export default function OrdersPage() {
  return <Suspense fallback={null}><OrdersScreen /></Suspense>;
}
