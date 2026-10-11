"use client";
import { useEffect, useMemo, useState } from "react";
import { Gift, Tag, Ticket, Trash2 } from "lucide-react";
import type { LoyaltyRedemptionOption, Order } from "@/lib/types";
import type { Cart } from "@/store/cart";
import { formatMoney } from "@/lib/money";
import { errorMessage } from "@/lib/api";
import { getCustomerLoyalty, redeemPointsOnOrder, type CustomerLoyalty } from "@/lib/till-extras";
import { applyCoupon, applyVoucher, discountLabel, discountLocked, discountRows, listRedemptionOptions, optionAvailability, optionGives, redeemOption, removeDiscount, voucherError } from "@/lib/pos-discounts";
import { Badge, Button, Field, Input } from "@/components/ui";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

/** Runs a server call against the order (saving the cart first) and replaces the cart with the re-priced order. */
export type DiscountRunner = (fn: (orderId: string) => Promise<Order>, label: string) => Promise<boolean>;

interface Props {
  cart: Cart; currency?: string; online: boolean; busy: boolean;
  /** True once money has been taken against the order (or it is a staff meal): the discounts can no longer change. */
  locked: boolean;
  /** Total discount in force locally (product discounts plus the applied lines), for the "Item discounts" row. */
  totalDiscountMinor: number;
  onRun: DiscountRunner;
}

/**
 * SPEC "Three discount mechanisms" on the payment page. Applied lines show by kind: a voucher with its code and a remove
 * action, loyalty points, a promotion coupon, and the regular discount the server applied by itself (labelled, not
 * editable). Below them: a coupon code and a voucher code entry, then the loyalty section for the attached customer with
 * a points entry and the redemption options as buttons (disabled while the customer lacks the points). Everything here
 * needs the server, so offline the controls are disabled with a note.
 */
