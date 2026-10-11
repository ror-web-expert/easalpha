import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Txt } from "./txt";
import type { UiKey } from "./site-helpers";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Section({ id, className, tone = "white", children }: { id?: string; className?: string; tone?: "white" | "tint" | "navy"; children: React.ReactNode }) {
  const tones = { white: "bg-white", tint: "bg-[#F4F7FB]", navy: "bg-[#0B1F3A] text-white [--heading-color:#fff]" };
  return (
    <section id={id} className={cn("scroll-mt-20 py-20 sm:py-24 lg:py-28", tones[tone], className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm font-bold uppercase tracking-wider text-[#C2410C]", className)}>{children}</p>;
}

export function SectionHeading({ eyebrow, title, titleKey, text, align = "center", dark }: { eyebrow?: string; title: string; titleKey?: UiKey; text?: string; align?: "center" | "left"; dark?: boolean }) {
  const h2 = cn("mt-3 text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]", dark ? "text-white" : "text-[#0B1F3A]");
  return (
    <Reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow className={dark ? "text-[#FFB27A]" : undefined}>{eyebrow}</Eyebrow> : null}
      {titleKey ? <Txt k={titleKey} as="h2" className={h2} /> : <h2 className={h2}>{title}</h2>}
      {text ? <p className={cn("mt-5 text-[17px] leading-[1.6] sm:text-lg", dark ? "text-white/80" : "text-slate-600")}>{text}</p> : null}
    </Reveal>
  );
}

export function PrimaryLink({ href, children, className, size = "md" }: { href: string; children: React.ReactNode; className?: string; size?: "md" | "lg" }) {
  return (
    <Link href={href} className={cn("inline-flex items-center justify-center gap-2 rounded-full bg-[#FF7A1A] font-semibold text-white shadow-sm transition hover:bg-[#E0640C] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF7A1A]", size === "lg" ? "h-13 px-7 text-base" : "h-11 px-6 text-sm", className)}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children, className, size = "md", dark }: { href: string; children: React.ReactNode; className?: string; size?: "md" | "lg"; dark?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center justify-center gap-2 rounded-full border font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2", dark ? "border-white/40 text-white hover:bg-white/10 focus-visible:outline-white" : "border-[#0B1F3A]/25 text-[#0B1F3A] hover:border-[#0B1F3A]/50 hover:bg-[#F4F7FB] focus-visible:outline-[#0B1F3A]", size === "lg" ? "h-13 px-7 text-base" : "h-11 px-6 text-sm", className)}>
      {children}
    </Link>
  );
}

export type Shot = { src: string; alt: string; width: number; height: number; url?: string };

/** Admin and storefront captures are 2880x1800 at 2x; till and kitchen 2732x1536; phones 1170x2532. */
export const SHOTS = {
  dashboard: { src: "/marketing/admin-dashboard.png", alt: "Servio admin dashboard with today's sales, order cards and the sales chart", width: 1440, height: 900, url: "app.servio.pk/admin" },
  orders: { src: "/marketing/admin-orders.png", alt: "Orders list with status, type, payment and rider filters", width: 1440, height: 900, url: "app.servio.pk/admin/orders" },
  catalog: { src: "/marketing/admin-catalog.png", alt: "Product catalog with categories, images and prices", width: 1440, height: 900, url: "app.servio.pk/admin/products/catalog" },
  stock: { src: "/marketing/admin-stock.png", alt: "Stock in hand by section with quantities and values", width: 1440, height: 900, url: "app.servio.pk/admin/inventory/stock-in-hand" },
  deduction: { src: "/marketing/admin-deduction-health.png", alt: "Deduction Health screen showing deducted, pending and retried orders", width: 1440, height: 900, url: "app.servio.pk/admin/inventory-reports/deduction-health" },
  grand: { src: "/marketing/admin-grand-report.png", alt: "Grand Report with sales, discounts, taxes and payments for the period", width: 1440, height: 900, url: "app.servio.pk/admin/reports/grand-report" },
  finance: { src: "/marketing/admin-finance.png", alt: "Finance dashboard with payment accounts and movements", width: 1440, height: 900, url: "app.servio.pk/admin/finance" },
  balance: { src: "/marketing/admin-balance-sheet.png", alt: "Balance sheet with assets, liabilities and equity", width: 1440, height: 900, url: "app.servio.pk/admin/finance/balance-sheet" },
  attendance: { src: "/marketing/admin-attendance.png", alt: "Attendance screen with today's sessions and the scan log", width: 1440, height: 900, url: "app.servio.pk/admin/payroll/attendance" },
  supplier: { src: "/marketing/admin-supplier-ledger.png", alt: "Supplier ledger with debit, credit and running balance", width: 1440, height: 900, url: "app.servio.pk/admin/suppliers/ledger" },
  whatsapp: { src: "/marketing/admin-whatsapp.png", alt: "WhatsApp settings with the linked number, templates and send log", width: 1440, height: 900, url: "app.servio.pk/admin/settings/whatsapp" },
  permissions: { src: "/marketing/admin-permissions.png", alt: "Permission editor with modules, presets and surface badges", width: 1440, height: 900, url: "app.servio.pk/admin/staff/cashiers" },
  calendar: { src: "/marketing/admin-sales-calendar.png", alt: "Sales calendar showing revenue per day of the month", width: 1440, height: 900, url: "app.servio.pk/admin/reports/sales-calendar" },
  till: { src: "/marketing/pos-till.png", alt: "Servio till with the menu grid, the order and payment buttons", width: 1366, height: 768, url: "Servio Till" },
  kitchen: { src: "/marketing/kitchen-display.png", alt: "Kitchen display with tickets per station and timers", width: 1366, height: 768, url: "Kitchen display" },
  storefrontDesktop: { src: "/marketing/storefront-desktop.png", alt: "Restaurant storefront website with the menu and cart", width: 1440, height: 900, url: "yourrestaurant.servio.pk" },
  storefrontPhone: { src: "/marketing/storefront-phone.png", alt: "Storefront on a phone with the menu and ordering", width: 585, height: 1266 },
  rider: { src: "/marketing/rider-pair.png", alt: "Rider app pairing screen on a phone", width: 585, height: 1266 },
} satisfies Record<string, Shot>;

export function BrowserFrame({ shot, sizes, priority, className, glow = true, dark }: { shot: Shot; sizes: string; priority?: boolean; className?: string; glow?: boolean; dark?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      {glow ? <div aria-hidden className={cn("pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl", dark ? "bg-linear-to-br from-[#FF7A1A]/45 via-[#FF7A1A]/15 to-transparent" : "bg-linear-to-br from-[#FF7A1A]/20 via-[#0B1F3A]/10 to-transparent")} /> : null}
      <div className={cn("overflow-hidden rounded-xl shadow-[0_30px_70px_-25px_rgba(11,31,58,0.55)]", dark ? "border border-white/10 bg-[#10294D] ring-1 ring-white/10" : "border border-slate-200/80 bg-white ring-1 ring-black/5")}>
        <div className={cn("flex items-center gap-2 border-b px-3 py-2", dark ? "border-white/10 bg-[#0B1F3A]" : "border-slate-200 bg-[#F4F7FB]")}>
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#fc605c]" /><span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" /><span className="h-2.5 w-2.5 rounded-full bg-[#34c84a]" />
          </span>
          {shot.url ? <span className={cn("mx-auto truncate rounded-md px-3 py-0.5 text-[11px]", dark ? "bg-white/10 text-white/70" : "bg-white text-slate-500 ring-1 ring-slate-200")}>{shot.url}</span> : null}
        </div>
        <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes={sizes} priority={priority} className="block h-auto w-full" />
      </div>
    </div>
  );
}

export function PhoneFrame({ shot, sizes, className, priority }: { shot: Shot; sizes: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative mx-auto w-[220px] sm:w-[250px]", className)}>
      <div aria-hidden className="pointer-events-none absolute -inset-5 -z-10 rounded-[3rem] bg-linear-to-br from-[#FF7A1A]/30 to-[#0B1F3A]/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.2rem] border-[7px] border-[#0B1F3A] bg-[#0B1F3A] shadow-[0_24px_60px_-20px_rgba(11,31,58,0.6)] [--heading-color:#fff]">
        <div aria-hidden className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-xl bg-[#0B1F3A] [--heading-color:#fff]" />
        <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes={sizes} priority={priority} className="block h-auto w-full rounded-[1.7rem]" />
      </div>
    </div>
  );
}

export function FeatureRow({ eyebrow, title, text, bullets, shot, flip, href = "/features", hrefLabel = "Learn more", id, caption }: { eyebrow: string; title: string; text: string; bullets: string[]; shot: Shot; flip?: boolean; href?: string; hrefLabel?: string; id?: string; caption?: string }) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={cn(flip && "lg:order-2")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-3 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#0B1F3A] sm:text-[34px]">{title}</h3>
        <p className="mt-4 text-[17px] leading-[1.6] text-slate-600 sm:text-lg">{text}</p>
        <ul className="mt-6 space-y-3">
          {bullets.slice(0, 3).map((b) => (
            <li key={b} className="flex items-start gap-3 text-slate-700">
              <CheckCircle2 aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[#FF7A1A]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {href ? <Link href={href} className="mt-6 inline-flex items-center gap-1.5 font-semibold text-[#0B1F3A] hover:underline">{hrefLabel}<ArrowRight className="h-4 w-4 text-[#FF7A1A]" /></Link> : null}
      </Reveal>
      <Reveal delay={120} className={cn("relative", flip && "lg:order-1")}>
        <BrowserFrame shot={shot} sizes="(max-width: 1024px) 100vw, 560px" />
        {caption ? <span className="absolute -bottom-3 left-6 rounded-full bg-[#0B1F3A] px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/20 [--heading-color:#fff]">{caption}</span> : null}
      </Reveal>
    </div>
  );
}

export function FaqList({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-20px_rgba(11,31,58,0.4)]">
      {items.map((it) => (
        <details key={it.q} className="group px-5 py-4 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-[#0B1F3A] [&::-webkit-details-marker]:hidden">
            {it.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-[#FF7A1A] transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 text-slate-600">{it.a}</div>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title, titleKey, text, primary = { href: "/signup", label: "Start free" }, secondary }: { title: string; titleKey?: UiKey; text: string; primary?: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  const h2 = "text-[36px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[48px]";
  return (
    <section className="relative overflow-hidden bg-[#0B1F3A] py-20 text-white sm:py-28 [--heading-color:#fff]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#FF7A1A]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#1E88E5]/20 blur-3xl" />
      <Container className="relative text-center">
        {titleKey ? <Txt k={titleKey} as="h2" className={h2} /> : <h2 className={h2}>{title}</h2>}
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-[1.6] text-white/80 sm:text-lg">{text}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={primary.href} className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#FF7A1A] px-7 text-base font-semibold text-white shadow-lg transition hover:bg-[#E0640C]">{primary.label}<ArrowRight className="h-4 w-4" /></Link>
          {secondary ? <SecondaryLink href={secondary.href} size="lg" dark>{secondary.label}</SecondaryLink> : null}
        </div>
        <Reassurance className="mt-8 justify-center" />
      </Container>
    </section>
  );
}

/** The three short promises under hero and CTA buttons. */
export function Reassurance({ className, dark = true }: { className?: string; dark?: boolean }) {
  const items: UiKey[] = ["hero.trial", "hero.nocard", "hero.setup"];
  return (
    <ul className={cn("flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium", dark ? "text-white/85" : "text-[#0B1F3A]", className)}>
      {items.map((k) => (
        <li key={k} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#FF7A1A]" aria-hidden /><Txt k={k} /></li>
      ))}
    </ul>
  );
}

/** Shared card and icon-tile styles for the public site. */
export const CARD = "rounded-[20px] border border-[#E6EBF2] bg-white shadow-[0_10px_30px_-20px_rgba(11,31,58,0.35)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-24px_rgba(11,31,58,0.45)]";
export const TILE_ORANGE = "grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#FFF1E8] text-[#E0640C]";
export const TILE_NAVY = "grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#E8EEF7] text-[#0B1F3A]";

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 text-slate-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#0B1F3A] [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-[#FF7A1A] [&_ul]:space-y-1.5">{children}</div>;
}

/** Navy top band for inner pages; the fixed header sits over it, so it carries the header's height in padding. */
export function PageHero({ eyebrow, title, text, children }: { eyebrow: string; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-linear-to-br from-[#0B1F3A] to-[#10294D] pb-16 pt-28 text-white sm:pb-20 sm:pt-36 [--heading-color:#fff]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#FF7A1A]/15 blur-3xl" />
      <Container className="relative max-w-3xl text-center">
        <Eyebrow className="text-[#FFB27A]">{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">{title}</h1>
        {text ? <p className="mt-5 text-[17px] leading-[1.6] text-white/80 sm:text-lg">{text}</p> : null}
        {children}
      </Container>
    </section>
  );
}
