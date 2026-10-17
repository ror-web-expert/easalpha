"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Trash2 } from "lucide-react";
import type { Customer, PaymentInput, PaymentMethod } from "@/lib/types";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { billRows, cashSuggestions } from "@/lib/bill";
import { defaultPaymentMethod, payableTotals, roundsCash } from "@/lib/pos-rules";
import { lineAmount } from "@/lib/pricing";
import { chargeAmount, chargeDisplay, deliveryChargeFields, linkedTaxRate, resolveDeliveryCharge, resolveServiceCharge, serviceChargeFields, taxRateLabel, type ChargeState } from "@/lib/pos-charges";
import type { Cart, CartCustomer } from "@/store/cart";
import { discountRows } from "@/lib/pos-discounts";
import { DiscountsPanel, type DiscountRunner } from "./discounts-panel";
import { moduleOn } from "@/lib/modules";
import { accountSummary, toCartCustomer } from "@/lib/pos-customers";
import { CustomerSearch } from "./customer-search";
import { useCatalogStore } from "@/store/catalog";
import { useSyncStore } from "@/store/sync";
import { Button, Dialog, Field, Input, MoneyInput, Tabs } from "@/components/ui";
import { cn, titleCase } from "@/lib/utils";

export type TaxChoiceInput = { none: true } | { tax_rate_id: string };

interface Props {
  // onPay also gets the amount due the screen showed, so the page can check it against what the server will ask for.
  open: boolean; onClose: () => void; cart: Cart; onPay: (payments: PaymentInput[], tip_minor: number, due_minor: number) => Promise<void>; busy: boolean;
  /** SPEC Charges: the cashier changed or removed the service / delivery charge; the page saves the order and shows the new total. */
  onCharges?: (fields: Partial<Cart>) => Promise<void>;
  /** SPEC Tax: No Tax / linked rate. Online only; the page re-prices through the server. */
  onTaxChoice?: (choice: TaxChoiceInput) => Promise<void>;
  /** SPEC discounts: vouchers, loyalty points and redemption options, applied on the server. Online only. */
  onDiscount?: DiscountRunner;
  /** Khata without a customer: the cashier searches and attaches the customer here, without leaving payment. Also
   *  fills in the account figures of a customer that came with a saved order. */
  onCustomer?: (c: CartCustomer) => void;
}

interface Split { method: PaymentMethod; amount_minor: number; tendered_minor: number; reference: string }

/**
 * SPEC "Order payment behaviour": the screen pre-selects the store's default method (a reopened order opens on its
 * original one); the cashier may switch. The amount defaults to what is due and may be lowered for a part payment,
 * after which the order stays open with payment status Pending and the remaining due shown on the panel.
 * SPEC "Charges": service charge (and delivery charge on delivery orders) pre-fill from settings as a percent or a
 * fixed amount and can be changed or removed here. SPEC "Tax": a No Tax / rate choice appears only when the selected
 * method's finance account is linked to a tax rate.
 */
