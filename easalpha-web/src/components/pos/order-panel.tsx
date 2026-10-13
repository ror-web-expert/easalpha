"use client";
import { Minus, Plus, Trash2, User, Grid3X3, Utensils, ShoppingBag, Bike, Coffee, Pause, Send, Banknote, StickyNote, BadgePercent, Receipt } from "lucide-react";
import type { Cart } from "@/store/cart";
import type { OrderType } from "@/lib/types";
import { lineTotals, type CartLine } from "@/lib/pricing";
import { chargeDisplay, resolveServiceCharge, totalsWithCharges } from "@/lib/pos-charges";
import { discountRows } from "@/lib/pos-discounts";
import { SALES_PERMISSION } from "@/lib/pos-rules";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge, Button } from "@/components/ui";

const TYPES: { value: OrderType; label: string; icon: React.ComponentType<{ className?: string }>; cls: string }[] = [
  { value: "dine_in", label: "Dine-in", icon: Utensils, cls: "data-[active=true]:bg-primary data-[active=true]:text-primary-fg" },
  { value: "takeaway", label: "Takeaway", icon: ShoppingBag, cls: "data-[active=true]:bg-accent data-[active=true]:text-accent-fg" },
  { value: "delivery", label: "Delivery", icon: Bike, cls: "data-[active=true]:bg-info data-[active=true]:text-info-fg" },
  { value: "walk_in", label: "Walk-in", icon: Coffee, cls: "data-[active=true]:bg-inverse data-[active=true]:text-inverse-fg" },
];

