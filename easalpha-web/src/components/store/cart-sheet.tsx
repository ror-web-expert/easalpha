"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Minus, Plus, Trash2, ShoppingBag, Phone, MessageCircle, Bike, Store as StoreIcon } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Storefront, StorefrontOrder } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { cn, uuid } from "@/lib/utils";
import { Button, Field, Input, Sheet, Spinner, Textarea } from "@/components/ui";
import { useStorefrontCart } from "@/store/storefront-cart";
import {
  canDeliver, checkoutProblems, count, deliveryEnabled, deliveryLine, isFinalStage, stageLabel, subtotal, trackingSteps, type DeliverySettings,
} from "./cart-helpers";
import { themeInk } from "./storefront-helpers";
import { billRows } from "@/lib/bill";

// The guest's cart on the public storefront: a right-hand sheet with the lines, the checkout form and, once an order is
// placed, a live tracking view polled every 10 s until the order is done, rejected or cancelled. The sheet renders in a
// portal outside the storefront's <main>, so the theme colour is passed in and re-applied here as CSS variables.

export type CartSheetView = "cart" | "tracking";

interface ThemeProps { theme: string; onTheme: string }

function themeVars({ theme, onTheme }: ThemeProps): CSSProperties {
  return { ["--primary" as string]: theme, ["--primary-fg" as string]: onTheme, ["--primary-hover" as string]: theme };
}

/** A filled button in the storefront's theme colour (the Button "primary" variant is EasAlpha orange, which is not the store's brand). */
export function ThemeButton({ theme, onTheme, className, style, ...props }: ThemeProps & React.ComponentProps<typeof Button>) {
  return <Button {...props} className={cn("hover:brightness-110", className)} style={{ backgroundColor: theme, color: onTheme, ...style }} />;
}

