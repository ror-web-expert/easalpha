"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Mail, MessageCircle, Star, Clock, Store as StoreIcon } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Storefront } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { averageRatingLabel, RATING_WORDS, ratingWord, readableOn } from "@/components/admin/marketing-helpers";

// Public, mobile-first storefront driven by Website Config: identity header in the theme colour, the online menu by
// category, contact and social links, and reviews with a Leave a review form (SPEC: reviews come in from the website).
// No admin shell and no auth token: the API's /public/storefront/:slug is open.

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

export function StorefrontView({ slug, data }: { slug: string; data: Storefront }) {
  const cfg = data.config;
  const identity = cfg.identity ?? {};
  const theme = str(identity.theme_color) || "#1976d2";
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
  const byCategory = useMemo(() => data.categories.map((c) => ({ ...c, products: data.products.filter((p) => p.category_id === c.id) })).filter((c) => c.products.length), [data]);
  const socialLinks = Object.entries(social).filter(([, v]) => typeof v === "string" && v);
  const waNumber = str(wa.number) || str(contact.whatsapp);
  const waHref = waNumber ? `https://wa.me/${waNumber.replace(/[^0-9]/g, "")}${str(wa.greeting) ? `?text=${encodeURIComponent(str(wa.greeting))}` : ""}` : null;
  const footerLinks = Array.isArray(footer.links) ? (footer.links as unknown[]) : [];
  return (
    <main className="min-h-screen bg-page text-fg" style={{ ["--primary" as string]: theme, ["--primary-fg" as string]: onTheme, ["--primary-hover" as string]: theme }}>
      {bool(system.maintenance) ? <div className="bg-warning px-4 py-2 text-center text-sm text-warning-fg">We are doing some maintenance. Ordering is paused for a short while.</div> : null}
      <header className="text-primary-fg" style={{ backgroundColor: theme, color: onTheme }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-40 w-full object-cover sm:h-56" />
        ) : null}
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-5">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${name} logo`} className="h-16 w-16 shrink-0 rounded-full border-2 border-white/40 bg-white object-cover" />
          ) : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/20 text-2xl font-bold">{name.charAt(0)}</span>}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-medium leading-8">{name}</h1>
            {str(identity.description) ? <p className="mt-0.5 text-sm opacity-90">{str(identity.description)}</p> : null}
            {data.branch?.hours ? <p className="mt-1 flex items-center gap-1 text-xs opacity-80"><Clock className="h-3.5 w-3.5" /> {data.branch.hours}</p> : null}
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
        {availability.online_ordering === false ? <p className="rounded-xl bg-muted px-4 py-3 text-sm text-fg-secondary">{str(availability.closed_message) || "Online ordering is closed right now."}</p> : null}
        {bool(delivery.enabled) ? (
          <p className="text-xs text-fg-secondary">
            Delivery{typeof delivery.eta_minutes === "number" ? ` in about ${delivery.eta_minutes} minutes` : ""}
            {typeof delivery.min_order_minor === "number" && delivery.min_order_minor > 0 ? ` · minimum order ${formatMoney(delivery.min_order_minor)}` : ""}
            {typeof delivery.free_above_minor === "number" ? ` · free above ${formatMoney(delivery.free_above_minor)}` : ""}
          </p>
        ) : null}

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
                      {c.products.map((p) => (
                        <li key={p.id} className="flex gap-3 px-4 py-3">
                          {p.image_key ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_key} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{p.name}</span>{showPrices && !p.variants.length ? <span className="tabular whitespace-nowrap">{formatMoney(p.price_minor, data.business.currency)}</span> : null}</div>
                            {p.description ? <p className="mt-0.5 text-xs text-fg-secondary">{p.description}</p> : null}
                            {p.variants.length ? <ul className="mt-1 space-y-0.5 text-xs text-fg-secondary">{p.variants.map((v) => <li key={v.id} className="flex justify-between gap-3"><span>{v.name}</span>{showPrices ? <span className="tabular">{formatMoney(v.price_minor, data.business.currency)}</span> : null}</li>)}</ul> : null}
                          </div>
                        </li>
                      ))}
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

        {pages.reviews !== false ? <ReviewsSection slug={slug} data={data} theme={theme} onTheme={onTheme} /> : null}
      </div>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-2xl space-y-2 px-4 py-6 text-xs text-fg-secondary">
          {str(footer.text) ? <p>{str(footer.text)}</p> : null}
          {footerLinks.length ? <p className="flex flex-wrap gap-3">{footerLinks.map((l, i) => { const o = typeof l === "object" && l ? (l as { label?: string; url?: string }) : { label: String(l), url: String(l) }; return <a key={i} href={o.url ?? "#"} className="underline-offset-4 hover:underline">{o.label ?? o.url}</a>; })}</p> : null}
          <p>{name}. Powered by Servio.</p>
        </div>
      </footer>
      {wa.show_button !== false && waHref ? <a href={waHref} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 grid h-14 w-14 place-items-center rounded-full shadow-[var(--shadow-pop)]" style={{ backgroundColor: theme, color: onTheme }}><MessageCircle className="h-7 w-7" /></a> : null}
    </main>
  );
}

function Stars({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return <span className="inline-flex" aria-label={`${rating} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`${size} ${n <= rating ? "fill-current text-accent" : "text-border"}`} />)}</span>;
}

function ReviewsSection({ slug, data, theme, onTheme }: { slug: string; data: Storefront; theme: string; onTheme: string }) {
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
        <button type="submit" disabled={!rating || submit.isPending} className="inline-flex h-12 w-full items-center justify-center rounded-full text-base font-medium disabled:opacity-40 sm:w-auto sm:px-8" style={{ backgroundColor: theme, color: onTheme }}>{submit.isPending ? "Sending" : "Send review"}</button>
      </form>
    </section>
  );
}
