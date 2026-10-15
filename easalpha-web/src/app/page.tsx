import type { Metadata } from "next";
import { pageMetadata } from "@/components/site/seo";
import Link from "next/link";
import { ArrowRight, Banknote, BookOpen, CloudOff, Languages, MessageCircle, Monitor, Receipt, ShoppingBag, Tablet, ChefHat, Bike, Globe, LayoutDashboard, Bell, Zap } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, Container, CtaBand, Eyebrow, FaqList, FeatureRow, PhoneFrame, PrimaryLink, Reassurance, SecondaryLink, Section, SectionHeading, SHOTS, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { Counter } from "@/components/site/counter";
import { LangBox, Txt } from "@/components/site/txt";
import { PricingTable } from "@/components/site/pricing-table";
import { TRIAL_DAYS } from "@/components/site/site-helpers";
import { HOME_FAQ } from "@/components/site/faq";
import { GUIDES } from "@/components/site/guides";
import { JsonLd } from "@/components/site/json-ld";
import { faqPage, softwareApplication } from "@/lib/schema";
import { trackAttrs } from "@/lib/analytics";

export const metadata: Metadata = pageMetadata({ title: "Restaurant POS for any restaurant, anywhere | EasAlpha", description: "Offline till, kitchen display, inventory with recipe deduction, khata, payroll, riders, WhatsApp receipts and FBR tax invoices. 90 days free, no card needed.", path: "/", absolute: true });

const STATS = [
  { to: 27, label: "reports", sub: "each with CSV and PDF" },
  { to: 58, label: "permissions", sub: "granted per user" },
  { to: 7, label: "screens for your team", sub: "till to rider app" },
  { to: 1, label: "flat price", sub: "any currency, no per-order fees" },
];

const QUOTES = [
  { text: "The first month we could actually see food cost per dish. Two recipes were losing money and we fixed the portions the same week.", name: "Shahzad Sadaqat", place: "Shahzad Restaurant, Multan Road, Lahore" },
  { text: "Khata used to live in a notebook. Now every regular has a balance, a limit and a WhatsApp statement at month end.", name: "Muhammad Shahid", place: "TheSky Cafe" },
  { text: "Power went for three hours on a Friday night. The tills carried on, the kitchen screen carried on, and nothing was lost.", name: "Dastarkhwan", place: "Dastarkhwan Family Restaurant, Faisalabad" },
];

const PAKISTAN = [
  { icon: CloudOff, title: "Works through power and internet cuts", text: "The till and kitchen keep running when the internet drops. Orders queue locally and sync when it returns; nothing is lost silently." },
  { icon: Receipt, title: "Your country's tax rules", text: "Tax per item or per payment method, inclusive or exclusive, VAT, GST or sales tax. Pakistan gets FBR and PRA e-invoicing built in; other countries get the rates and invoice fields they need." },
  { icon: ShoppingBag, title: "Aggregator orders", text: "Foodpanda, Uber Eats or Talabat orders land in the same order list with their commission accounted for, so your reports show the real margin." },
  { icon: MessageCircle, title: "WhatsApp from your own number", text: "Link your restaurant's WhatsApp by scanning a QR. Receipts, statements, OTP codes and campaigns go out from a number your customers know." },
  { icon: BookOpen, title: "Customer credit done properly", text: "Each customer is a ledger account with a credit (khata) number, a credit limit, aging and a statement you can send with one tap." },
  { icon: Languages, title: "A second language on receipts", text: "Names for categories, products and modifiers in a second language, Urdu, Arabic or any other, print on receipts and show on the till and storefront." },
  { icon: Banknote, title: "Any currency, local wallets", text: "PKR, USD, AED, GBP or any other currency. Payment accounts for cash, cards, bank and mobile wallets such as JazzCash and EasyPaisa. Every payment posts to double-entry accounts automatically." },
  { icon: Bell, title: "Push alerts for owners", text: "A push when a day closes, a till stays offline too long, stock runs low or an order is cancelled." },
];

const SURFACES = [
  { icon: Monitor, title: "Desktop till", text: "Windows and Linux installer with ESC/POS printing and a print server tablets print through. Works offline." },
  { icon: Tablet, title: "Order-taker tablet", text: "Floor staff take dine-in and takeaway orders at the table; tickets go straight to the kitchen." },
  { icon: ChefHat, title: "Kitchen display", text: "Tickets per station with timers, alerts and bump. A token screen shows guests what is ready." },
  { icon: Bike, title: "Rider app", text: "Riders pair their phone, see assignments and mark status; the till confirms cash on delivery." },
  { icon: Globe, title: "Storefront website", text: "Your own ordering site with menu, cart, QR table ordering and reviews, on your domain if you like." },
  { icon: LayoutDashboard, title: "Admin panel", text: "Everything for owners and managers: menu, stock, money, people, reports and settings, per branch." },
];