export function DiscountsPanel({ cart, currency, online, busy, locked, totalDiscountMinor, onRun }: Props) {
  const [coupon, setCoupon] = useState("");
  const [voucher, setVoucher] = useState("");
  const [voucherErr, setVoucherErr] = useState<string | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [points, setPoints] = useState("");
  const [loyalty, setLoyalty] = useState<CustomerLoyalty | null>(null);
  const [options, setOptions] = useState<LoyaltyRedemptionOption[]>([]);
  const customerId = cart.customer?.id ?? null;
  const lines = useMemo(() => cart.discounts ?? [], [cart.discounts]);
  const hasVoucher = lines.some((d) => d.kind === "voucher");
  const hasLoyalty = lines.some((d) => d.kind === "loyalty");
  const rows = useMemo(() => discountRows(lines, totalDiscountMinor), [lines, totalDiscountMinor]);
  const disabled = !online || locked || busy;

  // The customer's balance comes from the server (GET /customers/:id/loyalty); refreshed after each redemption.
  useEffect(() => {
    if (!online || !customerId) { setLoyalty(null); return; }
    let live = true;
    getCustomerLoyalty(customerId).then((l) => { if (live) setLoyalty(l); }).catch(() => { if (live) setLoyalty(null); });
    return () => { live = false; };
  }, [online, customerId, hasLoyalty]);
  useEffect(() => {
    if (!online) return;
    listRedemptionOptions().then(setOptions).catch(() => setOptions([]));
  }, [online]);

  const applyVoucherCode = async () => {
    const code = voucher.trim();
    if (!code) return;
    setVoucherErr(null);
    try {
      const ok = await onRun((id) => applyVoucher(id, code), `Apply voucher ${code.toUpperCase()}`);
      if (ok) { setVoucher(""); toast.success("Voucher applied", `${code.toUpperCase()} is on this order.`); }
    } catch (e) { const v = voucherError(e); setVoucherErr(v.message); toast.error(v.title, v.message); }
  };
  const applyCouponCode = async () => {
    const code = coupon.trim();
    if (!code) return;
    setCouponErr(null);
    try {
      const ok = await onRun((id) => applyCoupon(id, code), `Apply coupon ${code.toUpperCase()}`);
      if (ok) { setCoupon(""); toast.success("Coupon applied"); }
    } catch (e) { setCouponErr(errorMessage(e)); toast.error("Could not apply the coupon", errorMessage(e)); }
  };
  const remove = async (discountId: string, label: string) => {
    try { if (await onRun((id) => removeDiscount(id, discountId), `Remove ${label}`)) toast.success("Discount removed"); }
    catch (e) { toast.error("Could not remove the discount", errorMessage(e)); }
  };
  const redeemPoints = async () => {
    const n = Math.floor(Number(points));
    if (!n || n <= 0) return;
    try {
      if (await onRun((id) => redeemPointsOnOrder(id, n), `Redeem ${n} points`)) { setPoints(""); toast.success(`${n} points redeemed`); }
    } catch (e) { toast.error("Could not redeem points", errorMessage(e)); }
  };
  const redeem = async (o: LoyaltyRedemptionOption) => {
    try { if (await onRun((id) => redeemOption(id, o.id), `Redeem ${o.name}`)) toast.success(`${o.name} applied`, `${o.points} points used.`); }
    catch (e) { toast.error("Could not redeem", errorMessage(e)); }
  };

  const balance = loyalty?.points ?? null;
  const productIds = cart.lines.filter((l) => l.status !== "cancelled" && l.product_id).map((l) => l.product_id as string);
  const ctx = { points: balance, hasCustomer: !!customerId, alreadyRedeemed: hasLoyalty, online, productIds };
  const pointsOk = !disabled && !!customerId && !hasLoyalty && balance !== null && balance > 0 && Number(points) > 0 && Number(points) <= balance;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Discounts</span>
        {!online ? <span className="text-xs text-fg-muted">Vouchers and loyalty need the internet.</span> : locked ? <span className="text-xs text-fg-muted">Locked once a payment is taken.</span> : null}
      </div>
      {rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{r.label}</span>
                {r.kind === "regular" ? <Badge variant="info" title="Applied automatically from the regular discount tiers">automatic</Badge> : null}
                {r.kind === "voucher" ? <Badge variant="accent">voucher</Badge> : null}
                {r.kind === "loyalty" ? <Badge variant="success">loyalty</Badge> : null}
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular">
                -{formatMoney(r.amount_minor, currency)}
                {r.id && !r.locked ? <button onClick={() => remove(r.id!, r.label)} disabled={disabled} aria-label={`Remove ${r.label}`} className="disabled:opacity-40"><Trash2 className="h-4 w-4 text-danger" /></button> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Coupon code" error={couponErr ?? undefined}>
          <form onSubmit={(e) => { e.preventDefault(); applyCouponCode(); }} className="flex gap-1">
            <Input value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponErr(null); }} placeholder="Promotion coupon" className="h-11 font-mono uppercase" disabled={disabled} aria-label="Coupon code" />
            <Button type="submit" variant="secondary" size="lg" className="h-11" disabled={disabled || !coupon.trim()}><Tag className="h-4 w-4" /> Apply</Button>
          </form>
        </Field>
        <Field label="Voucher code" error={voucherErr ?? undefined} hint={hasVoucher ? "One voucher per order. Remove it to use another." : undefined}>
          <form onSubmit={(e) => { e.preventDefault(); applyVoucherCode(); }} className="flex gap-1">
            <Input value={voucher} onChange={(e) => { setVoucher(e.target.value.toUpperCase()); setVoucherErr(null); }} placeholder="Personal or public code" className="h-11 font-mono uppercase" disabled={disabled || hasVoucher} aria-label="Voucher code" />
            <Button type="submit" variant="secondary" size="lg" className="h-11" disabled={disabled || hasVoucher || !voucher.trim()}><Ticket className="h-4 w-4" /> Apply</Button>
          </form>
        </Field>
      </div>
      <div className="space-y-2 border-t pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Loyalty points</span>
          {!customerId ? <span className="text-xs text-fg-muted">Attach a customer (F3) to use points.</span>
            : !online ? <span className="text-xs text-fg-muted">Balance available when online.</span>
            : loyalty ? <span className="text-xs text-fg-secondary">{cart.customer?.name} has <strong className="tabular">{loyalty.points}</strong> points{loyalty.value_minor ? ` (worth ${formatMoney(loyalty.value_minor, currency)})` : ""}</span>
            : <span className="text-xs text-fg-muted">Loading balance</span>}
        </div>
        {customerId ? (
          <>
            <form onSubmit={(e) => { e.preventDefault(); redeemPoints(); }} className="flex gap-1">
              <Input type="number" inputMode="numeric" min={1} step={1} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Points to redeem" className="h-11 tabular" disabled={disabled || hasLoyalty || !balance} aria-label="Points to redeem" />
              <Button type="submit" variant="secondary" size="lg" className="h-11" disabled={!pointsOk}>Redeem</Button>
            </form>
            {hasLoyalty ? <p className="text-xs text-fg-muted">Points were redeemed on this order. Remove that line to change it.</p> : null}
            {options.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {options.map((o) => {
                  const a = optionAvailability(o, ctx);
                  const ok = a.ok && !disabled;
                  return (
                    <button key={o.id} onClick={() => ok && redeem(o)} disabled={!ok} title={a.reason ?? optionGives(o, currency)} className={cn("flex min-h-16 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40", ok ? "bg-card hover:bg-muted" : "bg-muted/40")}>
                      <span className="flex w-full items-center justify-between gap-2 font-semibold"><span className="truncate">{o.name}</span><Gift className="h-4 w-4 shrink-0 text-fg-muted" /></span>
                      <span className="text-xs text-fg-secondary">{o.points} points · {optionGives(o, currency)}</span>
                      {a.reason && !a.ok && a.reason !== "Loading points" ? <span className="text-[11px] text-fg-muted">{a.reason}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : online ? <p className="text-xs text-fg-muted">No redemption options set up. Points can still be redeemed as an amount.</p> : null}
          </>
        ) : null}
      </div>
      {lines.some(discountLocked) ? <p className="text-xs text-fg-muted">{discountLabel(lines.find(discountLocked)!)} was applied by the system from this customer&apos;s recent orders. It cannot be edited here.</p> : null}
    </div>
  );
}
