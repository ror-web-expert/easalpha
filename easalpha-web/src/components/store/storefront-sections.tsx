"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, Globe, Mail, MapPin, MessageCircle, Navigation, Phone, Quote, Smartphone, Star, type LucideIcon } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Storefront } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";
import { averageRatingLabel, RATING_WORDS, ratingWord } from "@/components/admin/marketing-helpers";
import { Dialog } from "@/components/ui";
import { ratingBars, shade, type LegalDocument, type SocialNetwork, type SocialProfile } from "./storefront-helpers";

// The branded sections of the public storefront around the menu: brand mark and backdrop, section headings, the offers
// slider, About, Reviews (with the Leave a review form), Visit us, the app banner and the footer. storefront.tsx lays
// them out; everything takes the store's theme colour as props because the page never uses EasAlpha's own palette.

const STAR = "#f5a524";

/** The logo on a white tile, or the name's first letter on the theme colour when there is no logo or it fails to load. */
export function BrandMark({ logo, name, theme, onTheme, alt = "", className }: { logo: string | null | undefined; name: string; theme: string; onTheme: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={alt} onError={() => setFailed(true)} className={cn("shrink-0 bg-white object-contain", className)} />;
  }
  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={cn("grid shrink-0 place-items-center font-extrabold uppercase", className)} style={{ backgroundColor: theme, color: onTheme }}>
      {name.trim().charAt(0) || "·"}
    </span>
  );
}

/** A theme-coloured gradient with soft circles and a dot pattern: the banner when the owner has not uploaded a cover image. */
export function BrandBackdrop({ theme, className }: { theme: string; className?: string }) {
  const circle = (style: React.CSSProperties) => <span className="absolute aspect-square rounded-full" style={style} />;
  return (
    <div aria-hidden className={cn("absolute inset-0 overflow-hidden", className)} style={{ background: `linear-gradient(120deg, ${shade(theme, 0.14)} 0%, ${theme} 45%, ${shade(theme, -0.32)} 100%)` }}>
      {circle({ width: "34%", right: "-7%", top: "-38%", backgroundColor: "rgb(255 255 255 / 0.12)" })}
      {circle({ width: "22%", right: "20%", bottom: "-42%", backgroundColor: "rgb(0 0 0 / 0.10)" })}
      {circle({ width: "18%", left: "-5%", bottom: "-30%", backgroundColor: "rgb(255 255 255 / 0.08)" })}
      <span className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(rgb(255 255 255) 1px, transparent 1.6px)", backgroundSize: "22px 22px" }} />
    </div>
  );
}

/** Small brand glyphs drawn for this page (lucide no longer ships brand icons). */
export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const cls = cn("h-4 w-4 shrink-0", className);
  switch (network) {
    case "facebook":
      return <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="currentColor"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1Z" /></svg>;
    case "instagram":
      return <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>;
    case "tiktok":
      return <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="currentColor"><path d="M16.6 3c.4 2.1 1.7 3.5 3.9 3.7v3a7 7 0 0 1-3.9-1.2v6.1A5.9 5.9 0 1 1 10.7 9v3.1a2.8 2.8 0 1 0 2.8 2.8V3h3.1Z" /></svg>;
    case "youtube":
      return <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="currentColor"><path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.6 2.6 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" /></svg>;
    default:
      return <Globe className={cls} aria-hidden />;
  }
}

export function SectionHeading({ eyebrow, title, subtitle, ink, id, children }: { eyebrow: string; title: React.ReactNode; subtitle?: React.ReactNode; ink: string; id?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: ink }}>{eyebrow}</p>
        <h2 id={id} className="mt-1.5 text-2xl font-extrabold tracking-tight text-heading sm:text-[32px] sm:leading-10">{title}</h2>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-fg-secondary sm:text-base">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Menu slider pictures from Website Config: swipeable, snapping, advancing every 5 s unless the guest is on it or prefers less motion. */