function GlassCard({ icon: Icon, title, text, className }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-white/15 bg-[#0B1F3A]/70 px-4 py-3 text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md ${className ?? ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF7A1A] text-white"><Icon className="h-5 w-5" /></span>
      <div className="leading-tight">
        <div className="text-sm font-bold !text-white">{title}</div>
        <div className="text-xs !text-white/75">{text}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <SiteShell>
      <JsonLd data={[softwareApplication(), faqPage(HOME_FAQ)]} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0B1F3A] pb-32 pt-28 text-white sm:pt-36 lg:pb-44 [--heading-color:#fff]">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-br from-[#0B1F3A] to-[#10294D] [--heading-color:#fff]" />
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-48 h-[40rem] w-[40rem] rounded-full bg-[#FF7A1A]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-40 h-[36rem] w-[36rem] rounded-full bg-[#FF7A1A]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:24px_24px]" />
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" viewBox="0 0 1440 800" preserveAspectRatio="none" fill="none" stroke="white" strokeWidth="1">
          <path d="M-100 700 L600 -100" /><path d="M200 900 L1000 -100" /><path d="M500 900 L1300 -100" /><path d="M800 900 L1600 -100" /><path d="M1100 900 L1900 -100" />
          <circle cx="600" cy="-100" r="3" fill="white" /><circle cx="1000" cy="-100" r="3" fill="white" /><circle cx="400" cy="320" r="3" fill="white" /><circle cx="1150" cy="240" r="3" fill="white" />
        </svg>
        <Container className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <LangBox className="min-w-0 max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white backdrop-blur">
              <Zap className="h-4 w-4 text-[#FF7A1A]" aria-hidden /><Txt k="hero.badge" />
            </p>
            <h1 className="mt-6 text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[52px] lg:text-[60px]">
              <Txt k="hero.title.pre" /><Txt k="hero.title.accent" className="text-[#FF7A1A]" />
            </h1>
            <Txt k="hero.subtitle" as="p" className="mt-6 max-w-lg text-[17px] leading-[1.6] text-white/80 sm:text-lg" />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" {...trackAttrs("cta_start_free_click", { where: "hero" })} className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-brand-cta px-7 text-base font-semibold text-white shadow-[0_14px_30px_-10px_rgba(194,65,12,0.7)] transition hover:-translate-y-0.5 hover:bg-brand-cta-hover"><Txt k="cta.start" /><ArrowRight className="h-4 w-4" /></Link>
              <SecondaryLink href="#tour" size="lg" dark track={{ name: "cta_demo_click", props: { where: "hero" } }}><Txt k="cta.demo" /></SecondaryLink>
            </div>
            <Reassurance className="mt-7" />
          </LangBox>

          <div className="relative min-w-0 lg:[perspective:1200px]">
            <div className="relative lg:origin-left lg:[transform:rotateY(-6deg)]">
              <BrowserFrame shot={SHOTS.dashboard} sizes="(max-width: 1024px) 100vw, 620px" priority dark />
            </div>
            <div className="absolute -right-3 -top-6 grid h-24 w-24 -rotate-12 place-items-center rounded-full bg-brand-cta text-center text-sm font-extrabold leading-tight text-white shadow-[0_18px_40px_-12px_rgba(194,65,12,0.8)] ring-4 ring-[#0B1F3A] sm:-right-6 sm:-top-8 sm:h-28 sm:w-28 sm:text-base">Free<br />{TRIAL_DAYS} days</div>
            <GlassCard icon={CloudOff} title="Offline" text="sells with no internet" className="absolute -left-6 bottom-16 hidden sm:flex" />
            <GlassCard icon={MessageCircle} title="WhatsApp" text="receipts from your own number" className="absolute -bottom-7 right-4 hidden sm:flex lg:right-0" />
          </div>
        </Container>
      </section>

      {/* Stats strip */}
      <Container className="relative z-10 -mt-16 lg:-mt-20">
        <Reveal>
          <dl className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-[#E6EBF2] bg-white shadow-[0_30px_70px_-30px_rgba(11,31,58,0.5)] lg:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={s.label} className={`px-6 py-7 text-center ${i % 2 === 1 ? "border-l border-[#E6EBF2]" : ""} ${i < 2 ? "border-b border-[#E6EBF2] lg:border-b-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <dt className="text-[44px] font-extrabold leading-none tracking-[-0.02em] text-[#D9580A]"><Counter to={s.to} /></dt>
                <dd className="mt-2 text-base font-bold text-[#0B1F3A]">{s.label}<span className="block text-sm font-normal text-slate-500">{s.sub}</span></dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>

      {/* Testimonials */}
      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <div className="grid gap-6 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <Reveal key={q.name} delay={i * 90} className={`relative flex flex-col p-7 pt-10 ${CARD}`}>
              <span aria-hidden className="absolute left-6 top-2 font-serif text-[72px] font-bold leading-none text-[#FF7A1A]">&ldquo;</span>
              <p className="flex-1 text-slate-700">{q.text}</p>
              <div className="mt-6 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#0B1F3A] text-sm font-bold text-white [--heading-color:#fff]">{q.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
                <div className="leading-tight">
                  <div className="font-bold text-[#0B1F3A]">{q.name}</div>
                  <div className="text-sm text-slate-500">{q.place}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Tour */}
      <Section id="tour" tone="tint">
        <SectionHeading eyebrow="Product tour" title="Everything a restaurant runs on, in one account" titleKey="sec.tour" text="Not a till with add-ons. Sales, kitchen, stock, purchasing, money, people and customers share one database, so every number ties out." />
        <div className="mt-20 space-y-28">
          <FeatureRow eyebrow="Sell" title="A till that is fast at 9 pm on a Friday" text="Walk-in, takeaway and delivery from one screen, PIN login per cashier, part payments and a reopen flow that records every change." shot={SHOTS.till} caption="Desktop till, offline"
            bullets={["Works offline; orders queue and sync in order", "Deals, promotions, discount tiers and vouchers at the till", "Receipts on 58 or 80 mm paper with logo, Urdu names and a QR code"]} href="/features#sell" hrefLabel="All selling features" />
          <FeatureRow flip eyebrow="Kitchen" title="Every ticket where it belongs" text="Tickets route to stations, timers turn amber then red, and a bump clears the ticket. The token screen tells guests what is ready." shot={SHOTS.kitchen} caption="Kitchen display"
            bullets={["Stations per branch with their own printers or screens", "Alerts for late, modified or cancelled tickets", "Order-taker tablet sends dine-in orders straight to the kitchen"]} href="/features#kitchen" hrefLabel="All kitchen features" />
          <FeatureRow eyebrow="Inventory" title="Stock that deducts itself" text="Recipes link every product to its ingredients. When an order completes, stock is deducted once, never twice, and a safety-net job catches anything missed." shot={SHOTS.deduction} caption="Deduction Health"
            bullets={["Deduction Health shows deducted, pending and retried orders", "Actual vs theoretical, valuation and COGS, waste and adjustments", "Demand buckets tell you what to order and when"]} href="/features#inventory" hrefLabel="All inventory features" />
          <FeatureRow flip eyebrow="Money" title="Accounts that tie out, not a sales summary" text="Supplier ledgers, payment accounts and expenses post to real double-entry books with a chart of accounts, journal vouchers, trial balance and balance sheet." shot={SHOTS.balance} caption="Balance sheet"
            bullets={["Supplier Dr/Cr ledger with payments, adjustments and ranking", "Purchase orders, receipts, returns and price history verdicts", "Fixed assets, liabilities, equity and a finance dashboard"]} href="/features#money" hrefLabel="All money features" />
          <FeatureRow eyebrow="People" title="Attendance, payroll and permissions" text="A fingerprint kiosk feeds an attendance rules engine; payroll runs from it with advances, fines and allowances snapshotted per run." shot={SHOTS.attendance} caption="Attendance"
            bullets={["Fingerprint enrolment and scan log; selfie attendance without a reader", "Late, early, overtime and holiday rules per employee", "58 permissions per user with Cashier, Supervisor and Manager presets"]} href="/features#people" hrefLabel="All people features" />
          <FeatureRow flip eyebrow="Reports" title="27 reports that answer the question" text="From the Grand Report that ties sales, discounts, tax and payments together to cashier tills and a sales calendar. Every one exports to CSV and PDF." shot={SHOTS.grand} caption="Grand Report"
            bullets={["Business overview, sales, financial, products, categories", "Order takers, cashiers, cashier till, riders, vouchers, loyalty", "Branch comparison and scheduled reports by email"]} href="/features#reports" hrefLabel="All 27 reports" />
        </div>
      </Section>

      {/* Built for where you are */}
      <Section tone="navy" className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 top-0 h-[30rem] w-[30rem] rounded-full bg-[#FF7A1A]/15 blur-3xl" />
        <div className="relative">
          <SectionHeading dark eyebrow="Built for where you are" title="The local details, done right" titleKey="sec.pk" text="Currency, taxes, languages, wallets and delivery apps differ by country. EasAlpha runs in any of them, and was shaped by restaurants that run on patchy power and internet." />
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PAKISTAN.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 70} className="rounded-[20px] border border-white/10 bg-white/[0.06] p-6 transition-[transform,background-color] duration-300 hover:-translate-y-1 hover:bg-white/[0.1]">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#FF7A1A]/15 text-[#FF9A4D]"><f.icon className="h-6 w-6" /></span>
                <h3 className="mt-5 text-lg font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/75">{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Surfaces */}
      <Section tone="tint" id="surfaces">
        <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionHeading align="left" eyebrow="Seven surfaces, one account" title="Every screen your staff touch" titleKey="sec.surfaces" text="Each surface has its own login and permissions, and all of them write to the same orders, stock and accounts." />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {SURFACES.map((s, i) => (
                <Reveal as="li" key={s.title} delay={(i % 2) * 80} className={`flex gap-4 p-5 ${CARD}`}>
                  <span className={TILE_NAVY}><s.icon className="h-6 w-6" /></span>
                  <div>
                    <h3 className="font-bold text-[#0B1F3A]">{s.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{s.text}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryLink href="/signup" track={{ name: "cta_start_free_click", props: { where: "surfaces" } }}><Txt k="cta.start" /></PrimaryLink>
              <SecondaryLink href="/apps" track={{ name: "cta_demo_click", props: { where: "surfaces" } }}>Open an app screen</SecondaryLink>
            </div>
          </div>
          <Reveal delay={150} className="flex items-end justify-center gap-6">
            <PhoneFrame shot={SHOTS.storefrontPhone} sizes="(max-width: 640px) 55vw, 250px" className="translate-y-6" />
            <PhoneFrame shot={SHOTS.rider} sizes="(max-width: 640px) 55vw, 250px" className="hidden sm:block" />
          </Reveal>
        </div>
      </Section>

      {/* Pricing preview */}
      <Section id="pricing">
        <SectionHeading eyebrow="Pricing" title="Simple monthly plans in rupees" titleKey="sec.pricing" text={`Every plan starts with a ${TRIAL_DAYS}-day free trial. Pay yearly and get two months free.`} />
        <div className="mt-12"><PricingTable compact /></div>
        <p className="mt-10 text-center text-slate-600">Full comparison and billing questions on the <Link href="/pricing" className="py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">pricing page</Link>.</p>
      </Section>

      {/* Guides */}
      <Section id="guides">
        <SectionHeading eyebrow="In depth" title="The questions restaurants ask before they switch" text="Six short guides on the things that decide a POS purchase: tax filing, power cuts, the kitchen, stock, local payments and how we compare." />
        <p className="mt-6 text-center"><Link href="/guides" className={`py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]`}>All guides on one page</Link></p>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g, i) => (
            <Reveal as="li" key={g.slug} delay={(i % 3) * 70} className={`flex ${CARD}`}>
              <Link href={`/${g.slug}`} className="flex flex-1 flex-col p-6">
                <span className="text-lg font-bold text-[#0B1F3A]">{g.title}</span>
                <span className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{g.short}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A]">Read the guide<ArrowRight className="h-4 w-4 text-[#FF7A1A]" /></span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* FAQ */}
      <Section tone="tint">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div className="min-w-0">
            <Eyebrow>Questions</Eyebrow>
            <Txt k="sec.faq" as="h2" className="mt-3 text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#0B1F3A] sm:text-[40px]" />
            <p className="mt-5 text-slate-600">Anything else? <Link href="/contact" {...trackAttrs("whatsapp_click", { where: "home_faq" })} className="py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">Message us on WhatsApp</Link> and a person answers.</p>
            <div className={`mt-8 flex items-center gap-4 p-5 ${CARD}`}>
              <span className={TILE_ORANGE}><MessageCircle className="h-6 w-6" /></span>
              <div className="text-[15px] leading-relaxed text-slate-600">We answer in English and Urdu, every day during restaurant hours, wherever you are.</div>
            </div>
          </div>
          <FaqList items={HOME_FAQ} />
        </div>
      </Section>

      <CtaBand title="Open your account today" titleKey="sec.cta" text={`Create your restaurant, import the menu and sell this evening. ${TRIAL_DAYS} days free, no card, cancel any time.`} secondary={{ href: "/contact", label: "Talk to us" }} />
    </SiteShell>
  );
}
