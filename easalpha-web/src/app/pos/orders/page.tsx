"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Printer, Ban, RotateCcw, Play, Pencil, Unlock } from "lucide-react";
import { type LocalOrder } from "@/lib/db";
import { fetchReceipt, listLocalOrders, refreshOrdersFromServer, refundOrder, reopenOrder, resumeOrder, voidOrder } from "@/lib/pos-actions";
import { businessDayFor } from "@/lib/business-day";
import { useDeviceStore, usePosCan } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { useCartStore } from "@/store/cart";
import { useSyncStore } from "@/store/sync";
import { errorMessage } from "@/lib/api";
import type { Receipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatTime } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";
import { hasPrinter, printJob, receiptLines } from "@/lib/print";
import { PosShell } from "@/components/pos/shell";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { ReasonDialog } from "@/components/pos/dialogs";
import { useApproval } from "@/components/approval";
import { Badge, Button, Dialog, Field, Input, MoneyInput, Select, Tabs, orderStatusVariant, orderTypeVariant, paymentStatusVariant } from "@/components/ui";
import { toast } from "@/store/toast";

const OPEN = ["draft", "held", "placed", "preparing", "ready", "served", "dispatched"];
const VOID_REASONS = ["Customer left", "Wrong order", "Duplicate", "Kitchen error", "Test order"];

function OrdersScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const branch = useDeviceStore((s) => s.branch);
  const can = usePosCan();
  const methods = useCatalogStore((s) => s.paymentMethods);
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
  const [refund, setRefund] = useState<{ amount: number; method: string; reason: string } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { setRows(await listLocalOrders(day)); }, [day]);
  const refresh = useCallback(async () => { setBusy(true); await refreshOrdersFromServer(day); await reload(); setBusy(false); }, [day, reload]);
  useEffect(() => { reload(); refresh(); }, [reload, refresh]);
  useEffect(() => { const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);

  const filtered = rows.filter((o) => (tab === "open" ? OPEN.includes(o.status) : tab === "paid" ? ["paid", "closed", "refunded"].includes(o.status) : true)).filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || (o.till_serial ?? "").toLowerCase().includes(q.toLowerCase()) || (o.customer_name ?? "").toLowerCase().includes(q.toLowerCase()) || (o.table_code ?? "").toLowerCase().includes(q.toLowerCase()));
  const openTotal = rows.filter((o) => OPEN.includes(o.status)).reduce((s, o) => s + o.total_minor, 0);
  const paidTotal = rows.filter((o) => ["paid", "closed"].includes(o.status)).reduce((s, o) => s + o.total_minor, 0);

  const doVoid = async (reason: string) => {
    if (!sel) return;
    setBusy(true);
    try { const r = await run((pin) => voidOrder(sel.id, reason, pin), `Void ${sel.label}`); toast.success(r.offline ? "Voided on till; syncs later" : "Order voided"); setVoidOpen(false); setSel(null); reload(); }
    catch (e) { toast.error("Could not void", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const doRefund = async () => {
    if (!sel || !refund) return;
    setBusy(true);
    try { await run((pin) => refundOrder(sel.id, refund.amount, refund.method, refund.reason, pin), `Refund ${formatMoney(refund.amount, currency)}`); toast.success("Refund recorded"); setRefund(null); setSel(null); reload(); }
    catch (e) { toast.error("Could not refund", errorMessage(e)); }
    finally { setBusy(false); }
  };
  // SPEC reopen flow (REOPEN_ORDER): the server reopens the order, then the sell screen loads it in edit mode with the
  // reopened flags (loadOrderForEdit reads them from the server), so the catalog discounts attach as for any edit.
  const doReopen = async (o: LocalOrder) => {
    if (status === "offline") { toast.error("Needs the internet", "Reopening an order is never queued."); return; }
    setBusy(true);
    try {
      const c = await reopenOrder(o.id);
      toast.info(`${c.label} reopened`, "Make the changes, save them, then take payment to complete it again.");
      setSel(null);
      router.push(`/pos?order=${o.id}`);
    } catch (e) { toast.error("Could not reopen", errorMessage(e)); }
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
          <Tabs size="lg" value={tab} onChange={setTab} items={[{ value: "open", label: `Open · ${formatMoney(openTotal, currency)}`, count: rows.filter((o) => OPEN.includes(o.status)).length }, { value: "paid", label: `Paid · ${formatMoney(paidTotal, currency)}`, count: rows.filter((o) => ["paid", "closed", "refunded"].includes(o.status)).length }, { value: "all", label: "All", count: rows.length }]} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search serial, table, customer" className="h-11 w-64" />
          <div className="flex-1" />
          <Button variant="secondary" size="lg" onClick={refresh} loading={busy} disabled={status === "offline"}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((o) => (
            <button key={o.id} onClick={() => setSel(o)} className={cn("flex min-h-28 overflow-hidden rounded-lg border bg-card text-left shadow-sm", sel?.id === o.id && "border-primary")}>
              <div className={cn("w-2 shrink-0", o.order_type === "dine_in" ? "bg-primary" : o.order_type === "takeaway" ? "bg-accent" : o.order_type === "delivery" ? "bg-info" : "bg-inverse")} />
              <div className="flex min-w-0 flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl font-bold">{o.label}</span>
                  <Badge variant={orderStatusVariant(o.status)}>{titleCase(o.status)}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs"><Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge><Badge variant={paymentStatusVariant(o.payment_status)}>{titleCase(o.payment_status)}</Badge>{o.local_only ? <Badge variant="warning">not synced</Badge> : null}{o.table_code ? <Badge>Table {o.table_code}</Badge> : null}</div>
                <div className="mt-1 truncate text-sm text-fg-secondary">{o.customer_name ?? o.guest_name ?? "Walk-in"} · {o.lines.filter((l) => l.status !== "cancelled").length || "?"} items · {formatTime(o.created_at)}</div>
                <div className="mt-auto pt-1 text-right text-lg font-semibold tabular">{formatMoney(o.total_minor, currency)}</div>
              </div>
            </button>
          ))}
          {!filtered.length ? <div className="col-span-full py-16 text-center text-fg-muted">{tab === "open" ? "No open orders" : "Nothing here"}</div> : null}
        </div>
      </div>
      <Dialog open={!!sel && !voidOpen && !refund} onClose={() => setSel(null)} title={sel ? `Order ${sel.label}` : ""} description={sel ? `${titleCase(sel.status)} · ${titleCase(sel.order_type)} · ${formatTime(sel.created_at)}${sel.void_reason ? ` · ${sel.void_reason}` : ""}` : undefined} size="md"
        footer={sel ? <>
          {OPEN.includes(sel.status) ? <Button variant="destructive" onClick={() => setVoidOpen(true)}><Ban className="h-4 w-4" /> Void</Button> : null}
          {["paid", "closed"].includes(sel.status) && can("orders.refund", "shifts.any") ? <Button variant="secondary" onClick={() => setRefund({ amount: sel.paid_minor, method: methods.find((m) => m.kind === "cash")?.code ?? "cash", reason: "" })}><RotateCcw className="h-4 w-4" /> Refund</Button> : null}
          {["paid", "closed"].includes(sel.status) && !sel.local_only && can("REOPEN_ORDER") ? <Button variant="secondary" onClick={() => doReopen(sel)} loading={busy} title="Reopen this completed order for editing (REOPEN_ORDER)"><Unlock className="h-4 w-4" /> Reopen</Button> : null}
          {["paid", "closed", "refunded"].includes(sel.status) ? <Button variant="secondary" onClick={() => print(sel, true)}><Printer className="h-4 w-4" /> Reprint</Button> : null}
          {sel.status === "held" ? <Button onClick={() => openInSell(sel, true)}><Play className="h-4 w-4" /> Recall</Button> : OPEN.includes(sel.status) ? <Button onClick={() => openInSell(sel)}><Pencil className="h-4 w-4" /> Open</Button> : null}
        </> : undefined}>
        {sel ? (
          <ul className="divide-y text-base">
            {sel.lines.length ? sel.lines.map((l, i) => <li key={i} className={cn("flex justify-between py-2", l.status === "cancelled" && "line-through opacity-50")}><span>{l.quantity} × {l.name}{l.modifiers.length ? <span className="block text-xs text-fg-secondary">{l.modifiers.map((m) => m.name).join(", ")}</span> : null}{l.notes ? <span className="block text-xs italic text-fg-secondary">{l.notes}</span> : null}</span><span className="tabular">{formatMoney((l.price_override_minor ?? l.unit_price_minor) * l.quantity, currency)}</span></li>) : <li className="py-4 text-sm text-fg-muted">Line details not cached on this till.</li>}
            <li className="flex justify-between py-2 font-semibold"><span>Total</span><span className="tabular">{formatMoney(sel.total_minor, currency)}</span></li>
            {sel.paid_minor ? <li className="flex justify-between py-1 text-sm text-fg-secondary"><span>Paid</span><span className="tabular">{formatMoney(sel.paid_minor, currency)}</span></li> : null}
          </ul>
        ) : null}
      </Dialog>
      <ReasonDialog open={voidOpen} onClose={() => setVoidOpen(false)} onConfirm={doVoid} title={`Void ${sel?.label}`} description="Reason is required. A manager PIN is asked for if your role cannot void." confirmLabel="Void order" loading={busy} presets={VOID_REASONS} />
      <Dialog open={!!refund} onClose={() => setRefund(null)} title={`Refund ${sel?.label}`} description="Manager only. Logged with both names." size="sm" footer={<><Button variant="secondary" onClick={() => setRefund(null)}>Cancel</Button><Button variant="destructive" loading={busy} disabled={!refund?.reason.trim() || !refund?.amount} onClick={doRefund}>Refund {formatMoney(refund?.amount, currency)}</Button></>}>
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
