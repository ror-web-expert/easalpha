"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Mail, MessageCircle, Star, Clock, Store as StoreIcon, Plus } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Storefront, StorefrontProduct } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";
import { averageRatingLabel, RATING_WORDS, ratingWord, readableOn } from "@/components/admin/marketing-helpers";
import { useStorefrontCart } from "@/store/storefront-cart";
import { deliveryLine, lineKey, ratingBadge, type DeliverySettings } from "./cart-helpers";
import { DishImage } from "./dish-placeholder";
import { CartBar, CartSheet, QtyStepper, type CartSheetView } from "./cart-sheet";

// Public, mobile-first storefront driven by Website Config: identity header in the theme colour, the online menu by
// category with Add buttons feeding a persisted cart (cart-sheet.tsx handles checkout and live tracking), contact and
// social links, and reviews with a Leave a review form (SPEC: reviews come in from the website).
// No admin shell and no auth token: the API's /public/storefront/:slug is open.
// Deep link: /store/:slug?order=<id>&token=<guest_token> opens the tracking view for that order.

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const bool = (v: unknown): boolean => v === true;

export function useStorefront(slug: string) {
  return useQuery({ queryKey: ["storefront", slug], queryFn: () => api<Storefront>(`/public/storefront/${encodeURIComponent(slug)}`, { auth: "none" }), retry: false, enabled: !!slug });
}

export function StorefrontNotFound({ slug }: { slug: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-muted"><StoreIcon className="h-7 w-7 text-fg-muted" /></span>
      <h1 className="text-[22px] leading-7">This storefront is not published</h1>
      <p className="text-sm text-fg-secondary">There is no live site at <span className="font-mono">/store/{slug}</span>. If this is your business, open Settings, then Website Config, and turn on Published.</p>
    </main>
  );
}

/** Browser tab: the site name and, when Website Config has one, its favicon (identity.favicon_key) instead of EasAlpha's. */
export function useStorefrontTab(title: string, favicon: string | null) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const existing = Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"));
    let added: HTMLLinkElement | null = null;
    if (favicon) {
      existing.forEach((l) => { l.dataset.storefrontHidden = l.getAttribute("href") ?? ""; l.setAttribute("href", favicon); });
      if (!existing.length) { added = document.createElement("link"); added.rel = "icon"; added.href = favicon; document.head.appendChild(added); }
    }
    return () => {
      document.title = prevTitle;
      existing.forEach((l) => { if (l.dataset.storefrontHidden !== undefined) { l.setAttribute("href", l.dataset.storefrontHidden); delete l.dataset.storefrontHidden; } });
      added?.remove();
    };
  }, [title, favicon]);
}

