"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bike, Clock, MapPin, MessageCircle, Phone, Plus, Search, ShoppingBag, Star, Store as StoreIcon, Wallet, BadgePercent, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Storefront, StorefrontProduct } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { readableOn } from "@/components/admin/marketing-helpers";
import { useStorefrontCart } from "@/store/storefront-cart";
import { count, deliveryEnabled, deliveryMinimum, lineKey, ratingBadge, type DeliverySettings } from "./cart-helpers";
import { DishImage } from "./dish-placeholder";
import { CartBar, CartSheet, QtyStepper, type CartSheetView } from "./cart-sheet";
import { footerLinks, fromPrice, legalDocuments, mapEmbed, mapLink, matchesMenu, normalizeHex, sliderImages, socialProfiles, themeInk, whatsappHref } from "./storefront-helpers";
import { AboutSection, AppBanner, BrandBackdrop, BrandMark, PromoSlider, ReviewsSection, SectionHeading, SiteFooter, VisitSection } from "./storefront-sections";

// Public storefront: the restaurant's own branded site, driven by Website Config. A sticky top bar (logo, page links,
// cart), a cover banner with the brand card (logo, name, tagline, rating, hours, Order online / WhatsApp / Call and the
// delivery facts), the online menu with sticky category tabs, search and picture cards feeding a persisted cart
// (cart-sheet.tsx handles checkout and live tracking), then About, Reviews with the Leave a review form, Visit us and the
// footer (storefront-sections.tsx). Always light: it carries the restaurant's colours, not the visitor's EasAlpha theme.
// No admin shell and no auth token: the API's /public/storefront/:slug is open.
// Deep link: /store/:slug?order=<id>&token=<guest_token> opens the tracking view for that order.

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const bool = (v: unknown): boolean => v === true;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

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

/** The site keeps the restaurant's light look even when the visitor's device is in dark mode, and anchors scroll smoothly. */
function useStorefrontDocument() {
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.getAttribute("data-theme");
    const prevScroll = root.style.scrollBehavior;
    root.setAttribute("data-theme", "light");
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) root.style.scrollBehavior = "smooth";
    return () => {
      if (prevTheme) root.setAttribute("data-theme", prevTheme); else root.removeAttribute("data-theme");
      root.style.scrollBehavior = prevScroll;
    };
  }, []);
}

