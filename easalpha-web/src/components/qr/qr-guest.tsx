"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChefHat, Minus, Plus, ReceiptText, ShoppingBag, Trash2, Utensils, X } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { ModifierGroup, Product, Variant } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { cn, uuid } from "@/lib/utils";
import { Dialog, Loading, Sheet, Spinner } from "@/components/ui";
import { DishImage } from "@/components/store/dish-placeholder";
import { billRows } from "@/lib/bill";
import {
  EMPTY_GUEST, qrAddLine, qrCartLabel, qrCount, qrGroupsFor, qrIsFinal, qrLineTotal, qrModifierProblem, qrOrderLines, qrPrice, qrSetQuantity, qrStage, qrStageText, qrSubtotal, qrToggleModifier,
  readGuestState, writeGuestState, type QrBill, type QrCartLine, type QrCartModifier, type QrGuestOrder, type QrGuestState, type QrMenu,
} from "@/lib/qr-guest";

// Guest QR ordering (SPEC "QR ordering"): the live menu for one table on the guest's phone, a cart kept on the phone
// per table, Place order (the counter accepts it first when the branch says so), live status every 10 s, the table's
// running bill, Call a waiter and Ask for the bill. Branded with the business logo and name. Light only.

const THEME = "#10294d";

export function useQrMenu(token: string) {
  return useQuery({ queryKey: ["qr", token], queryFn: () => api<QrMenu>(`/qr/${encodeURIComponent(token)}`, { auth: "none" }), retry: false, enabled: !!token, staleTime: 60_000 });
}

export function QrGuestPage({ token }: { token: string }) {
  const q = useQrMenu(token);
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => { if (prev) root.setAttribute("data-theme", prev); else root.removeAttribute("data-theme"); };
  }, []);
  useEffect(() => { if (q.data) document.title = `${q.data.business.name} · Table ${q.data.table.code}`; }, [q.data]);
  if (q.isLoading) return <main className="min-h-screen bg-page"><Loading /></main>;
  if (q.error || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Utensils className="h-7 w-7 text-fg-muted" /></span>
        <h1 className="text-[22px] leading-7">{notFound ? "This table card is not valid" : "Something went wrong"}</h1>
        <p className="text-sm text-fg-secondary">{notFound ? "Ask a waiter for a fresh card, or order at the counter." : errorMessage(q.error)}</p>
      </main>
    );
  }
  return <GuestMenu token={token} menu={q.data} />;
}

