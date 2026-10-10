"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Trash2 } from "lucide-react";
import type { PaymentInput, PaymentMethod } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { cashRounding, computeTotals } from "@/lib/pricing";
import { defaultPaymentMethod } from "@/lib/pos-rules";
import type { Cart } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { useSyncStore } from "@/store/sync";
import { Button, Dialog, Field, Input, MoneyInput } from "@/components/ui";
import { cn, titleCase } from "@/lib/utils";

interface Props { open: boolean; onClose: () => void; cart: Cart; onPay: (payments: PaymentInput[], tip_minor: number) => Promise<void>; busy: boolean }

interface Split { method: PaymentMethod; amount_minor: number; tendered_minor: number; reference: string }

/**
 * SPEC "Order payment behaviour": the screen pre-selects the store's default method (a reopened order opens on its
 * original one); the cashier may switch. The amount defaults to what is due and may be lowered for a part payment,
 * after which the order stays open with payment status Pending and the remaining due shown on the panel.
 */
export function PaymentDialog({ open, onClose, cart, onPay, busy }: Props) {
  const methods = useCatalogStore((s) => s.paymentMethods);
  const catalog = useCatalogStore((s) => s.catalog);
  const status = useSyncStore((s) => s.status);
  const settings = catalog?.business.settings;
  const currency = catalog?.business.currency;
  const [tip, setTip] = useState(0);
  const [splits, setSplits] = useState<Split[]>([]);
  const [draft, setDraft] = useState<{ method: PaymentMethod | null; amount: number; tendered: number; reference: string }>({ method: null, amount: 0, tendered: 0, reference: "" });
  const active = useMemo(() => methods.filter((m) => m.active).sort((a, b) => a.sort_order - b.sort_order), [methods]);
  const base = computeTotals(cart.lines, { orderType: cart.order_type, settings, staffMeal: cart.is_staff_meal, tip_minor: tip });
  const anyCash = splits.some((s) => s.method.kind === "cash") || draft.method?.kind === "cash";
  const rounding = anyCash ? cashRounding(base.total_minor, settings) : 0;
  const total = base.total_minor + rounding;
  const paidBefore = cart.paid_minor ?? 0;
  const due = Math.max(0, total - paidBefore);
  const paid = splits.reduce((s, x) => s + x.amount_minor, 0);
  const remaining = Math.max(0, due - paid);
  const change = splits.reduce((s, x) => s + (x.method.kind === "cash" ? Math.max(0, x.tendered_minor - x.amount_minor) : 0), 0) + (draft.method?.kind === "cash" ? Math.max(0, draft.tendered - Math.min(draft.amount, remaining)) : 0);
  // Read only when the dialog opens, so edits to the cart while it is open do not reset the splits.
  const latest = useRef({ settings, cart, status });
  latest.current = { settings, cart, status };

  useEffect(() => {
    if (!open) return;
    setTip(0); setSplits([]);
    const { settings: s, cart: c, status: st } = latest.current;
    const code = defaultPaymentMethod(s, c);
    const usable = (m: PaymentMethod) => st !== "offline" || m.works_offline;
    const pre = (code ? active.find((m) => m.code === code && usable(m)) : undefined) ?? active.find((m) => m.kind === "cash" && usable(m)) ?? active.find(usable) ?? null;
    setDraft({ method: pre, amount: 0, tendered: 0, reference: "" });
  }, [open, active]);
  useEffect(() => { setDraft((d) => ({ ...d, amount: remaining, tendered: d.method?.kind === "cash" ? Math.max(d.tendered, remaining) : 0 })); }, [remaining, draft.method?.kind]);

  const pick = (m: PaymentMethod) => setDraft({ method: m, amount: remaining, tendered: m.kind === "cash" ? remaining : 0, reference: "" });
  const offlineBlocked = status === "offline" && draft.method && !draft.method.works_offline;
  const khataBlocked = draft.method?.kind === "khata" && !cart.customer;
  const needsRef = !!draft.method?.needs_reference && !draft.reference.trim();
  const draftAmount = Math.min(draft.amount, remaining);
  const partial = remaining > 0 && draft.amount > 0 && draft.amount < remaining;
  const addSplit = () => {
    if (!draft.method) return;
    const amt = Math.min(draft.amount, remaining);
    if (amt <= 0) return;
    setSplits([...splits, { method: draft.method, amount_minor: amt, tendered_minor: draft.method.kind === "cash" ? Math.max(draft.tendered, amt) : 0, reference: draft.reference }]);
  };
  const toInputs = (list: Split[]): PaymentInput[] => list.map((s) => ({ method_code: s.method.code, amount_minor: s.amount_minor, tendered_minor: s.method.kind === "cash" ? s.tendered_minor : undefined, reference: s.reference || undefined }));
  const payAll = async () => {
    let list = splits;
    if (remaining > 0 && draft.method && draft.amount > 0) list = [...splits, { method: draft.method, amount_minor: draftAmount, tendered_minor: draft.method.kind === "cash" ? Math.max(draft.tendered, draftAmount) : 0, reference: draft.reference }];
    const sum = list.reduce((s, x) => s + x.amount_minor, 0);
    if (sum <= 0 && !(cart.is_staff_meal && total === 0)) return;
    await onPay(toInputs(list), tip);
  };
  const quick = [remaining, Math.ceil(remaining / 10000) * 10000, Math.ceil(remaining / 50000) * 50000, Math.ceil(remaining / 100000) * 100000].filter((v, i, a) => v >= remaining && v > 0 && a.indexOf(v) === i).slice(0, 4);
  const draftOk = !!draft.method && remaining > 0 && draft.amount > 0 && !needsRef && !khataBlocked && !offlineBlocked && (draft.method.kind !== "cash" || draft.tendered >= draftAmount);
  const canPay = (remaining === 0 && splits.length > 0) || draftOk || (cart.is_staff_meal && total === 0);
  const payLabel = remaining === 0 && splits.length ? "Finish" : partial ? `Pay ${formatMoney(draftAmount, currency)} now` : `Pay ${formatMoney(remaining, currency)}`;

  return (
    <Dialog open={open} onClose={onClose} title={cart.reopened ? "Payment (F8) · reopened order" : "Payment (F8)"} description={cart.reopened ? "A reopened order is completed through the payment screen. It opens on its original method." : undefined} size="xl" className="sm:max-h-[95vh]">
      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {active.map((m) => (
              <button key={m.id} onClick={() => pick(m)} disabled={status === "offline" && !m.works_offline} className={cn("flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 text-base font-semibold disabled:opacity-40", draft.method?.id === m.id ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>
                {m.name}
                {status === "offline" && !m.works_offline ? <span className="text-xs font-normal text-fg-muted">needs internet</span> : null}
              </button>
            ))}
            {!active.length ? <p className="col-span-full text-sm text-fg-muted">No payment methods. Add them in the admin.</p> : null}
          </div>
          {draft.method ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between"><span className="font-semibold">{draft.method.name}</span><span className="text-sm text-fg-secondary">{titleCase(draft.method.kind)}</span></div>
              <Field label="Amount" hint={partial ? `Part payment: ${formatMoney(remaining - draftAmount, currency)} stays due and the order stays open as Pending.` : undefined}><MoneyInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} className="h-12 text-lg" /></Field>
              {draft.method.kind === "cash" ? (
                <>
                  <Field label="Tendered"><MoneyInput value={draft.tendered} onChange={(v) => setDraft({ ...draft, tendered: v })} className="h-12 text-lg" /></Field>
                  <div className="flex flex-wrap gap-2">{quick.map((v) => <button key={v} onClick={() => setDraft({ ...draft, tendered: v })} className="min-h-11 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted">{formatMoney(v, currency)}</button>)}</div>
                </>
              ) : null}
              {draft.method.needs_reference || draft.method.kind === "card" || draft.method.kind === "wallet" || draft.method.kind === "bank" ? (
                <Field label={`Reference${draft.method.needs_reference ? " (required)" : ""}`}><Input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} placeholder="Transaction id / last 4 digits" className="h-12 text-base" /></Field>
              ) : null}
              {khataBlocked ? <p className="text-sm text-danger">Khata needs a customer on the order. Close this and pick one (F3).</p> : null}
              {draft.method.kind === "khata" && cart.customer ? <p className="text-sm text-fg-secondary">On account of {cart.customer.name}{cart.customer.balance_minor ? ` · owes ${formatMoney(cart.customer.balance_minor, currency)}` : ""}{cart.customer.credit_limit_minor ? ` · limit ${formatMoney(cart.customer.credit_limit_minor, currency)}` : ""}</p> : null}
              {offlineBlocked ? <p className="text-sm text-danger">{draft.method.name} needs the internet. Use cash or khata while offline.</p> : null}
              {partial ? <Button variant="secondary" className="w-full" size="lg" onClick={addSplit} disabled={needsRef || khataBlocked || !!offlineBlocked || draft.amount <= 0}>Add {formatMoney(draftAmount, currency)} and split the rest</Button> : null}
            </div>
          ) : null}
          <Field label="Tip"><div className="flex gap-2"><MoneyInput value={tip} onChange={setTip} className="h-12" />{[0, 5000, 10000, 20000].map((v) => <button key={v} onClick={() => setTip(v)} className={cn("min-h-12 rounded-lg border px-3 text-sm", tip === v ? "border-primary bg-primary-soft" : "bg-card")}>{v ? formatMoney(v, currency) : "None"}</button>)}</div></Field>
        </div>
        <div className="flex flex-col rounded-lg bg-muted p-4">
          <div className="text-sm text-fg-secondary">{paidBefore ? "Amount due" : "Total due"}</div>
          <div className="text-4xl font-bold tabular">{formatMoney(due, currency)}</div>
          <div className="mt-2 space-y-1 text-sm text-fg-secondary">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{formatMoney(base.subtotal_minor, currency)}</span></div>
            {base.service_charge_minor ? <div className="flex justify-between"><span>Service {base.service_charge_percent}%</span><span className="tabular">{formatMoney(base.service_charge_minor, currency)}</span></div> : null}
            {base.tax_minor ? <div className="flex justify-between"><span>Tax</span><span className="tabular">{formatMoney(base.tax_minor, currency)}</span></div> : null}
            {rounding ? <div className="flex justify-between"><span>Cash rounding</span><span className="tabular">{formatMoney(rounding, currency)}</span></div> : null}
            {tip ? <div className="flex justify-between"><span>Tip</span><span className="tabular">{formatMoney(tip, currency)}</span></div> : null}
            {paidBefore ? <div className="flex justify-between"><span>Total</span><span className="tabular">{formatMoney(total, currency)}</span></div> : null}
            {paidBefore ? <div className="flex justify-between"><span>Already paid</span><span className="tabular">-{formatMoney(paidBefore, currency)}</span></div> : null}
          </div>
          {splits.length ? (
            <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
              {splits.map((s, i) => <li key={i} className="flex items-center justify-between"><span>{s.method.name}{s.reference ? ` · ${s.reference}` : ""}</span><span className="flex items-center gap-2 tabular">{formatMoney(s.amount_minor, currency)}<button onClick={() => setSplits(splits.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></button></span></li>)}
              <li className="flex justify-between font-semibold"><span>Remaining</span><span className="tabular">{formatMoney(remaining, currency)}</span></li>
            </ul>
          ) : null}
          {change > 0 ? <div className="mt-3 rounded-md bg-success-soft p-3 text-center"><div className="text-xs">Change</div><div className="text-2xl font-bold tabular">{formatMoney(change, currency)}</div></div> : null}
          <div className="flex-1" />
          <Button size="xl" className="mt-4 w-full" onClick={payAll} loading={busy} disabled={!canPay}><Banknote className="h-5 w-5" /> {payLabel}</Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>Back (Esc)</Button>
        </div>
      </div>
    </Dialog>
  );
}