export function StorefrontView({ slug, data }: { slug: string; data: Storefront }) {
  const cfg = data.config;
  const identity = cfg.identity ?? {};
  const theme = normalizeHex(identity.theme_color) ?? "#10294d";
  const onTheme = readableOn(theme);
  const ink = themeInk(theme);
  const pages = cfg.pages ?? {};
  const contact = cfg.contact ?? {};
  const wa = cfg.whatsapp ?? {};
  const availability = cfg.availability ?? {};
  const system = cfg.system ?? {};
  const pricing = cfg.pricing ?? {};
  const delivery = (cfg.delivery ?? {}) as DeliverySettings;
  const footer = cfg.footer ?? {};
  const location = cfg.location ?? {};
  const mobileApp = cfg.mobile_app ?? {};
  const showPrices = pricing.show_prices !== false;
  const name = str(identity.name) || data.business.name;
  const description = str(identity.description);
  const logo = str(identity.logo_key) || data.business.logo_key;
  const cover = str(identity.cover_key);
  useStorefrontTab(name, str(identity.favicon_key) || null);
  useStorefrontDocument();
  const currency = data.business.currency;
  const byCategory = useMemo(() => data.categories.map((c) => ({ ...c, products: data.products.filter((p) => p.category_id === c.id) })).filter((c) => c.products.length), [data]);
  const socials = useMemo(() => socialProfiles(cfg.social, cfg.instagram?.handle), [cfg.social, cfg.instagram]);
  const slides = useMemo(() => sliderImages(cfg.menu_slider?.items), [cfg.menu_slider]);
  const address = str(location.address) || data.branch?.address || "";
  const hours = data.branch?.hours ?? "";
  const phone = str(contact.phone) || data.business.phone || "";
  const email = str(contact.email);
  const waNumber = str(wa.number) || str(contact.whatsapp) || (data.business.phone ?? ""); // Branding: blank uses the business WhatsApp
  const waHref = whatsappHref(waNumber, str(wa.greeting));
  const rating = ratingBadge(data.reviews.summary);
  const maintenance = bool(system.maintenance);
  const closedMessage = maintenance ? "We are doing some maintenance. Ordering is paused for a short while." : str(availability.closed_message) || "Online ordering is closed right now.";
  const canOrder = availability.online_ordering !== false && !maintenance;
  const menuOn = pages.menu !== false;
  const aboutOn = !!pages.about && !!description;
  const reviewsOn = pages.reviews !== false;
  const contactOn = pages.contact !== false && !!(address || hours || phone || email || waHref);
  const appAndroid = str(mobileApp.android_url), appIos = str(mobileApp.ios_url);
  const appBanner = bool(mobileApp.show_banner) && !!(appAndroid || appIos);
  const links = [
    ...(menuOn ? [{ href: "#menu", label: "Menu" }] : []),
    ...(aboutOn ? [{ href: "#about", label: "About" }] : []),
    ...(reviewsOn ? [{ href: "#reviews", label: "Reviews" }] : []),
    ...(contactOn ? [{ href: "#contact", label: "Contact" }] : []),
  ];

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
    <main id="top" className="min-h-screen bg-page text-fg" style={{ ["--primary" as string]: theme, ["--primary-fg" as string]: onTheme, ["--primary-hover" as string]: theme }}>
      {maintenance ? <div className="bg-warning px-4 py-2 text-center text-sm font-medium text-warning-fg">{closedMessage}</div> : null}
      <StoreNav name={name} logo={logo} theme={theme} onTheme={onTheme} links={links} showOrder={menuOn && canOrder} onCart={setSheet} />
      <Hero
        name={name} description={description} logo={logo} cover={cover} theme={theme} onTheme={onTheme} ink={ink}
        rating={rating} reviewsOn={reviewsOn} hours={hours} address={address} canOrder={canOrder} maintenance={maintenance} menuOn={menuOn}
        waHref={waHref} phone={phone} delivery={delivery} currency={currency} branchName={data.branch?.name ?? null}
      />
      <div className="mx-auto max-w-6xl space-y-16 px-4 pb-20 pt-10 sm:space-y-24 sm:px-6 sm:pt-14">
        {slides.length ? <PromoSlider images={slides} name={name} /> : null}
        {menuOn ? (
          <MenuSection categories={byCategory} currency={currency} showPrices={showPrices} canOrder={canOrder} closedMessage={maintenance ? null : closedMessage} theme={theme} onTheme={onTheme} ink={ink} deliveryOn={deliveryEnabled(delivery)} />
        ) : null}
        {aboutOn ? <AboutSection name={name} description={description} cover={cover} logo={logo} theme={theme} onTheme={onTheme} ink={ink} /> : null}
        {reviewsOn ? <ReviewsSection slug={slug} data={data} theme={theme} onTheme={onTheme} ink={ink} /> : null}
        {contactOn ? (
          <VisitSection name={name} socials={socials} theme={theme} ink={ink}
            info={{ address, hours, phone, email, waHref, waNumber, mapHref: mapLink(location, address), embed: mapEmbed(location, address) }} />
        ) : null}
        {appBanner ? <AppBanner name={name} android={appAndroid} ios={appIos} theme={theme} onTheme={onTheme} /> : null}
      </div>
      <SiteFooter
        name={name} description={description} logo={logo} theme={theme} onTheme={onTheme} roomForBar={barVisible} links={links} extraLinks={footerLinks(footer.links)}
        address={address} hours={hours} phone={phone} email={email} socials={socials} footerText={str(footer.text)} documents={legalDocuments(cfg.documents)}
      />
      {wa.show_button !== false && waHref ? (
        // Sits above the cart bar when the bar is showing so neither covers the other.
        <a href={waHref} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" className={cn("fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center gap-2 rounded-full bg-[#25d366] text-sm font-semibold text-[#06301a] shadow-[0_14px_30px_-12px_rgb(0_0_0/0.45)] transition-[background-color,bottom] hover:bg-[#2fe074] sm:right-6 sm:h-12 sm:w-auto sm:pl-3 sm:pr-4", barVisible ? "bottom-24 sm:bottom-28" : "bottom-4 sm:bottom-6")}>
          <MessageCircle className="h-6 w-6 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">{str(wa.button_label) || "Need help?"}</span>
        </a>
      ) : null}
      <CartBar currency={currency} theme={theme} onTheme={onTheme} onOpen={setSheet} />
      <CartSheet slug={slug} data={data} open={sheet !== null} view={sheet ?? "cart"} onViewChange={setSheet} onClose={closeSheet} theme={theme} onTheme={onTheme} canOrder={canOrder} closedMessage={closedMessage} />
    </main>
  );
}