export function PromoSlider({ images, name }: { images: string[]; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      const el = ref.current;
      if (!el || paused.current || !el.clientWidth) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % images.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => window.clearInterval(t);
  }, [images.length]);
  const go = (i: number) => { const el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };
  return (
    <section aria-label="Offers" className="relative">
      <div
        ref={ref}
        onScroll={(e) => { const el = e.currentTarget; if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth)); }}
        onPointerEnter={() => { paused.current = true; }}
        onPointerLeave={() => { paused.current = false; }}
        onFocusCapture={() => { paused.current = true; }}
        onBlurCapture={() => { paused.current = false; }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[28px] bg-muted shadow-[0_24px_50px_-30px_rgb(15_23_42/0.5)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <div key={`${i}-${src}`} role="group" aria-label={`Offer ${i + 1} of ${images.length}`} className="relative aspect-[16/9] w-full shrink-0 snap-center sm:aspect-[21/8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${name} offer ${i + 1}`} loading={i ? "lazy" : "eager"} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
      {images.length > 1 ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((_, i) => <button key={i} type="button" aria-label={`Show offer ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)} className={cn("h-2 rounded-full shadow transition-all", i === index ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/80")} />)}
        </div>
      ) : null}
    </section>
  );
}

export function AboutSection({ name, description, cover, logo, theme, onTheme, ink }: { name: string; description: string; cover: string; logo: string | null; theme: string; onTheme: string; ink: string }) {
  return (
    <section id="about" aria-labelledby="about-title" className="scroll-mt-24">
      <div className="grid items-center gap-8 overflow-hidden rounded-[28px] border bg-card p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div>
          <SectionHeading eyebrow="Our story" title={`About ${name}`} ink={ink} id="about-title" />
          <p className="mt-4 whitespace-pre-line text-base leading-7 text-fg-secondary">{description}</p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <>
              <BrandBackdrop theme={theme} />
              <div className="absolute inset-0 grid place-items-center"><BrandMark logo={logo} name={name} theme={theme} onTheme={onTheme} className="h-24 w-24 rounded-3xl text-4xl shadow-xl ring-4 ring-white/30" /></div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Stars({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn(size, n <= rating ? "fill-current" : "text-border")} style={n <= rating ? { color: STAR } : undefined} />)}
    </span>
  );
}

const ORDER_TYPE_WORDS: Record<string, string> = { delivery: "Delivery", takeaway: "Pickup", dine_in: "Dine-in", qr: "Table QR" };
const orderTypeWord = (t: string) => ORDER_TYPE_WORDS[t] ?? titleCase(t);

export function ReviewsSection({ slug, data, theme, onTheme, ink }: { slug: string; data: Storefront; theme: string; onTheme: string; ink: string }) {
  const s = data.reviews.summary;
  const recent = data.reviews.recent;
  const bars = ratingBars(s.by_rating, s.rated);
  const [showAll, setShowAll] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [orderLabel, setOrderLabel] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => api<{ id: string; rating: number; rating_word: string }>(`/public/storefront/${encodeURIComponent(slug)}/reviews`, { method: "POST", auth: "none", body: { rating, comment, order_label: orderLabel || undefined } }),
    onSuccess: (r) => { setDone(r.rating_word); setComment(""); setOrderLabel(""); setRating(0); },
  });
  const error = submit.error ? (submit.error instanceof ApiError && submit.error.status === 404 ? "That order number was not found. Leave it blank if you are not sure." : errorMessage(submit.error)) : null;
  const shown = showAll ? recent : recent.slice(0, 6);
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-24">
      <SectionHeading eyebrow="Reviews" title="What our guests say" ink={ink} id="reviews-title" />
      {/* Phones read summary, reviews, then the form; wide screens put the summary and form in a side column. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start lg:gap-x-6">
        <div className="rounded-3xl border bg-card p-6 lg:col-start-1 lg:row-start-1">
          <div className="flex items-end gap-2">
            <span className="text-5xl font-extrabold leading-none tracking-tight text-heading tabular">{averageRatingLabel(s.average)}</span>
            <span className="pb-1 text-sm text-fg-muted">out of 5</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {s.average ? <Stars rating={Math.round(s.average)} size="h-5 w-5" /> : null}
            <span className="text-sm text-fg-secondary">{s.rated ? `${s.rated} rating${s.rated === 1 ? "" : "s"}` : "No ratings yet"}</span>
          </div>
          {s.rated ? (
            <ul className="mt-5 space-y-2" aria-label="Ratings by stars">
              {bars.map((b) => (
                <li key={b.stars} className="flex items-center gap-2.5 text-sm" aria-label={`${b.stars} stars: ${b.count}`}>
                  <span className="inline-flex w-8 shrink-0 items-center gap-0.5 tabular text-fg-secondary">{b.stars}<Star className="h-3 w-3 fill-current" style={{ color: STAR }} /></span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${b.pct}%`, backgroundColor: STAR }} /></span>
                  <span className="w-7 shrink-0 text-right text-xs tabular text-fg-muted">{b.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {recent.length ? (
            <>
              <ul className="grid gap-4 sm:grid-cols-2">
                {shown.map((r, i) => {
                  const word = r.rating_word || ratingWord(r.rating);
                  return (
                    <li key={i} className="flex flex-col rounded-3xl border bg-card p-5">
                      <div className="flex items-center justify-between gap-2"><Stars rating={r.rating} /><span className="text-xs text-fg-muted">{formatDate(r.at)}</span></div>
                      {r.comment ? <p className="mt-3 flex-1 text-[15px] leading-6 text-fg">&ldquo;{r.comment}&rdquo;</p> : <p className="mt-3 flex-1 text-[15px] leading-6 text-fg-secondary">Rated {word.toLowerCase()}.</p>}
                      <p className="mt-4 flex items-center gap-2 text-xs font-medium text-fg-secondary">
                        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold" style={{ backgroundColor: `${theme}14`, color: ink }}>{r.rating}</span>
                        {word}{r.order_type ? ` · ${orderTypeWord(r.order_type)} order` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {recent.length > 6 ? <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-4 inline-flex h-11 items-center rounded-full border border-border-strong px-5 text-sm font-semibold hover:bg-fg/5">{showAll ? "Show fewer reviews" : `Show all ${recent.length} reviews`}</button> : null}
            </>
          ) : (
            <div className="grid min-h-48 place-items-center rounded-3xl border border-dashed bg-card p-8 text-center">
              <div><Quote className="mx-auto h-8 w-8 text-fg-muted" /><p className="mt-2 font-semibold text-heading">No reviews yet</p><p className="mt-1 text-sm text-fg-secondary">Tried our food? Tell other guests what you think.</p></div>
            </div>
          )}
        </div>
        <form className="space-y-3 rounded-3xl border bg-card p-6 lg:col-start-1 lg:row-start-2" onSubmit={(e) => { e.preventDefault(); if (rating) submit.mutate(); }}>
          <h3 className="text-lg font-bold text-heading">Leave a review</h3>
          {done ? <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success-ink">Thank you. Your rating ({done}) has been recorded.</p> : null}
          <div>
            <span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Your rating</span>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} - ${RATING_WORDS[n]}`} onClick={() => setRating(n)} className="rounded-full p-1 transition hover:scale-110">
                  <Star className={cn("h-7 w-7", n <= rating ? "fill-current" : "text-border")} style={n <= rating ? { color: STAR } : undefined} />
                </button>
              ))}
              <span className="ml-2 text-sm text-fg-secondary">{rating ? RATING_WORDS[rating] : "Tap a star"}</span>
            </div>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Comment (optional)</span><textarea className="min-h-20 w-full rounded-xl border border-border-strong bg-transparent px-3 py-2.5 text-base focus-visible:border-primary focus-visible:outline-none" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary">Order number (optional)</span><input className="h-11 w-full rounded-xl border border-border-strong bg-transparent px-3 font-mono text-base focus-visible:border-primary focus-visible:outline-none" value={orderLabel} onChange={(e) => setOrderLabel(e.target.value)} placeholder="#1042" /></label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button type="submit" disabled={!rating || submit.isPending} className="inline-flex h-12 w-full items-center justify-center rounded-full text-base font-semibold transition hover:brightness-110 disabled:opacity-40" style={{ backgroundColor: theme, color: onTheme }}>{submit.isPending ? "Sending" : "Send review"}</button>
        </form>
      </div>
    </section>
  );
}

function InfoCard({ icon: Icon, title, theme, ink, children }: { icon: LucideIcon; title: string; theme: string; ink: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5 rounded-2xl border bg-card p-4 sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${theme}14`, color: ink }}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted">{title}</h3>
        <div className="mt-1 text-[15px] leading-6 text-fg">{children}</div>
      </div>
    </li>
  );
}

export interface VisitInfo { address: string; hours: string; phone: string; email: string; waHref: string | null; waNumber: string; mapHref: string | null; embed: string | null }

export function VisitSection({ name, info, socials, theme, ink }: { name: string; info: VisitInfo; socials: SocialProfile[]; theme: string; ink: string }) {
  const { address, hours, phone, email, waHref, waNumber, mapHref, embed } = info;
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-24">
      <SectionHeading eyebrow="Visit us" title="Find us and get in touch" ink={ink} id="contact-title" />
      <div className={cn("mt-6 grid gap-4", embed ? "lg:grid-cols-[1fr_1.1fr]" : "")}>
        <ul className="grid content-start gap-3 sm:grid-cols-2">
          {address ? (
            <InfoCard icon={MapPin} title="Address" theme={theme} ink={ink}>
              <p>{address}</p>
              {mapHref ? <a href={mapHref} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline" style={{ color: ink }}><Navigation className="h-4 w-4" /> Get directions</a> : null}
            </InfoCard>
          ) : null}
          {hours ? <InfoCard icon={Clock} title="Opening hours" theme={theme} ink={ink}><p className="tabular">{hours}</p></InfoCard> : null}
          {phone ? <InfoCard icon={Phone} title="Phone" theme={theme} ink={ink}><a href={`tel:${phone}`} className="font-medium underline-offset-4 hover:underline">{phone}</a></InfoCard> : null}
          {waHref ? <InfoCard icon={MessageCircle} title="WhatsApp" theme={theme} ink={ink}><a href={waHref} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline">{waNumber}</a></InfoCard> : null}
          {email ? <InfoCard icon={Mail} title="Email" theme={theme} ink={ink}><a href={`mailto:${email}`} className="break-all font-medium underline-offset-4 hover:underline">{email}</a></InfoCard> : null}
        </ul>
        {embed ? (
          <div className="min-h-72 overflow-hidden rounded-3xl border bg-muted">
            <iframe title={`Map showing ${name}`} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-full min-h-72 w-full border-0" />
          </div>
        ) : null}
      </div>
      {socials.length ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-fg-secondary">Follow us</span>
          {socials.map((s) => <a key={s.key} href={s.href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium transition hover:shadow-[0_8px_20px_-12px_rgb(15_23_42/0.45)]"><SocialIcon network={s.network} /> {s.label}</a>)}
        </div>
      ) : null}
    </section>
  );
}

export function AppBanner({ name, android, ios, theme, onTheme }: { name: string; android: string; ios: string; theme: string; onTheme: string }) {
  const badge = (href: string, small: string, big: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-black px-4 text-white ring-1 ring-white/20 transition hover:bg-black/85">
      <Smartphone className="h-5 w-5" />
      <span className="text-left leading-tight"><span className="block text-[10px] uppercase tracking-wide opacity-75">{small}</span><span className="block text-sm font-semibold">{big}</span></span>
    </a>
  );
  return (
    <section aria-label={`Get the ${name} app`} className="relative overflow-hidden rounded-[28px] p-6 sm:p-10" style={{ color: onTheme }}>
      <BrandBackdrop theme={theme} />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15"><Smartphone className="h-7 w-7" /></span>
          <div><h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Get the {name} app</h2><p className="mt-1 text-sm opacity-85">Order in a few taps and follow your delivery live.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">{android ? badge(android, "Get it on", "Google Play") : null}{ios ? badge(ios, "Download on the", "App Store") : null}</div>
      </div>
    </section>
  );
}

export interface FooterProps {
  name: string; description: string; logo: string | null; theme: string; onTheme: string;
  /** The floating cart bar is showing: leave room under the last row so the bar never covers it. */
  roomForBar?: boolean;
  links: { href: string; label: string }[]; extraLinks: { label: string; url: string }[];
  address: string; hours: string; phone: string; email: string; socials: SocialProfile[]; footerText: string; documents: LegalDocument[];
}

export function SiteFooter({ name, description, logo, theme, onTheme, roomForBar, links, extraLinks, address, hours, phone, email, socials, footerText, documents }: FooterProps) {
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const year = new Date().getFullYear();
  const background = onTheme === "#ffffff" ? shade(theme, -0.62) : "#15171c"; // a darkened light colour turns muddy
  return (
    <footer className="text-white" style={{ backgroundColor: background }}>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-3">
            <BrandMark logo={logo} name={name} theme={theme} onTheme={onTheme} className="h-12 w-12 rounded-2xl p-0.5 text-xl" />
            <span className="text-xl font-extrabold tracking-tight">{name}</span>
          </div>
          {description ? <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">{description}</p> : null}
          {footerText ? <p className="mt-3 max-w-sm whitespace-pre-line text-sm leading-6 text-white/70">{footerText}</p> : null}
          {socials.length ? (
            <div className="mt-5 flex gap-2">
              {socials.map((s) => <a key={s.key} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><SocialIcon network={s.network} className="h-[18px] w-[18px]" /></a>)}
            </div>
          ) : null}
        </div>
        <nav aria-label="Footer">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Explore</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {links.map((l) => <li key={l.href}><a href={l.href} className="text-white/85 transition hover:text-white">{l.label}</a></li>)}
            {extraLinks.map((l, i) => <li key={`x${i}`}><a href={l.url} className="text-white/85 transition hover:text-white">{l.label}</a></li>)}
          </ul>
        </nav>
        {address || hours || phone || email ? (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Visit</h2>
            <ul className="mt-4 space-y-3 text-sm text-white/85">
              {address ? <li className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/55" /><span>{address}</span></li> : null}
              {hours ? <li className="flex gap-2.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-white/55" /><span className="tabular">{hours}</span></li> : null}
              {phone ? <li className="flex gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/55" /><a href={`tel:${phone}`} className="transition hover:text-white">{phone}</a></li> : null}
              {email ? <li className="flex gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/55" /><a href={`mailto:${email}`} className="break-all transition hover:text-white">{email}</a></li> : null}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="border-t border-white/10">
        <div className={cn("mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6", roomForBar ? "pb-28 sm:pb-32" : "")}>
          <p>&copy; {year} {name}. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {documents.map((d) => <button key={d.key} type="button" onClick={() => setDoc(d)} className="transition hover:text-white">{d.label}</button>)}
            <a href="https://easalpha.com" target="_blank" rel="noreferrer" className="transition hover:text-white">Powered by <span className="font-semibold">EasAlpha</span></a>
          </div>
        </div>
      </div>
      <Dialog open={!!doc} onClose={() => setDoc(null)} title={doc?.label} size="lg">
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-line px-6 pb-6 text-sm leading-6 text-fg-secondary">{doc?.text}</div>
      </Dialog>
    </footer>
  );
}