export function StorefrontView({ slug, data }: { slug: string; data: Storefront }) {
  const cfg = data.config;
  const identity = cfg.identity ?? {};
  const theme = str(identity.theme_color) || "#10294d";
  const onTheme = readableOn(theme);
  const pages = cfg.pages ?? {};
  const contact = cfg.contact ?? {};
  const social = cfg.social ?? {};
  const wa = cfg.whatsapp ?? {};
  const availability = cfg.availability ?? {};
  const system = cfg.system ?? {};
  const pricing = cfg.pricing ?? {};
  const delivery = cfg.delivery ?? {};
  const footer = cfg.footer ?? {};
  const location = cfg.location ?? {};
  const showPrices = pricing.show_prices !== false;
  const name = str(identity.name) || data.business.name;
  const logo = str(identity.logo_key) || data.business.logo_key;
  const cover = str(identity.cover_key);
  useStorefrontTab(str(identity.name) || data.business.name, str(identity.favicon_key) || null);
  const byCategory = useMemo(() => data.categories.map((c) => ({ ...c, products: data.products.filter((p) => p.category_id === c.id) })).filter((c) => c.products.length), [data]);
  const socialLinks = Object.entries(social).filter(([, v]) => typeof v === "string" && v);
  const waNumber = str(wa.number) || str(contact.whatsapp) || (data.business.phone ?? ""); // Branding: blank uses the business WhatsApp
  const waHref = waNumber ? `https://wa.me/${waNumber.replace(/[^0-9]/g, "")}${str(wa.greeting) ? `?text=${encodeURIComponent(str(wa.greeting))}` : ""}` : null;
  const footerLinks = Array.isArray(footer.links) ? (footer.links as unknown[]) : [];
  const rating = ratingBadge(data.reviews.summary);
  const closedMessage = bool(system.maintenance) ? "We are doing some maintenance. Ordering is paused for a short while." : str(availability.closed_message) || "Online ordering is closed right now.";
  const canOrder = availability.online_ordering !== false && !bool(system.maintenance);

  // Cart: rehydrate from localStorage after mount (no SSR mismatch), bind it to this slug, then honour a tracking deep link.
  const [sheet, setSheet] = useState<CartSheetView | null>(null);
  const cartCount = useStorefrontCart((s) => (s.hydrated ? s.lines.length : 0));
  const hasLastOrder = useStorefrontCart((s) => s.hydrated && !!s.lastOrder);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(useStorefrontCart.persist.rehydrate()).then(() => {
      if (cancelled) return;
      const st = useStorefrontCart.getState();
      st.setSlug(slug);
      const params = new URLSearchParams(window.location.search);
      const order = params.get("order");
      const token = params.get("token");
      if (order && token) { st.setLastOrder({ id: order, guest_token: token }); setSheet("tracking"); }
    });
    return () => { cancelled = true; };
  }, [slug]);
  const closeSheet = useCallback(() => setSheet(null), []);
  const barVisible = cartCount > 0 || hasLastOrder;
  return (
    <main className={cn("min-h-screen bg-page text-fg", barVisible ? "pb-24" : "")} style={{ ["--primary" as string]: theme, ["--primary-fg" as string]: onTheme, ["--primary-hover" as string]: theme }}>
      {bool(system.maintenance) ? <div className="bg-warning px-4 py-2 text-center text-sm text-warning-fg">We are doing some maintenance. Ordering is paused for a short while.</div> : null}
      <header className="text-primary-fg" style={{ backgroundColor: theme, color: onTheme, ["--heading-color" as string]: onTheme }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-40 w-full object-cover sm:h-56" />
        ) : null}
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-5">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${name} logo`} className="h-16 w-16 shrink-0 rounded-full border-2 border-white/40 bg-white object-contain p-1" />
          ) : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/20 text-2xl font-bold">{name.charAt(0)}</span>}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-medium leading-8">{name}</h1>
            {str(identity.description) ? <p className="mt-0.5 text-sm opacity-90">{str(identity.description)}</p> : null}
            {data.branch?.hours || rating ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-90">
                {data.branch?.hours ? <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {data.branch.hours}</span> : null}
                {rating ? (
                  pages.reviews !== false
                    ? <a href="#reviews" className="inline-flex items-center gap-1 underline-offset-4 hover:underline" aria-label={`Rated ${rating.average} out of 5 from ${rating.reviews}`}><Star className="h-3.5 w-3.5 fill-current" /> <span className="font-semibold">{rating.average}</span> · {rating.reviews}</a>
                    : <span className="inline-flex items-center gap-1" aria-label={`Rated ${rating.average} out of 5 from ${rating.reviews}`}><Star className="h-3.5 w-3.5 fill-current" /> <span className="font-semibold">{rating.average}</span> · {rating.reviews}</span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <nav className="mx-auto flex max-w-2xl gap-4 overflow-x-auto px-4 pb-3 text-sm font-medium">
          {pages.menu !== false ? <a href="#menu" className="whitespace-nowrap underline-offset-4 hover:underline">Menu</a> : null}
          {pages.about ? <a href="#about" className="whitespace-nowrap underline-offset-4 hover:underline">About</a> : null}
          {pages.contact !== false ? <a href="#contact" className="whitespace-nowrap underline-offset-4 hover:underline">Contact</a> : null}
          {pages.reviews !== false ? <a href="#reviews" className="whitespace-nowrap underline-offset-4 hover:underline">Reviews</a> : null}
        </nav>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
        {!canOrder ? <p className="rounded-xl bg-muted px-4 py-3 text-sm text-fg-secondary">{closedMessage}</p> : null}
        {bool(delivery.enabled) ? <p className="text-xs text-fg-secondary">{deliveryLine(delivery as DeliverySettings, data.business.currency)}</p> : null}

        {pages.about && str(identity.description) ? <section id="about"><h2 className="mb-2 text-lg font-medium">About</h2><p className="text-sm text-fg-secondary">{str(identity.description)}</p></section> : null}

        {pages.menu !== false ? (
          <section id="menu">
            <h2 className="mb-3 text-lg font-medium">Menu</h2>
            {byCategory.length ? (
              <div className="space-y-6">
                {byCategory.map((c) => (
                  <div key={c.id}>
                    <h3 className="mb-2 text-base font-medium" style={{ color: theme }}>{c.name}</h3>
                    {c.subtitle ? <p className="-mt-1 mb-2 text-xs text-fg-secondary">{c.subtitle}</p> : null}
                    <ul className="divide-y rounded-xl border bg-card">
                      {c.products.map((p) => <MenuRow key={p.id} product={p} currency={data.business.currency} showPrices={showPrices} canOrder={canOrder} theme={theme} onTheme={onTheme} />)}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-fg-muted">The menu is being updated. Check back soon.</p>}
          </section>
        ) : null}

        {pages.contact !== false ? (
          <section id="contact">
            <h2 className="mb-3 text-lg font-medium">Contact</h2>
            <ul className="space-y-2 text-sm">
              {str(contact.phone) || data.business.phone ? <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-fg-muted" /><a href={`tel:${str(contact.phone) || data.business.phone}`} className="underline-offset-4 hover:underline">{str(contact.phone) || data.business.phone}</a></li> : null}
              {str(contact.email) ? <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-fg-muted" /><a href={`mailto:${str(contact.email)}`} className="underline-offset-4 hover:underline">{str(contact.email)}</a></li> : null}
              {waHref ? <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-fg-muted" /><a href={waHref} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">WhatsApp {waNumber}</a></li> : null}
              {str(location.address) || data.branch?.address ? <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" /><span>{str(location.address) || data.branch?.address}{str(location.map_link) ? <> · <a href={str(location.map_link)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">Map</a></> : null}</span></li> : null}
            </ul>
            {socialLinks.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {socialLinks.map(([k, v]) => <a key={k} href={String(v)} target="_blank" rel="noreferrer" className="rounded-full border border-border-strong px-3 py-1 text-xs font-medium hover:bg-fg/8">{titleCase(k)}</a>)}
              </div>
            ) : null}
          </section>
        ) : null}

        {pages.reviews !== false ? <ReviewsSection slug={slug} data={data} /> : null}
      </div>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-2xl space-y-2 px-4 py-6 text-xs text-fg-secondary">
          {str(footer.text) ? <p>{str(footer.text)}</p> : null}
          {footerLinks.length ? <p className="flex flex-wrap gap-3">{footerLinks.map((l, i) => { const o = typeof l === "object" && l ? (l as { label?: string; url?: string }) : { label: String(l), url: String(l) }; return <a key={i} href={o.url ?? "#"} className="underline-offset-4 hover:underline">{o.label ?? o.url}</a>; })}</p> : null}
          <p>{name}. Powered by EasAlpha.</p>
        </div>
      </footer>
      {wa.show_button !== false && waHref ? (
        // Sits above the cart bar when the bar is showing so neither covers the other.
        <a href={waHref} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" className={cn("help-glow fixed right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-cta pl-3 pr-4 text-sm font-semibold text-cta-fg transition-[background-color,bottom] hover:bg-cta-hover sm:right-6", barVisible ? "bottom-24 sm:bottom-28" : "bottom-4 sm:bottom-6")}>
          <MessageCircle className="h-5 w-5" />
          <span>{str(wa.button_label).trim() || "Need help?"}</span>
        </a>
      ) : null}
      <CartBar currency={data.business.currency} theme={theme} onTheme={onTheme} onOpen={setSheet} />
      <CartSheet slug={slug} data={data} open={sheet !== null} view={sheet ?? "cart"} onViewChange={setSheet} onClose={closeSheet} theme={theme} onTheme={onTheme} canOrder={canOrder} closedMessage={closedMessage} />
    </main>
  );
}

/** One menu row: picture (or the placeholder), name, price, description, variants, and the Add button or stepper. */
function MenuRow({ product: p, currency, showPrices, canOrder, theme, onTheme }: { product: StorefrontProduct; currency: string; showPrices: boolean; canOrder: boolean; theme: string; onTheme: string }) {
  const hydrated = useStorefrontCart((s) => s.hydrated);
  const lines = useStorefrontCart((s) => s.lines);
  const add = useStorefrontCart((s) => s.add);
  const increment = useStorefrontCart((s) => s.increment);
  const decrement = useStorefrontCart((s) => s.decrement);
  const [picker, setPicker] = useState(false);
  const qtyOf = (variantId: string | null) => (hydrated ? lines.find((l) => l.key === lineKey(p.id, variantId))?.quantity ?? 0 : 0);
  const hasVariants = p.variants.length > 0;
  const totalQty = hasVariants ? p.variants.reduce((n, v) => n + qtyOf(v.id), 0) : qtyOf(null);
  const pickerOpen = hasVariants && (picker || totalQty > 0);
  const addButton = (onClick: () => void, label = "Add") => (
    <button type="button" onClick={onClick} aria-label={`${label} ${p.name}`} className="inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-semibold transition-[filter] hover:brightness-110" style={{ backgroundColor: theme, color: onTheme }}>
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
  return (
    <li className="flex gap-3 px-4 py-3">
      <DishImage src={p.image_key} color={theme} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{p.name}</span>{showPrices && !hasVariants ? <span className="tabular whitespace-nowrap">{formatMoney(p.price_minor, currency)}</span> : null}</div>
        {p.description ? <p className="mt-0.5 text-xs text-fg-secondary">{p.description}</p> : null}
        {hasVariants ? (
          <ul className={cn("mt-1 text-xs text-fg-secondary", pickerOpen ? "space-y-1.5" : "space-y-0.5")}>
            {p.variants.map((v) => {
              const q = qtyOf(v.id);
              return (
                <li key={v.id} className="flex items-center justify-between gap-3">
                  <span className={cn(pickerOpen && canOrder ? "text-fg" : "")}>{v.name}{showPrices ? <span className="tabular text-fg-secondary"> · {formatMoney(v.price_minor, currency)}</span> : null}</span>
                  {pickerOpen && canOrder ? (
                    q ? (
                      <QtyStepper size="sm" theme={theme} quantity={q} label={`${p.name} ${v.name}`} onIncrement={() => increment(lineKey(p.id, v.id))} onDecrement={() => decrement(lineKey(p.id, v.id))} />
                    ) : (
                      <button type="button" onClick={() => add({ product_id: p.id, variant_id: v.id, name: p.name, variant_name: v.name, unit_minor: v.price_minor })} aria-label={`Add ${p.name} ${v.name}`} className="inline-flex h-8 items-center gap-1 rounded-full border-2 px-3 text-xs font-semibold hover:bg-fg/8" style={{ borderColor: theme, color: theme }}><Plus className="h-3.5 w-3.5" /> Add</button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {canOrder ? (
        <div className="flex shrink-0 flex-col items-end justify-center">
          {hasVariants ? (
            pickerOpen ? (
              totalQty ? <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${theme}1a`, color: theme }}>{totalQty} in cart</span> : <button type="button" onClick={() => setPicker(false)} className="text-xs text-fg-secondary underline-offset-4 hover:underline">Close</button>
            ) : addButton(() => setPicker(true), "Choose")
          ) : totalQty ? (
            <QtyStepper theme={theme} quantity={totalQty} label={p.name} onIncrement={() => increment(lineKey(p.id, null))} onDecrement={() => decrement(lineKey(p.id, null))} />
          ) : addButton(() => add({ product_id: p.id, variant_id: null, name: p.name, variant_name: null, unit_minor: p.price_minor }))}
        </div>
      ) : null}
    </li>
  );
}

function Stars({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return <span className="inline-flex" aria-label={`${rating} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`${size} ${n <= rating ? "fill-current text-accent" : "text-border"}`} />)}</span>;
}

function ReviewsSection({ slug, data }: { slug: string; data: Storefront }) {
  const s = data.reviews.summary;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [orderLabel, setOrderLabel] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => api<{ id: string; rating: number; rating_word: string }>(`/public/storefront/${encodeURIComponent(slug)}/reviews`, { method: "POST", auth: "none", body: { rating, comment, order_label: orderLabel || undefined } }),
    onSuccess: (r) => { setDone(r.rating_word); setComment(""); setOrderLabel(""); setRating(0); },
  });
  const error = submit.error ? (submit.error instanceof ApiError && submit.error.status === 404 ? "That order number was not found. Leave it blank if you are not sure." : errorMessage(submit.error)) : null;
  return (
    <section id="reviews">
      <h2 className="mb-3 text-lg font-medium">Reviews</h2>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3">
        <div><div className="text-3xl tabular">{averageRatingLabel(s.average)}</div><div className="text-xs text-fg-secondary">{s.rated ? `${s.rated} rating${s.rated === 1 ? "" : "s"}` : "No ratings yet"}</div></div>
        {s.average ? <Stars rating={Math.round(s.average)} size="h-5 w-5" /> : null}
        <div className="ml-auto text-xs text-fg-secondary">{s.five_star} five-star · {s.one_star} one-star</div>
      </div>
      {data.reviews.recent.length ? (
        <ul className="mb-5 space-y-2">
          {data.reviews.recent.map((r, i) => (
            <li key={i} className="rounded-xl border bg-card px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2"><Stars rating={r.rating} /><span className="text-xs text-fg-muted">{r.rating_word || ratingWord(r.rating)}{r.order_type ? ` · ${titleCase(r.order_type)}` : ""} · {formatDate(r.at)}</span></div>
              {r.comment ? <p className="mt-1 text-fg-secondary">{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); if (rating) submit.mutate(); }}>
        <h3 className="text-base font-medium">Leave a review</h3>
        {done ? <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-ink">Thank you. Your rating ({done}) has been recorded.</p> : null}
        <div>
          <span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Your rating</span>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} - ${RATING_WORDS[n]}`} onClick={() => setRating(n)} className="p-1"><Star className={`h-8 w-8 ${n <= rating ? "fill-current text-accent" : "text-border"}`} /></button>)}
            <span className="ml-2 text-sm text-fg-secondary">{rating ? RATING_WORDS[rating] : "Tap a star"}</span>
          </div>
        </div>
        <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Comment (optional)</span><textarea className="min-h-20 w-full rounded-[4px] border border-border-strong bg-transparent px-3 py-2.5 text-base focus-visible:border-primary focus-visible:outline-none" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Order number (optional)</span><input className="h-10 w-full rounded-[4px] border border-border-strong bg-transparent px-3 font-mono text-base focus-visible:border-primary focus-visible:outline-none" value={orderLabel} onChange={(e) => setOrderLabel(e.target.value)} placeholder="#1042" /></label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button type="submit" disabled={!rating || submit.isPending} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-cta text-base font-semibold text-cta-fg hover:bg-cta-hover disabled:opacity-40 sm:w-auto sm:px-8">{submit.isPending ? "Sending" : "Send review"}</button>
      </form>
    </section>
  );
}