/** SPEC "Take Orders": a type the user may not take (SALES_WALKIN / SALES_TAKEAWAY / SALES_DELIVERY) is disabled, not hidden, so the row keeps its shape. */
export function OrderTypeSwitch({ value, onChange, allowed }: { value: OrderType; onChange: (t: OrderType) => void; allowed?: OrderType[] }) {
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-full border border-border-strong">
      {TYPES.map((t) => {
        const ok = !allowed || allowed.includes(t.value);
        return (
          <button key={t.value} data-active={value === t.value} disabled={!ok} onClick={() => ok && onChange(t.value)} title={ok ? t.label : `Needs the ${SALES_PERMISSION[t.value] ?? "orders.create"} permission`} className={cn("flex h-12 items-center justify-center gap-2 border-l border-border-strong text-sm font-medium tracking-[0.1px] text-fg transition-colors first:border-l-0 hover:bg-fg/8 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent", t.cls)}>
            <t.icon className="h-5 w-5" /><span className="hidden lg:inline">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  cart: Cart; currency?: string; settings?: Record<string, unknown>;
  onQty: (key: string, q: number) => void; onEditLine: (l: CartLine) => void; onOverride: (l: CartLine) => void; onRemove: (key: string) => void;
  onCustomer: () => void; onTable: () => void; onNotes: () => void; onStaffMeal: () => void;
  onHold: () => void; onSend: () => void; onPay: () => void; onNew: () => void; busy?: boolean; canOverride: boolean;
  /** SPEC "Editing a Reopened Order": false hides the remove-line control (DELETE_ORDER_ITEM) or the quantity-decrease control (MODIFY_REOPEN_DECREASE_QTY). */
  canRemove?: boolean; canDecrease?: boolean;
  /** SPEC "Direct Unpaid Orders": when given, a button that places (or completes) the order without the payment screen. */
  onPlaceUnpaid?: () => void; unpaidLabel?: string;
}

export function OrderPanel({ cart, currency, settings, onQty, onEditLine, onOverride, onRemove, onCustomer, onTable, onNotes, onStaffMeal, onHold, onSend, onPay, onNew, busy, canOverride, canRemove = true, canDecrease = true, onPlaceUnpaid, unpaidLabel }: Props) {
  // SPEC Charges: the same totals as the payment page, with the charges in force on this order, plus the cash rounding
  // and tips earlier payments stored (the server keeps both in the order's total).
  const t = totalsWithCharges(cart.lines, cart, { settings, staffMeal: cart.is_staff_meal, discount_minor: cart.discount_minor, rounding_minor: cart.rounding_minor, tip_minor: cart.tip_minor });
  const empty = cart.lines.length === 0;
  const paid = cart.paid_minor ?? 0;
  const due = Math.max(0, t.total_minor - paid);
  const reopened = !!cart.reopened;
  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {cart.label ?? "New order"}
            {cart.saved ? <Badge className="ml-2" variant={cart.local_only ? "warning" : "primary"}>{cart.local_only ? "on till" : cart.status}</Badge> : null}
            {reopened ? <Badge className="ml-1" variant="warning">reopened{cart.reopen_count && cart.reopen_count > 1 ? ` ×${cart.reopen_count}` : ""}</Badge> : null}
            {cart.is_staff_meal ? <Badge className="ml-1" variant="accent">staff meal</Badge> : null}
          </div>
          <div className="truncate text-xs text-fg-muted">{cart.lines.reduce((s, l) => s + l.quantity, 0)} items{paid ? ` · paid ${formatMoney(paid, currency)}` : ""}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onNew} title="New order (F1)">New</Button>
      </div>
      <div className="flex gap-1 border-b p-2">
        <button onClick={onCustomer} className={cn("flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-sm", cart.customer ? "border-primary bg-primary-soft" : "hover:bg-muted")}><User className="h-4 w-4 shrink-0" /><span className="truncate">{cart.customer?.name ?? "Customer (F3)"}</span></button>
        {cart.order_type === "dine_in" ? <button onClick={onTable} className={cn("flex h-11 items-center gap-1.5 rounded-md border px-3 text-sm", cart.table_id ? "border-primary bg-primary-soft" : "hover:bg-muted")}><Grid3X3 className="h-4 w-4" />{cart.table_code ?? "Table"}</button> : null}
        <button onClick={onNotes} className={cn("grid h-11 w-11 place-items-center rounded-md border", cart.notes ? "border-primary bg-primary-soft" : "hover:bg-muted")} title="Order notes"><StickyNote className="h-4 w-4" /></button>
        <button onClick={onStaffMeal} className={cn("grid h-11 w-11 place-items-center rounded-md border", cart.is_staff_meal ? "border-accent bg-accent-soft" : "hover:bg-muted")} title="Staff meal"><BadgePercent className="h-4 w-4" /></button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {empty ? <li className="px-4 py-12 text-center text-fg-muted">Tap items to add them. F2 searches.</li> : null}
        {reopened && (!canRemove || !canDecrease) ? <li className="px-3 py-2 text-xs text-fg-secondary">Reopened order: {!canRemove && !canDecrease ? "lines cannot be removed or reduced" : !canRemove ? "lines cannot be removed" : "quantities cannot be reduced"} with your permissions.</li> : null}
        {cart.lines.map((l) => {
          const lt = lineTotals(l);
          return (
            <li key={l.key} className="border-b px-3 py-2">
              <div className="flex items-start gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => onEditLine(l)}>
                  <div className="font-semibold leading-tight">{l.name}{l.sent ? <Badge className="ml-1" variant="info">sent</Badge> : null}</div>
                  {l.modifiers.length ? <div className="text-xs text-fg-secondary">{l.modifiers.map((m) => m.name).join(", ")}</div> : null}
                  {l.notes ? <div className="text-xs italic text-fg-secondary">“{l.notes}”</div> : null}
                  <div className="text-xs text-fg-muted">
                    {l.price_override_minor != null ? <span className="text-warning">override </span> : null}{formatMoney(l.price_override_minor ?? l.unit_price_minor, currency)}{lt.modifiers_minor ? ` + ${formatMoney(lt.modifiers_minor, currency)}` : ""} each
                    {lt.line_discount_minor ? <span className="text-success"> · {l.discount_type === "percent" ? `${Number(l.discount_value)}% off` : "discount"} -{formatMoney(lt.line_discount_minor, currency)}</span> : null}
                  </div>
                </button>
                <div className="text-right font-semibold tabular">{formatMoney(lt.line_total_minor, currency)}</div>
              </div>
              <div className="mt-1 flex items-center gap-1">
                {canDecrease ? <button className="grid h-11 w-11 place-items-center rounded-md border disabled:opacity-40" onClick={() => onQty(l.key, l.quantity - 1)} disabled={!canRemove && l.quantity <= 1} aria-label="Less"><Minus className="h-4 w-4" /></button> : null}
                <span className="w-10 text-center text-lg font-semibold tabular">{l.quantity}</span>
                <button className="grid h-11 w-11 place-items-center rounded-md border" onClick={() => onQty(l.key, l.quantity + 1)} aria-label="More"><Plus className="h-4 w-4" /></button>
                <div className="flex-1" />
                {canOverride && !l.open_item ? <button className="h-11 rounded-md border px-2 text-xs" onClick={() => onOverride(l)}>Price</button> : null}
                {canRemove ? <button className="grid h-11 w-11 place-items-center rounded-md text-danger hover:bg-danger-soft" onClick={() => onRemove(l.key)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {/* Short screens (a 1024 x 600 tablet): the breakdown folds away and the three buttons share one row, so the
          order list keeps room for several lines instead of one. The total and every button stay. */}
      <div className="border-t p-3 [@media(max-height:700px)]:py-2">
        <div className="space-y-0.5 text-sm text-fg-secondary [@media(max-height:700px)]:hidden">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{formatMoney(t.subtotal_minor, currency)}</span></div>
          {/* SPEC discounts: one row per applied line (voucher with its code, loyalty, the automatic regular discount) plus the item discounts. */}
          {discountRows(cart.discounts, t.discount_minor).map((d) => <div key={d.key} className="flex justify-between gap-2"><span className="truncate">{d.label}</span><span className="shrink-0 tabular">-{formatMoney(d.amount_minor, currency)}</span></div>)}
          {t.service_charge_minor ? <div className="flex justify-between"><span>Service charge {chargeDisplay(resolveServiceCharge(cart, settings), currency)}</span><span className="tabular">{formatMoney(t.service_charge_minor, currency)}</span></div> : null}
          {t.delivery_charge_minor ? <div className="flex justify-between"><span>Delivery</span><span className="tabular">{formatMoney(t.delivery_charge_minor, currency)}</span></div> : null}
          {t.tax_minor ? <div className="flex justify-between"><span>Tax</span><span className="tabular">{formatMoney(t.tax_minor, currency)}</span></div> : null}
          {t.rounding_minor ? <div className="flex justify-between"><span>Cash rounding</span><span className="tabular">{formatMoney(t.rounding_minor, currency)}</span></div> : null}
          {t.tip_minor ? <div className="flex justify-between"><span>Tip</span><span className="tabular">{formatMoney(t.tip_minor, currency)}</span></div> : null}
          {paid ? <div className="flex justify-between"><span>Total</span><span className="tabular">{formatMoney(t.total_minor, currency)}</span></div> : null}
          {paid ? <div className="flex justify-between"><span>Paid</span><span className="tabular">-{formatMoney(paid, currency)}</span></div> : null}
        </div>
        <div className="mt-1 flex items-baseline justify-between [@media(max-height:700px)]:mt-0"><span className="text-lg font-semibold">{paid ? "Due" : "Total"}</span><span className="text-3xl font-bold tabular [@media(max-height:700px)]:text-2xl">{formatMoney(paid ? due : t.total_minor, currency)}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:grid-cols-3">
          {reopened ? (
            <Button variant="secondary" size="lg" className="col-span-2 [@media(max-height:700px)]:col-span-1" onClick={onSend} disabled={empty || busy}><Send className="h-5 w-5" /> Save<span className="[@media(max-height:700px)]:hidden"> changes (F5)</span></Button>
          ) : (
            <>
              <Button variant="secondary" size="lg" onClick={onHold} disabled={empty || busy} title="Hold (F4)"><Pause className="h-5 w-5" /> Hold<span className="[@media(max-height:700px)]:hidden"> (F4)</span></Button>
              <Button variant="secondary" size="lg" onClick={onSend} disabled={empty || busy} title="Kitchen (F5)"><Send className="h-5 w-5" /> Kitchen<span className="[@media(max-height:700px)]:hidden"> (F5)</span></Button>
            </>
          )}
          {/* Short screens: drawn after Pay, so Hold, Kitchen and Pay share the first row and this one spans the second. */}
          {onPlaceUnpaid && !reopened ? <Button variant="secondary" size="lg" className="col-span-2 [@media(max-height:700px)]:order-last [@media(max-height:700px)]:col-span-3" onClick={onPlaceUnpaid} disabled={empty || busy} title="Skips the payment screen (Direct Unpaid Orders)"><Receipt className="h-5 w-5" /> {unpaidLabel ?? "Place unpaid"}</Button> : null}
          <Button size="xl" className={cn("col-span-2 h-14 text-lg [@media(max-height:700px)]:h-12", reopened ? "[@media(max-height:700px)]:col-span-2" : "[@media(max-height:700px)]:col-span-1")} onClick={onPay} disabled={empty || busy} loading={busy} title={reopened ? "Save and pay (F8)" : "Pay (F8)"}><Banknote className="h-6 w-6" /> {reopened ? "Save and pay" : "Pay"}<span className="[@media(max-height:700px)]:hidden"> (F8)</span></Button>
        </div>
      </div>
    </div>
  );
}