function GuestMenu({ token, menu }: { token: string; menu: QrMenu }) {
  const qc = useQueryClient();
  const currency = menu.business.currency;
  const settings = menu.settings ?? {};
  const [state, setState] = useState<QrGuestState>(EMPTY_GUEST);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setState(readGuestState(token)); setHydrated(true); }, [token]);
  const update = useCallback((patch: Partial<QrGuestState> | ((s: QrGuestState) => Partial<QrGuestState>)) => {
    setState((s) => { const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) }; writeGuestState(token, next); return next; });
  }, [token]);

  const [picking, setPicking] = useState<Product | null>(null);
  const [sheet, setSheet] = useState<"cart" | "order" | "bill" | null>(null);
  const groups = menu.modifier_groups ?? [];
  const byCategory = useMemo(() => (menu.categories ?? []).map((c) => ({ ...c, products: (menu.products ?? []).filter((p) => p.category_id === c.id) })).filter((c) => c.products.length), [menu]);
  const deals = menu.deals ?? [];
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ids = [...(deals.length ? ["deals"] : []), ...byCategory.map((c) => c.id)];
    if (!ids.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = (barRef.current?.getBoundingClientRect().bottom ?? 100) + 12;
      let current = ids[0];
      for (const id of ids) { const el = document.getElementById(`qr-${id}`); if (el && el.getBoundingClientRect().top <= line) current = id; }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, [byCategory, deals.length]);

  const quickAdd = (p: Product & { price_minor: number }) => {
    const hasChoices = (p.variants?.length ?? 0) > 0 || qrGroupsFor(p, groups).length > 0;
    if (hasChoices) { setPicking(p); return; }
    update((s) => ({ lines: qrAddLine(s.lines, { product_id: p.id, variant_id: null, deal_id: null, name: p.name, detail: null, unit_minor: qrPrice(p, null, menu.branch.id), modifiers: [], notes: null, quantity: 1 }) }));
  };
  const addDeal = (d: { id: string; name: string; price_minor: number }) => update((s) => ({ lines: qrAddLine(s.lines, { product_id: null, variant_id: null, deal_id: d.id, name: d.name, detail: "Deal", unit_minor: d.price_minor, modifiers: [], notes: null, quantity: 1 }) }));
  const qtyOfProduct = (id: string) => (hydrated ? state.lines.filter((l) => l.product_id === id).reduce((n, l) => n + l.quantity, 0) : 0);
  const qtyOfDeal = (id: string) => (hydrated ? state.lines.filter((l) => l.deal_id === id).reduce((n, l) => n + l.quantity, 0) : 0);

  const request = useMutation({
    mutationFn: (kind: "call_waiter" | "ask_bill") => api<{ id: string; kind: string; handled: boolean }>(`/qr/${encodeURIComponent(token)}/requests`, { method: "POST", auth: "none", body: { kind, guest_name: state.guest_name || undefined } }),
  });
  const [requested, setRequested] = useState<string | null>(null);
  const ask = (kind: "call_waiter" | "ask_bill") => request.mutate(kind, { onSuccess: () => { setRequested(kind); setTimeout(() => setRequested(null), 6000); } });

  const bill = useQuery({
    queryKey: ["qr-bill", token], enabled: sheet === "bill" && settings.running_bill !== false,
    queryFn: () => api<QrBill>(`/qr/${encodeURIComponent(token)}/bill`, { auth: "none" }), refetchInterval: 15_000,
  });

  const cartCount = hydrated ? qrCount(state.lines) : 0;
  const barVisible = cartCount > 0 || (hydrated && !!state.lastOrder);
  const canOrder = menu.ordering;
  return (
    <main className={cn("min-h-screen bg-page text-fg", barVisible ? "pb-28" : "pb-10")} style={{ ["--primary" as string]: THEME, ["--primary-fg" as string]: "#ffffff", ["--primary-hover" as string]: THEME }}>
      <header className="text-white" style={{ background: `linear-gradient(135deg, ${THEME} 0%, #0b1f3a 100%)`, ["--heading-color" as string]: "#ffffff" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          {menu.business.logo_key ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.business.logo_key} alt={`${menu.business.name} logo`} className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-0.5" />
          ) : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 text-xl font-extrabold">{menu.business.name.charAt(0)}</span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight tracking-tight">{menu.business.name}</h1>
            <p className="text-xs text-white/75">{menu.branch.name}{menu.branch.address ? ` · ${menu.branch.address}` : ""}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">Table {menu.table.code}</span>
        </div>
        {settings.welcome ? <p className="mx-auto max-w-2xl px-4 pb-4 text-sm text-white/85">{settings.welcome}</p> : null}
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {(settings.call_waiter !== false || settings.ask_bill !== false || settings.running_bill !== false) ? (
          <div className="-mt-0 flex gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {settings.call_waiter !== false ? <ActionChip icon={Bell} label={requested === "call_waiter" ? "Waiter called" : "Call a waiter"} done={requested === "call_waiter"} onClick={() => ask("call_waiter")} busy={request.isPending} /> : null}
            {settings.ask_bill !== false ? <ActionChip icon={ReceiptText} label={requested === "ask_bill" ? "Bill requested" : "Ask for the bill"} done={requested === "ask_bill"} onClick={() => ask("ask_bill")} busy={request.isPending} /> : null}
            {settings.running_bill !== false ? <ActionChip icon={Utensils} label="Table bill" onClick={() => setSheet("bill")} /> : null}
          </div>
        ) : null}
        {request.error ? <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-ink">{errorMessage(request.error)}</p> : null}
        {!canOrder ? (
          <div className="my-6 rounded-2xl border bg-card px-4 py-6 text-center">
            <ChefHat className="mx-auto h-8 w-8 text-fg-muted" />
            <p className="mt-2 font-semibold text-heading">Ordering from the phone is off right now</p>
            <p className="mt-1 text-sm text-fg-secondary">{menu.message || "Please ask a waiter to take your order."}</p>
          </div>
        ) : (
          <>
            {byCategory.length > 1 || deals.length ? (
              <div ref={barRef} className="sticky top-0 z-20 -mx-4 bg-page/90 px-4 py-2 backdrop-blur-md">
                <nav aria-label="Menu categories" className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {[...(deals.length ? [{ id: "deals", name: "Deals" }] : []), ...byCategory].map((c) => (
                    <a key={c.id} href={`#qr-${c.id}`} aria-current={active === c.id ? "true" : undefined} onClick={(e) => { e.preventDefault(); document.getElementById(`qr-${c.id}`)?.scrollIntoView?.({ block: "start" }); setActive(c.id); }}
                      className={cn("inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition", active === c.id ? "border-transparent text-white" : "border-border bg-card text-fg-secondary")}
                      style={active === c.id ? { backgroundColor: THEME } : undefined}>{c.name}</a>
                  ))}
                </nav>
              </div>
            ) : null}
            {deals.length ? (
              <section id="qr-deals" aria-labelledby="qr-deals-title" className="scroll-mt-16 pt-3">
                <h2 id="qr-deals-title" className="mb-2 text-lg font-extrabold tracking-tight text-heading">Deals</h2>
                <ul className="space-y-2">
                  {deals.map((d) => (
                    <li key={d.id} className="flex gap-3 rounded-2xl border bg-card p-3">
                      <DishImage src={d.image_key} color={THEME} className="h-20 w-20 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold leading-snug text-heading">{d.name}</h3>
                        {d.description ? <p className="mt-0.5 line-clamp-2 text-xs text-fg-secondary">{d.description}</p> : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="font-extrabold tabular text-heading">{formatMoney(d.price_minor, currency)}</span>
                          {qtyOfDeal(d.id) ? <InCart n={qtyOfDeal(d.id)} onOpen={() => setSheet("cart")} /> : <AddButton label={`Add ${d.name}`} onClick={() => addDeal(d)} />}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {byCategory.map((c) => (
              <section key={c.id} id={`qr-${c.id}`} aria-labelledby={`qr-${c.id}-title`} className="scroll-mt-16 pt-5">
                <h2 id={`qr-${c.id}-title`} className="text-lg font-extrabold tracking-tight text-heading">{c.name}</h2>
                {c.subtitle ? <p className="text-xs text-fg-secondary">{c.subtitle}</p> : null}
                <ul className="mt-2 space-y-2">
                  {c.products.map((p) => {
                    const sizes = p.variants ?? [];
                    const from = sizes.length ? Math.min(...sizes.map((v) => qrPrice(p, v, menu.branch.id))) : qrPrice(p, null, menu.branch.id);
                    const n = qtyOfProduct(p.id);
                    return (
                      <li key={p.id} className="flex gap-3 rounded-2xl border bg-card p-3" style={n ? { borderColor: THEME } : undefined}>
                        <DishImage src={p.image_key} color={THEME} className="h-20 w-20 rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold leading-snug text-heading">{p.name}</h3>
                          {p.description ? <p className="mt-0.5 line-clamp-2 text-xs text-fg-secondary">{p.description}</p> : null}
                          {sizes.length ? <p className="mt-0.5 text-xs text-fg-muted">{sizes.map((v) => v.name).join(" · ")}</p> : null}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="font-extrabold tabular text-heading">{sizes.length ? <><span className="text-xs font-semibold text-fg-muted">From </span>{formatMoney(from, currency)}</> : formatMoney(from, currency)}</span>
                            {n ? <InCart n={n} onOpen={() => setSheet("cart")} /> : <AddButton label={`Add ${p.name}`} onClick={() => quickAdd(p)} choose={sizes.length > 0 || qrGroupsFor(p, groups).length > 0} />}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {!byCategory.length ? <p className="my-8 rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-sm text-fg-muted">The menu is being updated. Please ask a waiter.</p> : null}
          </>
        )}
        <p className="mt-10 text-center text-xs text-fg-muted">{menu.business.name}. Powered by EasAlpha.</p>
      </div>

      {barVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.25)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            {cartCount ? (
              <>
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{qrCartLabel(state.lines, currency)}</div><div className="truncate text-xs text-fg-secondary">Table {menu.table.code}{settings.cashier_accept ? " · the counter confirms your order" : ""}</div></div>
                <button type="button" onClick={() => setSheet("cart")} className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white" style={{ backgroundColor: THEME }}><ShoppingBag className="h-5 w-5" /> View order</button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1 text-sm font-semibold">Your order is in</div>
                <button type="button" onClick={() => setSheet("order")} className="inline-flex h-12 items-center rounded-full px-5 text-sm font-semibold text-white" style={{ backgroundColor: THEME }}>Track my order</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <ChoiceDialog product={picking} groups={groups} currency={currency} branchId={menu.branch.id} onClose={() => setPicking(null)}
        onAdd={(l) => { update((s) => ({ lines: qrAddLine(s.lines, l) })); setPicking(null); }} />
      <Sheet open={sheet === "cart"} onClose={() => setSheet(null)} title={`Your order · Table ${menu.table.code}`} side="bottom">
        <CartView token={token} menu={menu} state={state} update={update} onPlaced={() => { setSheet("order"); qc.invalidateQueries({ queryKey: ["qr-bill", token] }); }} onClose={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "order"} onClose={() => setSheet(null)} title="Your order" side="bottom">
        <TrackView token={token} menu={menu} state={state} update={update} onMenu={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "bill"} onClose={() => setSheet(null)} title={`Table ${menu.table.code} bill`} side="bottom">
        <BillView bill={bill.data ?? null} loading={bill.isLoading} currency={currency} canAsk={settings.ask_bill !== false} onAsk={() => ask("ask_bill")} asked={requested === "ask_bill"} />
      </Sheet>
    </main>
  );
}

function ActionChip({ icon: Icon, label, onClick, busy, done }: { icon: typeof Bell; label: string; onClick: () => void; busy?: boolean; done?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold transition disabled:opacity-60", done ? "border-success text-success-ink" : "border-border text-fg")}>
      {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  );
}

function AddButton({ label, onClick, choose }: { label: string; onClick: () => void; choose?: boolean }) {
  return <button type="button" onClick={onClick} aria-label={label} className="inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-semibold text-white shadow-sm active:scale-95" style={{ backgroundColor: THEME }}><Plus className="h-4 w-4" /> {choose ? "Choose" : "Add"}</button>;
}

function InCart({ n, onOpen }: { n: number; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="inline-flex h-9 items-center rounded-full border-2 px-3.5 text-sm font-bold" style={{ borderColor: THEME, color: THEME }}>{n} in order</button>;
}

/** Size, modifiers, quantity and a note for one dish, then Add. */
function ChoiceDialog({ product, groups: all, currency, branchId, onClose, onAdd }: { product: Product | null; groups: ModifierGroup[]; currency: string; branchId: string; onClose: () => void; onAdd: (line: Omit<QrCartLine, "key">) => void }) {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  useEffect(() => { setVariant(product?.variants?.[0] ?? null); setPicked({}); setQty(1); setNotes(""); }, [product]);
  if (!product) return null;
  const groups = qrGroupsFor(product, all);
  const problem = qrModifierProblem(groups, picked);
  const unit = qrPrice(product, variant, branchId);
  const mods: QrCartModifier[] = groups.flatMap((g) => g.modifiers.filter((m) => picked[m.id]).map((m) => ({ modifier_id: m.id, name: m.name, price_minor: m.price_minor, quantity: picked[m.id] })));
  const total = (unit + mods.reduce((s, m) => s + m.price_minor * m.quantity, 0)) * qty;
  const detail = [variant?.name, ...mods.map((m) => m.name)].filter(Boolean).join(", ") || null;
  return (
    <Dialog open onClose={onClose} title={product.name} description={product.description} size="sm">
      <div className="space-y-4 px-6 pb-6">
        {product.variants?.length ? (
          <div>
            <div className="mb-2 text-sm font-semibold">Size</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
              {product.variants.map((v) => <Chip key={v.id} active={variant?.id === v.id} onClick={() => setVariant(v)} role="radio" checked={variant?.id === v.id}>{v.name} <span className="text-fg-secondary">{formatMoney(qrPrice(product, v, branchId), currency)}</span></Chip>)}
            </div>
          </div>
        ) : null}
        {groups.map((g) => (
          <div key={g.id}>
            <div className="mb-2 text-sm font-semibold">{g.name} <span className="font-normal text-fg-muted">{g.required ? "required" : "optional"}{g.max_select ? ` · up to ${g.max_select}` : ""}</span></div>
            <div className="flex flex-wrap gap-2">{g.modifiers.map((m) => <Chip key={m.id} active={!!picked[m.id]} onClick={() => setPicked(qrToggleModifier(groups, picked, g.id, m.id))}>{m.name}{m.price_minor ? <span className="text-fg-secondary"> +{formatMoney(m.price_minor, currency)}</span> : null}</Chip>)}</div>
          </div>
        ))}
        <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Note for the kitchen (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="Less spicy, no onions" className="h-11 w-full rounded-xl border border-border-strong bg-transparent px-3 text-base focus-visible:border-primary focus-visible:outline-none" /></label>
        <div className="flex items-center justify-between gap-3">
          <Stepper quantity={qty} onDecrement={() => setQty((n) => Math.max(1, n - 1))} onIncrement={() => setQty((n) => Math.min(20, n + 1))} label={product.name} />
          <button type="button" disabled={!!problem} onClick={() => onAdd({ product_id: product.id, variant_id: variant?.id ?? null, deal_id: null, name: product.name, detail, unit_minor: unit, modifiers: mods, notes: notes.trim() || null, quantity: qty })}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-base font-semibold text-white disabled:opacity-40" style={{ backgroundColor: THEME }}>
            Add · {formatMoney(total, currency)}
          </button>
        </div>
        {problem ? <p className="text-xs text-fg-muted">{problem}</p> : null}
      </div>
    </Dialog>
  );
}

function Chip({ active, onClick, children, role, checked }: { active: boolean; onClick: () => void; children: React.ReactNode; role?: string; checked?: boolean }) {
  return <button type="button" role={role} aria-checked={role === "radio" ? checked : undefined} aria-pressed={role ? undefined : active} onClick={onClick} className={cn("inline-flex h-9 items-center rounded-full border-2 px-3 text-sm font-medium", active ? "text-white" : "border-border-strong/60 bg-card")} style={active ? { backgroundColor: THEME, borderColor: THEME } : undefined}>{children}</button>;
}

function Stepper({ quantity, onIncrement, onDecrement, label }: { quantity: number; onIncrement: () => void; onDecrement: () => void; label: string }) {
  return (
    <div className="inline-flex h-11 items-center rounded-full border-2 bg-card" style={{ borderColor: THEME }} role="group" aria-label={`${label} quantity`}>
      <button type="button" onClick={onDecrement} aria-label={quantity === 1 ? "Remove" : "Decrease quantity"} className="grid h-11 w-11 place-items-center rounded-full" style={{ color: THEME }}>{quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
      <span className="min-w-7 text-center text-sm font-bold tabular" aria-live="polite">{quantity}</span>
      <button type="button" onClick={onIncrement} aria-label="Increase quantity" className="grid h-11 w-11 place-items-center rounded-full" style={{ color: THEME }}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function CartView({ token, menu, state, update, onPlaced, onClose }: { token: string; menu: QrMenu; state: QrGuestState; update: (p: Partial<QrGuestState>) => void; onPlaced: () => void; onClose: () => void }) {
  const currency = menu.business.currency;
  const needName = menu.settings?.guest_name !== false;
  const clientId = useRef(uuid());
  const place = useMutation({
    mutationFn: () => api<QrGuestOrder>(`/qr/${encodeURIComponent(token)}/orders`, { method: "POST", auth: "none", body: { guest_name: state.guest_name.trim() || undefined, notes: state.notes.trim() || undefined, client_id: clientId.current, lines: qrOrderLines(state.lines) } }),
    onSuccess: (o) => { update({ lines: [], notes: "", lastOrder: { id: o.id, guest_token: o.guest_token } }); clientId.current = uuid(); onPlaced(); },
  });
  const canPlace = state.lines.length > 0 && (!needName || state.guest_name.trim().length > 0) && !place.isPending && menu.ordering;
  if (!state.lines.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-muted"><ShoppingBag className="h-7 w-7 text-fg-muted" /></span>
        <p className="text-base font-medium">Nothing in your order yet</p>
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full border border-border-strong px-5 text-sm font-semibold">Back to the menu</button>
      </div>
    );
  }
  return (
    <form className="space-y-4 pb-4" onSubmit={(e) => { e.preventDefault(); if (canPlace) place.mutate(); }}>
      <ul className="divide-y rounded-2xl border bg-card">
        {state.lines.map((l) => (
          <li key={l.key} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{l.name}</div>
              {l.detail ? <div className="truncate text-xs text-fg-secondary">{l.detail}</div> : null}
              {l.notes ? <div className="truncate text-xs italic text-fg-muted">{l.notes}</div> : null}
            </div>
            <Stepper quantity={l.quantity} label={l.name} onIncrement={() => update({ lines: qrSetQuantity(state.lines, l.key, l.quantity + 1) })} onDecrement={() => update({ lines: qrSetQuantity(state.lines, l.key, l.quantity - 1) })} />
            <div className="w-20 text-right text-sm font-semibold tabular">{formatMoney(qrLineTotal(l), currency)}</div>
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3 text-sm"><span className="text-fg-secondary">Subtotal · {qrCount(state.lines)} item{qrCount(state.lines) === 1 ? "" : "s"}</span><span className="font-bold tabular">{formatMoney(qrSubtotal(state.lines), currency)}</span></li>
      </ul>
      <p className="text-xs text-fg-secondary">Tax and any service charge are added on the bill.</p>
      <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Your name{needName ? "" : " (optional)"}</span><input value={state.guest_name} onChange={(e) => update({ guest_name: e.target.value })} autoComplete="name" placeholder="So the waiter knows who ordered" required={needName} className="h-11 w-full rounded-xl border border-border-strong bg-transparent px-3 text-base focus-visible:border-primary focus-visible:outline-none" /></label>
      <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Note for the kitchen (optional)</span><input value={state.notes} onChange={(e) => update({ notes: e.target.value })} maxLength={300} placeholder="Allergies, extra plates" className="h-11 w-full rounded-xl border border-border-strong bg-transparent px-3 text-base focus-visible:border-primary focus-visible:outline-none" /></label>
      {place.error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-ink">{errorMessage(place.error)}</p> : null}
      <button type="submit" disabled={!canPlace} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-semibold text-white disabled:opacity-40" style={{ backgroundColor: THEME }}>
        {place.isPending ? <><Spinner className="h-4 w-4" /> Sending</> : `Place order · ${formatMoney(qrSubtotal(state.lines), currency)}`}
      </button>
    </form>
  );
}

function TrackView({ token, menu, state, update, onMenu }: { token: string; menu: QrMenu; state: QrGuestState; update: (p: Partial<QrGuestState>) => void; onMenu: () => void }) {
  const last = state.lastOrder;
  const q = useQuery({
    queryKey: ["qr-order", token, last?.id, last?.guest_token], enabled: !!last, retry: 1,
    queryFn: () => api<QrGuestOrder>(`/qr/${encodeURIComponent(token)}/orders/${encodeURIComponent(last!.id)}`, { auth: "none", query: { guest_token: last!.guest_token } }),
    refetchInterval: (query) => (query.state.data && qrIsFinal(qrStage(query.state.data)) ? false : 10_000),
  });
  if (!last) return <p className="py-8 text-center text-sm text-fg-secondary">No order yet.</p>;
  if (q.isLoading) return <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted"><Spinner /> Finding your order</div>;
  if (q.error || !q.data) return <div className="space-y-3 py-6 text-center"><p className="font-medium">We could not find that order</p><p className="text-sm text-fg-secondary">{q.error ? errorMessage(q.error) : "Please ask a waiter."}</p><button type="button" onClick={() => { update({ lastOrder: null }); onMenu(); }} className="inline-flex h-11 items-center rounded-full border border-border-strong px-5 text-sm font-semibold">Back to the menu</button></div>;
  const o = q.data;
  const stage = qrStage(o);
  const label = qrStageText(stage, o.table_code || menu.table.code);
  const currency = menu.business.currency;
  const steps = ["Sent", menu.settings?.cashier_accept ? "Accepted" : "Received", "In the kitchen", "On its way"];
  const stepIndex = stage === "waiting" ? 0 : stage === "kitchen" ? 2 : stage === "ready" || stage === "done" ? 3 : 0;
  return (
    <div className="space-y-4 pb-4">
      <div className={cn("rounded-2xl px-4 py-4", label.tone === "failed" ? "bg-danger-soft text-danger-ink" : "bg-primary-soft")}>
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-xs uppercase tracking-[0.6px] text-fg-secondary">{o.label && o.label !== "draft" ? `Order ${o.label.startsWith("#") ? o.label : `#${o.label}`}` : `Table ${o.table_code}`}</div><h3 className="mt-0.5 text-lg font-bold">{label.title}</h3></div>
          {label.tone === "wait" || label.tone === "ok" ? <Spinner className="mt-1" /> : label.tone === "done" ? <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ backgroundColor: THEME }}><Check className="h-5 w-5" /></span> : <X className="mt-1 h-6 w-6" />}
        </div>
        <p className="mt-1 text-sm">{label.text}</p>
      </div>
      {label.tone !== "failed" ? (
        <ol className="flex items-center gap-1" aria-label="Order progress">
          {steps.map((s, i) => <li key={s} className="flex-1 text-center"><div className="mx-auto mb-1 h-1.5 rounded-full" style={{ backgroundColor: i <= stepIndex ? THEME : "var(--border)" }} /><span className={cn("text-[11px] font-medium", i <= stepIndex ? "text-heading" : "text-fg-muted")}>{s}</span></li>)}
        </ol>
      ) : null}
      <div className="rounded-2xl border bg-card">
        <ul className="divide-y">{o.items.map((it, i) => <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="tabular text-fg-secondary">{Number(it.quantity)} ×</span> {it.name}</span><span className="tabular">{formatMoney(it.line_subtotal_minor ?? it.line_total_minor, currency)}</span></li>)}</ul>
        <dl className="space-y-1 border-t px-4 py-3 text-sm">
          <BillBlock bill={o} currency={currency} />
          <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd className="tabular">{formatMoney(o.total_minor, currency)}</dd></div>
        </dl>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { if (qrIsFinal(stage)) update({ lastOrder: null }); onMenu(); }} className="inline-flex h-12 flex-1 items-center justify-center rounded-full text-base font-semibold text-white" style={{ backgroundColor: THEME }}>{qrIsFinal(stage) ? "Back to the menu" : "Order more"}</button>
      </div>
      {!qrIsFinal(stage) ? <p className="text-xs text-fg-muted">Keep this page open to follow your order. It refreshes every 10 seconds.</p> : null}
    </div>
  );
}

function BillView({ bill, loading, currency, canAsk, onAsk, asked }: { bill: QrBill | null; loading: boolean; currency: string; canAsk: boolean; onAsk: () => void; asked: boolean }) {
  if (loading) return <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted"><Spinner /> Loading the bill</div>;
  if (!bill || !bill.order_id) return <p className="py-8 text-center text-sm text-fg-secondary">Nothing on this table&apos;s bill yet.</p>;
  const due = bill.total_minor - (bill.paid_minor ?? 0);
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border bg-card">
        <ul className="divide-y">{bill.items.map((it, i) => <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="tabular text-fg-secondary">{Number(it.quantity)} ×</span> {it.name}</span><span className="tabular">{formatMoney(it.line_subtotal_minor ?? it.line_total_minor, currency)}</span></li>)}</ul>
        <dl className="space-y-1 border-t px-4 py-3 text-sm">
          {bill.subtotal_minor !== undefined ? <BillBlock bill={{ ...bill, subtotal_minor: bill.subtotal_minor }} currency={currency} /> : null}
          <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd className="tabular">{formatMoney(bill.total_minor, currency)}</dd></div>
          {bill.paid_minor ? <div className="flex justify-between"><dt className="text-fg-secondary">Paid</dt><dd className="tabular">{formatMoney(bill.paid_minor, currency)}</dd></div> : null}
          {bill.paid_minor ? <div className="flex justify-between font-semibold"><dt>Still to pay</dt><dd className="tabular">{formatMoney(Math.max(0, due), currency)}</dd></div> : null}
        </dl>
      </div>
      {canAsk ? <button type="button" onClick={onAsk} disabled={asked} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-semibold text-white disabled:opacity-60" style={{ backgroundColor: THEME }}>{asked ? <><Check className="h-5 w-5" /> Bill requested</> : <><ReceiptText className="h-5 w-5" /> Ask for the bill</>}</button> : null}
      <p className="text-xs text-fg-muted">Pay at the counter or with the waiter.</p>
    </div>
  );
}

/** The shared bill block (lib/bill.ts): the lines add up to the Subtotal and these rows add up to the Total. */
function BillBlock({ bill, currency }: { bill: { subtotal_minor: number; discount_minor?: number; service_charge_minor?: number; tax_minor?: number; tax_inclusive_minor?: number; total_minor: number }; currency: string }) {
  return (
    <>
      {billRows(bill, currency).map((r) => (
        <div key={r.key} className={cn("flex justify-between", r.info && "text-xs")}><dt className="text-fg-secondary">{r.label}</dt><dd className="tabular">{r.amount_minor < 0 ? `-${formatMoney(-r.amount_minor, currency)}` : formatMoney(r.amount_minor, currency)}</dd></div>
      ))}
    </>
  );
}