export function PaymentDialog({ open, onClose, cart, onPay, busy, onCharges, onTaxChoice, onDiscount, onCustomer }: Props) {
  const [changingCustomer, setChangingCustomer] = useState(false);
  const methods = useCatalogStore((s) => s.paymentMethods);
  const catalog = useCatalogStore((s) => s.catalog);
  const status = useSyncStore((s) => s.status);
  const settings = catalog?.business.settings;
  const currency = catalog?.business.currency;
  const [tip, setTip] = useState(0);
  const [splits, setSplits] = useState<Split[]>([]);
  const [draft, setDraft] = useState<{ method: PaymentMethod | null; amount: number; tendered: number; reference: string }>({ method: null, amount: 0, tendered: 0, reference: "" });
  // Khata only while the owner has customer accounts switched on (Settings, Modules); the API refuses it otherwise.
  const khataOn = moduleOn(useCatalogStore((s) => s.catalog?.business.settings), "customer_accounts");
  const active = useMemo(() => methods.filter((m) => m.active && (m.kind !== "khata" || khataOn)).sort((a, b) => a.sort_order - b.sort_order), [methods, khataOn]);
  const service = resolveServiceCharge(cart, settings);
  const delivery = resolveDeliveryCharge(cart, settings);
  // As the server will charge it: tips already taken plus this one; cash rounding on the first cash payment only,
  // after which the rounding stored with that payment stays in the total.
  const cash = roundsCash([...splits.map((s) => s.method.code), draft.method?.code]);
  const base = payableTotals(cart, { settings, tip_minor: tip, cash });
  const net = base.subtotal_minor - base.discount_minor;
  const total = base.total_minor;
  const paidBefore = cart.paid_minor ?? 0;
  const due = Math.max(0, total - paidBefore);
  const paid = splits.reduce((s, x) => s + x.amount_minor, 0);
  const remaining = Math.max(0, due - paid);
  const change = splits.reduce((s, x) => s + (x.method.kind === "cash" ? Math.max(0, x.tendered_minor - x.amount_minor) : 0), 0) + (draft.method?.kind === "cash" ? Math.max(0, draft.tendered - Math.min(draft.amount, remaining)) : 0);
  // Read only when the dialog opens, so edits to the cart while it is open do not reset the splits.
  const latest = useRef({ settings, cart, status });
  latest.current = { settings, cart, status };
  // SPEC Tax: the choice is server-side, so it is hidden offline and when the method has no linked rate.
  const online = status !== "offline";
  const linked = online && onTaxChoice ? linkedTaxRate(draft.method, catalog?.tax_rates) : null;
  const taxValue = cart.tax_choice === "none" ? "none" : linked && cart.tax_rate_id === linked.id ? "rate" : "";

  useEffect(() => {
    if (!open) return;
    setTip(0); setSplits([]); setChangingCustomer(false);
    const { settings: s, cart: c, status: st } = latest.current;
    const code = defaultPaymentMethod(s, c);
    const usable = (m: PaymentMethod) => st !== "offline" || m.works_offline;
    const pre = (code ? active.find((m) => m.code === code && usable(m)) : undefined) ?? active.find((m) => m.kind === "cash" && usable(m)) ?? active.find(usable) ?? null;
    setDraft({ method: pre, amount: 0, tendered: 0, reference: "" });
  }, [open, active]);
  useEffect(() => { setDraft((d) => ({ ...d, amount: remaining, tendered: d.method?.kind === "cash" ? Math.max(d.tendered, remaining) : 0 })); }, [remaining, draft.method?.kind]);
  // A customer that came with a saved order (a table, a resumed or reopened order) has no account figures on the cart;
  // fetch them once Khata is picked, so the account line can say what they owe and their limit.
  const accountId = draft.method?.kind === "khata" && cart.customer && cart.customer.balance_minor === undefined ? cart.customer.id : null;
  const onCustomerRef = useRef(onCustomer);
  onCustomerRef.current = onCustomer;
  useEffect(() => {
    if (!open || !accountId || !online || !onCustomerRef.current) return;
    let live = true;
    api<Customer>(`/customers/${accountId}`, { auth: "pos" })
      .then((c) => { if (live && latest.current.cart.customer?.id === c.id) onCustomerRef.current?.(toCartCustomer(c)); })
      .catch(() => {}); // not reachable: the line shows the name only
    return () => { live = false; };
  }, [open, accountId, online]);

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
    await onPay(toInputs(list), tip, due);
  };
  // The exact amount first, then what a customer can hand over in notes (Rs 50, 100, 500, 1,000, 5,000).
  const quick = cashSuggestions(remaining, currency ?? "PKR");
  const draftOk = !!draft.method && remaining > 0 && draft.amount > 0 && !needsRef && !khataBlocked && !offlineBlocked && (draft.method.kind !== "cash" || draft.tendered >= draftAmount);
  const canPay = (remaining === 0 && splits.length > 0) || draftOk || (cart.is_staff_meal && total === 0);
  const payLabel = remaining === 0 && splits.length ? "Finish" : partial ? `Pay ${formatMoney(draftAmount, currency)} now` : `Pay ${formatMoney(remaining, currency)}`;
  // Charges cannot change once money has been taken against the order; the total they feed is already partly settled.
  const chargesLocked = !onCharges || paidBefore > 0 || splits.length > 0 || cart.is_staff_meal;
  // SPEC discounts: the same lock, and the lines by kind for the totals block.
  const discountsLocked = paidBefore > 0 || splits.length > 0 || cart.is_staff_meal;
  const discountLines = discountRows(cart.discounts, base.discount_minor);

  return (
    // Reviews 3.1 and 3.2: a fixed height that always fits the screen (1024 x 768 included). Only the method column
    // scrolls; the right column keeps the total and the change at the top, the itemised bill in the middle, and Pay
    // pinned at the bottom, so the primary action is never below the fold.
    <Dialog open={open} onClose={onClose} title={cart.reopened ? "Payment (F8) · reopened order" : "Payment (F8)"} description={cart.reopened ? "A reopened order is completed through the payment screen. It opens on its original method." : undefined} size="xl" className="h-[95dvh] sm:h-[min(95dvh,860px)] sm:max-h-[95dvh]">
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4 pb-2 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-1 md:gap-5">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain pr-1" data-testid="payment-methods">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {active.map((m) => (
              <button key={m.id} onClick={() => pick(m)} disabled={status === "offline" && !m.works_offline} className={cn("flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 text-base font-semibold disabled:opacity-40", draft.method?.id === m.id ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>
                {m.name}
                {status === "offline" && !m.works_offline ? <span className="text-xs font-normal text-fg-muted">needs internet</span> : null}
              </button>
            ))}
            {!active.length ? <p className="col-span-full text-sm text-fg-muted">No payment methods. Add them in the admin.</p> : null}
          </div>
          {linked ? (
            <Field label="Tax" hint={`${draft.method?.name} is linked to ${taxRateLabel(linked)}. The order is re-priced with your choice.`}>
              <Tabs value={taxValue} onChange={(v) => { if (busy) return; void onTaxChoice?.(v === "none" ? { none: true } : { tax_rate_id: linked.id }); }} items={[{ value: "none", label: "No Tax" }, { value: "rate", label: taxRateLabel(linked) }]} size="lg" />
            </Field>
          ) : null}
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
              {draft.method.kind === "khata" && onCustomer && (khataBlocked || changingCustomer) ? (
                <div className="space-y-2 rounded-lg bg-warning-soft/50 p-3">
                  <p className="text-sm font-semibold">Whose account is this for?</p>
                  <CustomerSearch autoFocus onPick={(c) => { onCustomer(toCartCustomer(c)); setChangingCustomer(false); }} />
                  <p className="text-xs text-fg-muted">A new customer: close this, add them with Customer (F3), then pay.</p>
                </div>
              ) : khataBlocked ? <p className="text-sm text-danger">Khata needs a customer on the order. Close this and pick one (F3).</p> : null}
              {draft.method.kind === "khata" && cart.customer && !changingCustomer ? (() => {
                const acct = accountSummary(cart.customer, draftAmount, currency);
                const known = [acct.owes, acct.limitText].filter(Boolean).join(" · ");
                return (
                  <div className="space-y-1 rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate"><span className="text-fg-secondary">On account of </span><span className="font-semibold">{cart.customer.name}</span></span>
                      {onCustomer ? <button type="button" className="shrink-0 text-sm font-medium text-primary hover:underline" onClick={() => setChangingCustomer(true)}>Change</button> : null}
                    </div>
                    {known || acct.afterText ? <div className="text-fg-secondary">{known}{known && acct.afterText ? " · " : ""}{acct.afterText ? <span className="font-medium text-fg">{acct.afterText}</span> : null}</div> : null}
                    {acct.overText ? <p className="text-danger">{acct.overText}</p> : null}
                  </div>
                );
              })() : null}
              {offlineBlocked ? <p className="text-sm text-danger">{draft.method.name} needs the internet. Use cash or khata while offline.</p> : null}
              {partial ? <Button variant="secondary" className="w-full" size="lg" onClick={addSplit} disabled={needsRef || khataBlocked || !!offlineBlocked || draft.amount <= 0}>Add {formatMoney(draftAmount, currency)} and split the rest</Button> : null}
            </div>
          ) : null}
          {!chargesLocked ? (
            <div className="space-y-2">
              <ChargeControl label="Service charge" state={service} netMinor={net} currency={currency} busy={busy}
                onApply={(s) => onCharges!(serviceChargeFields(s))} onRemove={() => onCharges!(serviceChargeFields({ mode: "percent", value: 0 }))} />
              {delivery ? (
                <ChargeControl label="Delivery charge" state={delivery} netMinor={net} currency={currency} busy={busy}
                  onApply={(s) => onCharges!(deliveryChargeFields(s))} onRemove={() => onCharges!(deliveryChargeFields({ mode: "fixed", value: 0 }))} />
              ) : null}
            </div>
          ) : null}
          {onDiscount ? <DiscountsPanel cart={cart} currency={currency} online={online} busy={busy} locked={discountsLocked} totalDiscountMinor={base.discount_minor} onRun={onDiscount} /> : null}
          <Field label="Tip"><div className="flex gap-2"><MoneyInput value={tip} onChange={setTip} className="h-12" />{[0, 5000, 10000, 20000].map((v) => <button key={v} onClick={() => setTip(v)} className={cn("min-h-12 rounded-lg border px-3 text-sm", tip === v ? "border-primary bg-primary-soft" : "bg-card")}>{v ? formatMoney(v, currency) : "None"}</button>)}</div></Field>
        </div>
        <div className="flex min-h-0 flex-col rounded-lg bg-muted p-4">
          <div className="text-sm text-fg-secondary">{paidBefore ? "Amount due" : "Total due"}</div>
          <div className="text-4xl font-bold tabular">{formatMoney(due, currency)}</div>
          {change > 0 ? <div className="mt-3 rounded-md bg-success-soft p-3 text-success-ink"><div className="text-sm font-medium">Change</div><div className="text-4xl font-bold tabular">{formatMoney(change, currency)}</div></div> : null}
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ul className="mb-2 hidden space-y-1.5 border-b pb-2 text-sm md:block" aria-label="Items">
            {cart.lines.filter((l) => l.status !== "cancelled").map((l) => (
              <li key={l.key} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{l.quantity !== 1 ? `${l.quantity} × ` : ""}{l.name}</span>
                  {l.modifiers.length ? <span className="block text-xs text-fg-secondary">{l.modifiers.map((m) => m.name).join(", ")}</span> : null}
                  {l.notes ? <span className="block text-xs italic text-fg-secondary">“{l.notes}”</span> : null}
                </span>
                <span className="shrink-0 tabular">{formatMoney(lineAmount(l), currency)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-sm text-fg-secondary">
            {billRows({ ...base, discounts: discountLines, service_charge_label: `Service charge ${chargeDisplay(service, currency)}`.trim(), delivery_label: `Delivery ${delivery?.mode === "percent" ? chargeDisplay(delivery, currency) : ""}`.trim(), tax_label: cart.tax_choice === "none" ? "Tax (none)" : "Tax" }, currency).map((r) => (
              <div key={r.key} className={cn("flex justify-between gap-2", r.info && "text-xs text-fg-muted")}><span className="truncate">{r.label}</span><span className="shrink-0 tabular">{r.amount_minor < 0 ? `-${formatMoney(-r.amount_minor, currency)}` : formatMoney(r.amount_minor, currency)}</span></div>
            ))}
            {paidBefore ? <div className="flex justify-between"><span>Total</span><span className="tabular">{formatMoney(total, currency)}</span></div> : null}
            {paidBefore ? <div className="flex justify-between"><span>Already paid</span><span className="tabular">-{formatMoney(paidBefore, currency)}</span></div> : null}
          </div>
          {splits.length ? (
            <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
              {splits.map((s, i) => <li key={i} className="flex items-center justify-between"><span>{s.method.name}{s.reference ? ` · ${s.reference}` : ""}</span><span className="flex items-center gap-2 tabular">{formatMoney(s.amount_minor, currency)}<button onClick={() => setSplits(splits.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></button></span></li>)}
              <li className="flex justify-between font-semibold"><span>Remaining</span><span className="tabular">{formatMoney(remaining, currency)}</span></li>
            </ul>
          ) : null}
          </div>
          <div className="mt-3 shrink-0 border-t pt-3">
            <Button size="xl" className="w-full" onClick={payAll} loading={busy} disabled={!canPay}><Banknote className="h-5 w-5" /> {payLabel}</Button>
            <Button variant="ghost" className="mt-1 w-full" onClick={onClose}>Back (Esc)</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * SPEC Charges: one charge as an editable value with a "%" / "Rs" mode toggle. The pre-filled value is the setting
 * default (or the order's own value); Apply saves it on the order, Remove sets it to zero. Switching the mode keeps
 * the same money amount so the cashier sees what the change is worth before applying it.
 */
function ChargeControl({ label, state, netMinor, currency, busy, onApply, onRemove }: { label: string; state: ChargeState; netMinor: number; currency?: string; busy: boolean; onApply: (s: ChargeState) => Promise<void>; onRemove: () => Promise<void> }) {
  const [mode, setMode] = useState(state.mode);
  const [value, setValue] = useState(state.value);
  useEffect(() => { setMode(state.mode); setValue(state.value); }, [state.mode, state.value]);
  const dirty = mode !== state.mode || value !== state.value;
  const amount = chargeAmount({ mode, value }, netMinor);
  const switchMode = (m: typeof mode) => {
    if (m === mode) return;
    setMode(m);
    setValue(m === "fixed" ? amount : netMinor > 0 ? Number(((amount / netMinor) * 100).toFixed(2)) : 0);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="w-32 text-sm font-medium">{label}</span>
      <div role="group" aria-label={`${label} mode`} className="flex overflow-hidden rounded-full border border-border-strong">
        {(["percent", "fixed"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)} className={cn("h-10 px-3 text-sm font-medium", mode === m ? "bg-sidebar-active-bg text-sidebar-active" : "text-fg hover:bg-fg/8", m === "fixed" && "border-l border-border-strong")}>{m === "percent" ? "%" : "Rs"}</button>
        ))}
      </div>
      {mode === "percent"
        ? <Input type="number" inputMode="decimal" min={0} step="0.5" value={value === 0 ? "" : value} onChange={(e) => setValue(Math.max(0, parseFloat(e.target.value || "0") || 0))} className="h-10 w-24 tabular" aria-label={`${label} percent`} />
        : <MoneyInput value={value} onChange={(v) => setValue(Math.max(0, v))} className="h-10 w-32" aria-label={`${label} amount`} />}
      <span className="text-sm text-fg-secondary tabular">= {formatMoney(amount, currency)}</span>
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="secondary" disabled={!dirty || busy} onClick={() => onApply({ mode, value })}>Apply</Button>
        <Button size="sm" variant="ghost" disabled={busy || (state.value === 0 && !dirty)} onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}