// ---- Top bar ----

function StoreNav({ name, logo, theme, onTheme, links, showOrder, onCart }: { name: string; logo: string | null; theme: string; onTheme: string; links: { href: string; label: string }[]; showOrder: boolean; onCart: (view: CartSheetView) => void }) {
  const hydrated = useStorefrontCart((s) => s.hydrated);
  const lines = useStorefrontCart((s) => s.lines);
  const lastOrder = useStorefrontCart((s) => s.lastOrder);
  const n = hydrated ? count(lines) : 0;
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-16 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-2.5">
          <BrandMark logo={logo} name={name} theme={theme} onTheme={onTheme} className="h-9 w-9 rounded-xl text-base ring-1 ring-black/5 sm:h-10 sm:w-10" />
          <span className="truncate text-base font-extrabold tracking-tight text-heading sm:text-lg">{name}</span>
        </a>
        <nav aria-label="Site" className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((l) => <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-fg-secondary transition hover:bg-fg/5 hover:text-fg">{l.label}</a>)}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-2">
          {hydrated ? (
            <button type="button" onClick={() => onCart(!n && lastOrder ? "tracking" : "cart")} aria-label={n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart, empty"} className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition hover:bg-fg/5">
              <ShoppingBag className="h-5 w-5" />
              {n ? <span aria-hidden className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold tabular ring-2 ring-card" style={{ backgroundColor: theme, color: onTheme }}>{n}</span> : null}
            </button>
          ) : null}
          {showOrder ? <a href="#menu" className="hidden h-10 items-center rounded-full px-5 text-sm font-semibold shadow-sm transition hover:brightness-110 sm:inline-flex" style={{ backgroundColor: theme, color: onTheme }}>Order now</a> : null}
        </div>
      </div>
    </header>
  );
}

// ---- Cover and brand card ----

interface HeroProps {
  name: string; description: string; logo: string | null; cover: string; theme: string; onTheme: string; ink: string;
  rating: { average: string; reviews: string } | null; reviewsOn: boolean; hours: string; address: string;
  canOrder: boolean; maintenance: boolean; menuOn: boolean; waHref: string | null; phone: string;
  delivery: DeliverySettings; currency: string; branchName: string | null;
}

function Hero({ name, description, logo, cover, theme, onTheme, ink, rating, reviewsOn, hours, address, canOrder, maintenance, menuOn, waHref, phone, delivery, currency, branchName }: HeroProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const deliveryOn = deliveryEnabled(delivery);
  const eta = num(delivery.eta_minutes);
  const min = deliveryMinimum(delivery);
  const free = num(delivery.free_above_minor);
  const facts: { icon: typeof Bike; label: string; value: string }[] = [];
  if (deliveryOn) facts.push({ icon: Bike, label: "Delivery", value: eta && eta > 0 ? `About ${eta} min` : "Available" });
  facts.push({ icon: StoreIcon, label: "Pickup", value: branchName ? (/branch/i.test(branchName) ? branchName : `${branchName} branch`) : "At the restaurant" });
  if (deliveryOn) facts.push({ icon: Wallet, label: "Min. order", value: min > 0 ? formatMoney(min, currency) : "No minimum" });
  if (deliveryOn && free !== null && free > 0) facts.push({ icon: BadgePercent, label: "Free delivery", value: `Over ${formatMoney(free, currency)}` });
  const chip = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-[13px]";
  const ratingInner = rating ? <><Star className="h-3.5 w-3.5 fill-current" style={{ color: "#f5a524" }} /> <span className="font-bold">{rating.average}</span> · {rating.reviews}</> : null;
  const ratingLabel = rating ? `Rated ${rating.average} out of 5 from ${rating.reviews}` : "";
  return (
    <section aria-label={name} className="relative">
      {/* The cover keeps its whole picture in view (owners often upload a designed banner with text on it); the brand card sits below it. */}
      <div className="mx-auto max-w-6xl sm:px-6 sm:pt-6">
        <div className="relative aspect-[8/3] w-full overflow-hidden bg-muted sm:aspect-[3/1] sm:rounded-[28px]">
          {cover && !coverFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" onError={() => setCoverFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          ) : <BrandBackdrop theme={theme} />}
        </div>
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-3 sm:px-10 lg:px-14">
        <div className="-mt-5 rounded-[24px] bg-card p-5 shadow-[0_30px_70px_-35px_rgb(15_23_42/0.55)] ring-1 ring-black/5 sm:-mt-12 sm:rounded-[28px] sm:p-8">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-8">
            <div className="flex items-center gap-4 sm:gap-6 lg:col-start-1 lg:row-start-1">
              <BrandMark logo={logo} name={name} theme={theme} onTheme={onTheme} alt={`${name} logo`} className="h-16 w-16 rounded-2xl p-1 text-2xl shadow-md ring-1 ring-black/5 sm:h-24 sm:w-24 sm:text-4xl" />
              <div className="min-w-0">
                <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-heading sm:text-4xl lg:text-[44px] lg:leading-[1.1]">{name}</h1>
                {description ? <p className="mt-1 line-clamp-2 max-w-2xl text-[15px] text-fg-secondary sm:text-lg">{description}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:pl-[120px] lg:col-start-1 lg:row-start-2">
              <span className={cn(chip, canOrder ? "bg-success-soft text-success-ink" : "bg-muted text-fg-secondary")}>
                <span aria-hidden className={cn("h-2 w-2 rounded-full", canOrder ? "bg-success" : "bg-fg-muted")} />
                {canOrder ? "Open for orders" : maintenance ? "Ordering paused" : "Not taking orders now"}
              </span>
              {rating ? (
                reviewsOn
                  ? <a href="#reviews" className={cn(chip, "bg-muted text-fg transition hover:bg-fg/10")} aria-label={ratingLabel}>{ratingInner}</a>
                  : <span className={cn(chip, "bg-muted text-fg")} aria-label={ratingLabel}>{ratingInner}</span>
              ) : null}
              {hours ? <span className={cn(chip, "bg-muted font-medium text-fg-secondary")}><Clock className="h-3.5 w-3.5" /> <span className="tabular">{hours}</span></span> : null}
              {address ? <span className={cn(chip, "max-w-full bg-muted font-medium text-fg-secondary")}><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{address}</span></span> : null}
            </div>
            <div className="flex gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              {menuOn ? (
                <a href="#menu" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold shadow-[0_10px_24px_-12px_rgb(15_23_42/0.6)] transition hover:brightness-110 lg:flex-none" style={{ backgroundColor: theme, color: onTheme }}>
                  {canOrder ? "Order online" : "See the menu"} <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
              {waHref ? (
                <a href={waHref} target="_blank" rel="noreferrer" aria-label="WhatsApp us" className="inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border-strong/60 px-3.5 text-sm font-semibold transition hover:bg-fg/5 sm:px-5">
                  <MessageCircle className="h-5 w-5 text-[#1fa855]" /><span className="hidden sm:inline">WhatsApp</span>
                </a>
              ) : null}
              {phone ? (
                <a href={`tel:${phone}`} aria-label="Call us" className="inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border-strong/60 px-3.5 text-sm font-semibold transition hover:bg-fg/5 sm:px-5">
                  <Phone className="h-5 w-5" style={{ color: ink }} /><span className="hidden sm:inline">Call</span>
                </a>
              ) : null}
            </div>
          </div>
          {facts.length ? (
            <dl className={cn("mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-5 sm:mt-6", facts.length >= 4 ? "sm:grid-cols-4" : facts.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {facts.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${theme}14`, color: ink }}><f.icon className="h-5 w-5" /></span>
                  <div className="min-w-0"><dt className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">{f.label}</dt><dd className="truncate text-sm font-semibold text-heading">{f.value}</dd></div>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---- Menu ----

type MenuCategory = Storefront["categories"][number] & { products: StorefrontProduct[] };

/** The category whose heading has passed under the sticky bars; the first one until the menu is scrolled into. */
function useActiveCategory(ids: string[], barRef: React.RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const lockUntil = useRef(0);
  const key = ids.join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) { setActive(null); return; }
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (Date.now() < lockUntil.current) return;
      const line = (barRef.current?.getBoundingClientRect().bottom ?? 120) + 16;
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(`cat-${id}`);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, [key, barRef]);
  const pick = useCallback((id: string) => { lockUntil.current = Date.now() + 900; setActive(id); }, []);
  return [active, pick] as const;
}

function MenuSection({ categories, currency, showPrices, canOrder, closedMessage, theme, onTheme, ink, deliveryOn }: { categories: MenuCategory[]; currency: string; showPrices: boolean; canOrder: boolean; closedMessage: string | null; theme: string; onTheme: string; ink: string; deliveryOn: boolean }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => (query.trim() ? categories.map((c) => ({ ...c, products: c.products.filter((p) => matchesMenu(p, query)) })).filter((c) => c.products.length) : categories), [categories, query]);
  const barRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const [active, pick] = useActiveCategory(visible.map((c) => c.id), barRef);
  // Keep the active tab in view inside the bar without moving the page.
  useEffect(() => {
    const bar = tabsRef.current;
    const tab = active ? bar?.querySelector<HTMLElement>(`[data-cat="${active}"]`) : null;
    if (!bar || !tab) return;
    const left = tab.offsetLeft - 16, right = tab.offsetLeft + tab.offsetWidth + 16;
    if (left < bar.scrollLeft || right > bar.scrollLeft + bar.clientWidth) bar.scrollTo?.({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);
  const jump = (id: string) => { pick(id); document.getElementById(`cat-${id}`)?.scrollIntoView?.({ block: "start" }); };
  const productCount = categories.reduce((n, c) => n + c.products.length, 0);
  return (
    <section id="menu" aria-labelledby="menu-title" className="scroll-mt-20">
      <SectionHeading eyebrow={canOrder ? "Order online" : "Our food"} title="Menu" ink={ink} id="menu-title"
        subtitle={canOrder ? (deliveryOn ? "Freshly made to order, for delivery or pickup." : "Order ahead and collect it from the restaurant.") : undefined}>
        {productCount >= 8 ? (
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu" aria-label="Search the menu"
              className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-10 text-sm shadow-[0_1px_2px_rgb(15_23_42/0.05)] outline-none transition focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--primary)_22%,transparent)] [&::-webkit-search-cancel-button]:hidden" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-fg-muted hover:bg-fg/5"><X className="h-4 w-4" /></button> : null}
          </label>
        ) : null}
      </SectionHeading>
      {!canOrder && closedMessage ? (
        <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{closedMessage}</p>
        </div>
      ) : null}
      {categories.length ? (
        <>
          {visible.length > 1 ? (
            <div ref={barRef} className="sticky top-14 z-20 -mx-4 mt-5 bg-page/90 px-4 py-3 backdrop-blur-md sm:top-16 sm:-mx-6 sm:px-6">
              <nav ref={tabsRef} aria-label="Menu categories" className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visible.map((c) => {
                  const on = active === c.id;
                  return (
                    <button key={c.id} type="button" aria-current={on ? "true" : undefined} data-cat={c.id} onClick={() => jump(c.id)}
                      className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition", on ? "border-transparent shadow-sm" : "border-border bg-card text-fg-secondary hover:text-fg")}
                      style={on ? { backgroundColor: theme, color: onTheme } : undefined}>
                      {c.name}<span className={cn("text-xs font-medium", on ? "opacity-80" : "text-fg-muted")}>{c.products.length}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ) : <div className="h-6" />}
          {visible.length ? (
            <div className="mt-4 space-y-10 sm:space-y-12">
              {visible.map((c) => (
                <section key={c.id} id={`cat-${c.id}`} aria-labelledby={`cat-${c.id}-title`} className="scroll-mt-36 sm:scroll-mt-40">
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 id={`cat-${c.id}-title`} className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-heading sm:text-2xl">
                        <span aria-hidden className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: theme }} />{c.name}
                      </h3>
                      {c.subtitle ? <p className="mt-1 text-sm text-fg-secondary">{c.subtitle}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs font-medium text-fg-muted">{c.products.length} item{c.products.length === 1 ? "" : "s"}</span>
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                    {c.products.map((p) => <ProductCard key={p.id} product={p} currency={currency} showPrices={showPrices} canOrder={canOrder} theme={theme} onTheme={onTheme} />)}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed bg-card px-6 py-10 text-center">
              <p className="font-semibold text-heading">Nothing on the menu matches &ldquo;{query.trim()}&rdquo;</p>
              <button type="button" onClick={() => setQuery("")} className="mt-3 inline-flex h-10 items-center rounded-full border border-border-strong px-5 text-sm font-semibold hover:bg-fg/5">Show the whole menu</button>
            </div>
          )}
        </>
      ) : <p className="mt-6 rounded-3xl border border-dashed bg-card px-6 py-10 text-center text-sm text-fg-muted">The menu is being updated. Check back soon.</p>}
    </section>
  );
}

/** One dish: name, description, price (or "From" the cheapest size), its picture, and the Add button or stepper. */
function ProductCard({ product: p, currency, showPrices, canOrder, theme, onTheme }: { product: StorefrontProduct; currency: string; showPrices: boolean; canOrder: boolean; theme: string; onTheme: string }) {
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
    <button type="button" onClick={onClick} aria-label={`${label} ${p.name}`} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-[0_8px_18px_-10px_rgb(15_23_42/0.6)] transition hover:brightness-110 active:scale-95" style={{ backgroundColor: theme, color: onTheme }}>
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
  return (
    // Phones: a row with the picture on the right. Wider screens: a picture-first card (the picture comes second in the DOM so
    // screen readers hear the name first; flex-col-reverse puts it on top).
    <li className={cn("group flex gap-4 rounded-2xl border bg-card p-3.5 transition sm:flex-col-reverse sm:gap-0 sm:overflow-hidden sm:p-0", totalQty ? "" : "hover:shadow-[0_18px_40px_-22px_rgb(15_23_42/0.45)]")} style={totalQty ? { borderColor: theme, boxShadow: `0 0 0 1px ${theme}` } : undefined}>
      <div className="flex min-w-0 flex-1 flex-col sm:p-4">
        <h4 className="text-base font-bold leading-snug text-heading sm:text-[17px]">{p.name}</h4>
        {p.description ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-fg-secondary">{p.description}</p> : null}
        {hasVariants ? (
          <ul className={cn("mt-2 text-sm text-fg-secondary", pickerOpen ? "space-y-1.5" : "space-y-0.5")}>
            {p.variants.map((v) => {
              const q = qtyOf(v.id);
              return (
                <li key={v.id} className="flex items-center justify-between gap-3">
                  <span className={cn(pickerOpen && canOrder ? "font-medium text-fg" : "")}>{v.name}{showPrices ? <span className="tabular text-fg-secondary"> · {formatMoney(v.price_minor, currency)}</span> : null}</span>
                  {pickerOpen && canOrder ? (
                    q ? (
                      <QtyStepper size="sm" theme={theme} quantity={q} label={`${p.name} ${v.name}`} onIncrement={() => increment(lineKey(p.id, v.id))} onDecrement={() => decrement(lineKey(p.id, v.id))} />
                    ) : (
                      <button type="button" onClick={() => add({ product_id: p.id, variant_id: v.id, name: p.name, variant_name: v.name, unit_minor: v.price_minor })} aria-label={`Add ${p.name} ${v.name}`} className="inline-flex h-8 items-center gap-1 rounded-full border-2 px-3 text-xs font-semibold hover:bg-fg/5" style={{ borderColor: theme, color: themeInk(theme) }}><Plus className="h-3.5 w-3.5" /> Add</button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          {showPrices ? (
            <span className="text-base font-extrabold tabular text-heading">
              {hasVariants ? <><span className="text-xs font-semibold text-fg-muted">From </span>{formatMoney(fromPrice(p), currency)}</> : formatMoney(p.price_minor, currency)}
            </span>
          ) : <span />}
          {canOrder ? (
            hasVariants ? (
              pickerOpen ? (
                totalQty ? <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: `${theme}1a`, color: themeInk(theme) }}>{totalQty} in cart</span> : <button type="button" onClick={() => setPicker(false)} className="h-10 rounded-full px-3 text-sm font-medium text-fg-secondary hover:bg-fg/5">Close</button>
              ) : addButton(() => setPicker(true), "Choose")
            ) : totalQty ? (
              <QtyStepper theme={theme} quantity={totalQty} label={p.name} onIncrement={() => increment(lineKey(p.id, null))} onDecrement={() => decrement(lineKey(p.id, null))} />
            ) : addButton(() => add({ product_id: p.id, variant_id: null, name: p.name, variant_name: null, unit_minor: p.price_minor }))
          ) : null}
        </div>
      </div>
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none">
        <DishImage src={p.image_key} color={theme} className="h-full w-full rounded-xl transition duration-300 sm:rounded-none motion-safe:group-hover:scale-[1.04]" />
      </div>
    </li>
  );
}