/** The − qty + control shown on a menu row and in the cart once a line exists. */
export function QtyStepper({ quantity, onIncrement, onDecrement, theme, size = "md", label }: { quantity: number; onIncrement: () => void; onDecrement: () => void; theme: string; size?: "sm" | "md"; label?: string }) {
  const h = size === "sm" ? "h-8" : "h-9";
  const w = size === "sm" ? "w-8" : "w-9";
  const ink = themeInk(theme); // a light brand colour would vanish as icon colour on white
  return (
    <div className={cn("inline-flex items-center rounded-full border-2 bg-card", h)} style={{ borderColor: theme }} role="group" aria-label={label ? `${label} quantity` : "Quantity"}>
      <button type="button" onClick={onDecrement} aria-label={quantity === 1 ? "Remove" : "Decrease quantity"} className={cn("grid place-items-center rounded-full hover:bg-fg/8", h, w)} style={{ color: ink }}>
        {quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular" aria-live="polite">{quantity}</span>
      <button type="button" onClick={onIncrement} aria-label="Increase quantity" className={cn("grid place-items-center rounded-full hover:bg-fg/8", h, w)} style={{ color: ink }}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Sticky bottom bar: "N items · Rs total" with View cart, or Track my order when the basket is empty but an order is live. */
export function CartBar({ currency, theme, onTheme, onOpen }: { currency: string; theme: string; onTheme: string; onOpen: (view: CartSheetView) => void }) {
  const hydrated = useStorefrontCart((s) => s.hydrated);
  const lines = useStorefrontCart((s) => s.lines);
  const lastOrder = useStorefrontCart((s) => s.lastOrder);
  if (!hydrated) return null;
  const n = count(lines);
  if (!n && !lastOrder) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 sm:bottom-5 sm:px-4" style={themeVars({ theme, onTheme })}>
      <div className="mx-auto flex max-w-2xl items-center gap-3 border-t bg-card/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.25)] backdrop-blur sm:rounded-2xl sm:border sm:px-5 sm:shadow-[0_24px_60px_-24px_rgb(0_0_0/0.45)]">
        {n ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{n} item{n === 1 ? "" : "s"} · {formatMoney(subtotal(lines), currency)}</div>
              <div className="truncate text-xs text-fg-secondary">Delivery charge added at checkout</div>
            </div>
            <ThemeButton theme={theme} onTheme={onTheme} size="lg" onClick={() => onOpen("cart")}><ShoppingBag className="h-5 w-5" /> View cart</ThemeButton>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1 text-sm font-semibold">Your order is on its way through the kitchen</div>
            <ThemeButton theme={theme} onTheme={onTheme} size="lg" onClick={() => onOpen("tracking")}>Track my order</ThemeButton>
          </>
        )}
      </div>
    </div>
  );
}

interface CartSheetProps extends ThemeProps {
  slug: string;
  data: Storefront;
  open: boolean;
  view: CartSheetView;
  onViewChange: (v: CartSheetView) => void;
  onClose: () => void;
  /** false while online ordering is off or the site is in maintenance: the cart shows but Place order is blocked. */
  canOrder: boolean;
  closedMessage: string;
}

export function CartSheet(props: CartSheetProps) {
  const { open, view, onClose, theme, onTheme } = props;
  const lastOrder = useStorefrontCart((s) => s.lastOrder);
  const showTracking = view === "tracking" && !!lastOrder;
  return (
    <Sheet open={open} onClose={onClose} title={showTracking ? "Your order" : "Your cart"} className="sm:max-w-md">
      <div style={themeVars({ theme, onTheme })}>
        {showTracking ? <TrackingView {...props} /> : <CheckoutView {...props} />}
      </div>
    </Sheet>
  );
}

// ---- Cart + checkout ----

function CheckoutView({ slug, data, theme, onTheme, onViewChange, canOrder, closedMessage, onClose }: CartSheetProps) {
  const cfg = data.config;
  const delivery = (cfg.delivery ?? {}) as DeliverySettings;
  const currency = data.business.currency;
  const showPrices = cfg.pricing?.show_prices !== false;
  const cart = useStorefrontCart();
  const clientId = useRef(uuid());
  const deliveryOn = deliveryEnabled(delivery);
  // Delivery turned off in Website Config while a guest had it selected: fall back to pickup.
  const orderType = cart.order_type;
  const setOrderType = cart.setOrderType;
  useEffect(() => { if (!deliveryOn && orderType === "delivery") setOrderType("takeaway"); }, [deliveryOn, orderType, setOrderType]);

  const sub = subtotal(cart.lines);
  const problems = checkoutProblems({ lines: cart.lines, order_type: cart.order_type, customer: cart.customer, delivery, currency });
  const deliverable = cart.order_type === "delivery" ? canDeliver(delivery, sub, currency) : { ok: true, reason: null };
  const place = useMutation({
    mutationFn: () => api<StorefrontOrder>(`/public/storefront/${encodeURIComponent(slug)}/orders`, {
      method: "POST", auth: "none",
      body: {
        lines: cart.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id ?? undefined, quantity: l.quantity })),
        order_type: cart.order_type,
        customer: {
          name: cart.customer.name.trim(), phone: cart.customer.phone.trim(),
          ...(cart.order_type === "delivery" ? { address: cart.customer.address.trim(), area: cart.customer.area.trim() || undefined, city: cart.customer.city.trim() || undefined } : {}),
        },
        notes: cart.notes.trim() || undefined,
        client_id: clientId.current,
      },
    }),
    onSuccess: (o) => {
      cart.setLastOrder({ id: o.id, guest_token: o.guest_token });
      cart.clear();
      cart.setNotes("");
      clientId.current = uuid();
      onViewChange("tracking");
    },
  });
  const canPlace = canOrder && problems.length === 0 && !place.isPending;

  if (!cart.lines.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full" style={{ backgroundColor: `${theme}1a`, color: theme }}><ShoppingBag className="h-7 w-7" /></span>
        <p className="text-base font-medium">Your cart is empty</p>
        <p className="text-sm text-fg-secondary">Add something from the menu to get started.</p>
        <Button variant="secondary" onClick={onClose}>Back to the menu</Button>
        {cart.lastOrder ? <Button variant="link" onClick={() => onViewChange("tracking")}>Track my last order</Button> : null}
      </div>
    );
  }

  return (
    <form className="space-y-5 pb-4" onSubmit={(e) => { e.preventDefault(); if (canPlace) place.mutate(); }}>
      <ul className="divide-y rounded-xl border bg-card">
        {cart.lines.map((l) => (
          <li key={l.key} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{l.name}{l.variant_name ? <span className="text-fg-secondary"> · {l.variant_name}</span> : null}</div>
              {showPrices ? <div className="text-xs text-fg-secondary tabular">{formatMoney(l.unit_minor, currency)} each</div> : null}
            </div>
            <QtyStepper size="sm" theme={theme} quantity={l.quantity} label={l.name} onIncrement={() => cart.increment(l.key)} onDecrement={() => cart.decrement(l.key)} />
            {showPrices ? <div className="w-20 text-right text-sm font-medium tabular">{formatMoney(l.unit_minor * l.quantity, currency)}</div> : null}
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-fg-secondary">Subtotal · {count(cart.lines)} item{count(cart.lines) === 1 ? "" : "s"}</span>
          {showPrices ? <span className="font-semibold tabular">{formatMoney(sub, currency)}</span> : null}
        </li>
      </ul>

      <div>
        <span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">How would you like your order?</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Order type">
          {deliveryOn ? (
            <OrderTypeOption active={cart.order_type === "delivery"} onClick={() => cart.setOrderType("delivery")} theme={theme} onTheme={onTheme} icon={<Bike className="h-4 w-4" />} label="Delivery" />
          ) : null}
          <OrderTypeOption active={cart.order_type === "takeaway"} onClick={() => cart.setOrderType("takeaway")} theme={theme} onTheme={onTheme} icon={<StoreIcon className="h-4 w-4" />} label="Pickup" />
        </div>
        {cart.order_type === "delivery" && deliveryOn ? <p className="mt-2 text-xs text-fg-secondary">{deliveryLine(delivery, currency)}. The delivery charge is shown on your order once it is placed.</p> : null}
        {cart.order_type === "takeaway" ? <p className="mt-2 text-xs text-fg-secondary">Collect your order from {data.branch?.name ? `the ${data.branch.name} branch` : "the restaurant"}{data.branch?.address ? ` at ${data.branch.address}` : ""}.</p> : null}
        {!deliverable.ok && deliverable.reason ? <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-ink">{deliverable.reason}</p> : null}
      </div>

      <div className="space-y-3">
        <Field label="Your name"><Input value={cart.customer.name} onChange={(e) => cart.setCustomer({ name: e.target.value })} autoComplete="name" placeholder="Full name" required /></Field>
        <Field label="Phone" hint="Pakistani mobile, for example +92 300 1234567"><Input type="tel" inputMode="tel" value={cart.customer.phone} onChange={(e) => cart.setCustomer({ phone: e.target.value })} autoComplete="tel" placeholder="+92 3xx xxxxxxx" required /></Field>
        {cart.order_type === "delivery" ? (
          <>
            <Field label="Delivery address"><Textarea className="min-h-16" value={cart.customer.address} onChange={(e) => cart.setCustomer({ address: e.target.value })} autoComplete="street-address" placeholder="House, street, landmark" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Area"><Input value={cart.customer.area} onChange={(e) => cart.setCustomer({ area: e.target.value })} placeholder="Gulberg" /></Field>
              <Field label="City"><Input value={cart.customer.city} onChange={(e) => cart.setCustomer({ city: e.target.value })} autoComplete="address-level2" placeholder="Lahore" /></Field>
            </div>
          </>
        ) : null}
        <Field label="Notes for the kitchen (optional)"><Textarea className="min-h-16" value={cart.notes} onChange={(e) => cart.setNotes(e.target.value)} placeholder="Less spicy, no onions, ring the bell" maxLength={500} /></Field>
      </div>

      {!canOrder ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-fg-secondary">{closedMessage}</p> : null}
      {place.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">{errorMessage(place.error)}</p> : null}
      {canOrder && problems.length && (cart.customer.name || cart.customer.phone) ? <p className="text-xs text-fg-muted">{problems[0]}</p> : null}
      <ThemeButton type="submit" theme={theme} onTheme={onTheme} size="lg" className="w-full" disabled={!canPlace} loading={place.isPending}>
        {place.isPending ? "Placing your order" : showPrices ? `Place order · ${formatMoney(sub, currency)}` : "Place order"}
      </ThemeButton>
    </form>
  );
}

function OrderTypeOption({ active, onClick, theme, onTheme, icon, label }: { active: boolean; onClick: () => void; theme: string; onTheme: string; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 text-sm font-medium transition-colors", active ? "" : "border-border-strong hover:bg-fg/8")} style={active ? { backgroundColor: theme, borderColor: theme, color: onTheme } : undefined}>
      {icon} {label}
    </button>
  );
}

// ---- Tracking ----

function TrackingView({ slug, data, theme, onTheme, onClose }: CartSheetProps) {
  const lastOrder = useStorefrontCart((s) => s.lastOrder);
  const setLastOrder = useStorefrontCart((s) => s.setLastOrder);
  const q = useQuery({
    queryKey: ["storefront-order", slug, lastOrder?.id, lastOrder?.guest_token],
    queryFn: () => api<StorefrontOrder>(`/public/storefront/${encodeURIComponent(slug)}/orders/${encodeURIComponent(lastOrder!.id)}`, { auth: "none", query: { guest_token: lastOrder!.guest_token } }),
    enabled: !!lastOrder,
    retry: 1,
    refetchInterval: (query) => (isFinalStage(query.state.data?.stage) ? false : 10_000),
  });
  const order = q.data;
  const phone = (typeof data.config.contact?.phone === "string" && data.config.contact.phone) || data.business.phone || "";
  const waNumber = (typeof data.config.whatsapp?.number === "string" && data.config.whatsapp.number) || (typeof data.config.contact?.whatsapp === "string" && data.config.contact.whatsapp) || data.business.phone || "";
  const waHref = waNumber ? `https://wa.me/${waNumber.replace(/[^0-9]/g, "")}` : null;

  const orderAgain = () => {
    if (order && isFinalStage(order.stage)) setLastOrder(null);
    onClose();
    if (typeof document !== "undefined") document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (q.isLoading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-muted"><Spinner /> Finding your order</div>;
  if (q.error || !order) {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-base font-medium">We could not find that order</p>
        <p className="text-sm text-fg-secondary">{q.error ? errorMessage(q.error) : "The link may have expired."}{phone ? ` Call the restaurant on ${phone} if you need help.` : ""}</p>
        <div className="flex justify-center gap-2"><Button variant="secondary" onClick={() => q.refetch()}>Try again</Button><ThemeButton theme={theme} onTheme={onTheme} onClick={() => { setLastOrder(null); onClose(); }}>Back to the menu</ThemeButton></div>
      </div>
    );
  }

  const label = stageLabel(order.stage, order.order_type); // the ETA is shown once, in the pill below
  const steps = trackingSteps(order.order_type);
  const failed = label.tone === "failed";
  const final = isFinalStage(order.stage);
  const orderNo = order.label && order.label !== "draft" ? order.label : null;
  return (
    <div className="space-y-5 pb-4">
      <div className={cn("rounded-xl px-4 py-4", failed ? "bg-danger-soft text-danger-ink" : "")} style={failed ? undefined : { backgroundColor: `${theme}14` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.6px] text-fg-secondary">{orderNo ? `Order ${orderNo.startsWith("#") ? orderNo : `#${orderNo}`}` : order.order_type === "delivery" ? "Delivery order" : "Pickup order"}</div>
            <h3 className={cn("mt-0.5 text-lg font-medium", failed ? "text-danger-ink" : "")}>{label.title}</h3>
          </div>
          {!final ? <Spinner className="mt-1" /> : label.tone === "done" ? <span className="grid h-8 w-8 place-items-center rounded-full" style={{ backgroundColor: theme, color: onTheme }}><Check className="h-5 w-5" /></span> : null}
        </div>
        <p className={cn("mt-1 text-sm", failed ? "text-danger-ink" : "text-fg-secondary")}>{label.text}</p>
        {!final && order.order_type === "delivery" && order.eta_minutes ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium"><Bike className="h-3.5 w-3.5" /> Estimated delivery in about {order.eta_minutes} minutes</p> : null}
        {failed ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {phone ? <a href={`tel:${phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-danger px-4 text-sm font-medium text-danger-fg"><Phone className="h-4 w-4" /> Call {phone}</a> : null}
            {waHref ? <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-danger px-4 text-sm font-medium text-danger-ink"><MessageCircle className="h-4 w-4" /> WhatsApp</a> : null}
          </div>
        ) : null}
      </div>

      {!failed ? (
        <ol className="space-y-0" aria-label="Order progress">
          {steps.map((s, i) => {
            const n = i + 1;
            const done = n < label.step || (n === label.step && label.tone === "done");
            const current = n === label.step && label.tone !== "done";
            return (
              <li key={s} className="flex items-stretch gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold", done || current ? "" : "border-border text-fg-muted")} style={done ? { backgroundColor: theme, borderColor: theme, color: onTheme } : current ? { borderColor: theme, color: theme } : undefined}>
                    {done ? <Check className="h-4 w-4" /> : n}
                  </span>
                  {i < steps.length - 1 ? <span className="my-1 w-0.5 flex-1 rounded" style={{ backgroundColor: done ? theme : "var(--border)" , minHeight: 16 }} /> : null}
                </div>
                <div className={cn("pb-4 pt-1 text-sm", current ? "font-semibold" : done ? "" : "text-fg-muted")}>{s}{current && !final ? <span className="ml-2 text-xs font-normal text-fg-secondary">now</span> : null}</div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="rounded-xl border bg-card">
        <ul className="divide-y">
          {order.items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="tabular text-fg-secondary">{Number(it.quantity)} ×</span> {it.name}</span><span className="tabular">{formatMoney(it.line_subtotal_minor ?? it.line_total_minor, order.currency)}</span></li>
          ))}
        </ul>
        <dl className="space-y-1 border-t px-4 py-3 text-sm">
          {/* The shared bill block (lib/bill.ts): the lines add up to the Subtotal and these rows add up to the Total. */}
          {billRows({ ...order, delivery_label: "Delivery charge" }, order.currency).map((r) => (
            <div key={r.key} className={cn("flex justify-between", r.info && "text-xs")}><dt className="text-fg-secondary">{r.label}</dt><dd className="tabular">{r.amount_minor < 0 ? `-${formatMoney(-r.amount_minor, order.currency)}` : formatMoney(r.amount_minor, order.currency)}</dd></div>
          ))}
          {order.order_type === "delivery" && !order.delivery_charge_minor ? <div className="flex justify-between"><dt className="text-fg-secondary">Delivery charge</dt><dd className="tabular">Free</dd></div> : null}
          <div className="flex justify-between pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(order.total_minor, order.currency)}</dd></div>
        </dl>
      </div>

      {order.order_type === "delivery" && order.customer.address ? (
        <div className="text-sm"><div className="text-xs font-medium tracking-[0.4px] text-fg-secondary">Delivering to</div><div className="mt-0.5">{order.customer.name ? `${order.customer.name} · ` : ""}{order.customer.address}</div></div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ThemeButton theme={theme} onTheme={onTheme} size="lg" className="flex-1" onClick={orderAgain}>Order again</ThemeButton>
        {phone && !failed ? <a href={`tel:${phone}`} className="inline-flex h-12 items-center gap-2 rounded-full border border-border-strong px-5 text-sm font-medium hover:bg-fg/8"><Phone className="h-4 w-4" /> Call</a> : null}
      </div>
      {!final ? <p className="text-xs text-fg-muted">Keep this page open to follow your order. It refreshes every 10 seconds.</p> : null}
    </div>
  );
}
