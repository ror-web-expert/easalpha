import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus, Scale } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { CtaBand, FaqList, HeroStack, PageHero, Section, SectionHeading } from "@/components/site/sections";
import { Banknote, CalendarCheck } from "lucide-react";
import { GUIDE_LINK, GuideSchema, GuideText, RelatedGuides } from "@/components/site/guide-page";
import { guideBySlug } from "@/components/site/guides";
import { PLANS, TRIAL_DAYS, formatMoney } from "@/components/site/site-helpers";

const SLUG = "arfapos-alternative";
const guide = guideBySlug(SLUG)!;

export const metadata: Metadata = {
  title: "ArfaPOS alternative: EasAlpha compared",
  description: "EasAlpha and ArfaPOS compared for restaurants in Pakistan: published prices, trial length, offline tills, FBR and PRA e-invoicing, kitchen display and support.",
  alternates: { canonical: `/${SLUG}`, languages: { en: `/${SLUG}`, "x-default": `/${SLUG}` } },
};

/** ArfaPOS figures are from arfapos.com as read on 15 October 2026. If their site changes, this page is wrong until it is updated. */
const CHECKED = "15 October 2026";
const rs = (i: number) => formatMoney(PLANS[i].pricePkrMinor, "PKR");

type Cell = string | boolean;
const ROWS: { label: string; arfa: Cell; eas: Cell }[] = [
  { label: "Entry plan, per month", arfa: "Rs 4,999 (Starter: 1 admin, 1 cashier)", eas: `${rs(0)} (Starter: 1 till, 3 staff logins)` },
  { label: "Middle plan, per month", arfa: "Rs 9,999 (Growth: up to 10 cashiers)", eas: `${rs(1)} (Pro: 3 tills, unlimited staff)` },
  { label: "Top plan, per month", arfa: "Rs 14,999 (Business: multi-branch, unlimited staff)", eas: `${rs(2)} (Business: 10 tills, up to 20 branches)` },
  { label: "Extra branch", arfa: "From Rs 3,000 a month", eas: "Included in Business, up to 20" },
  { label: "Yearly billing", arfa: "Not stated on the site", eas: "Ten months' price (two months free)" },
  { label: "Free trial", arfa: "7 days of the Business plan, no card", eas: `${TRIAL_DAYS} days of the plan you choose, no card` },
  { label: "Offline selling on the counter PC", arfa: true, eas: true },
  { label: "FBR and PRA e-invoicing", arfa: "Growth and Business; Rs 2,500 a month add-on on Starter", eas: "Pro and Business, with SRB, KPRA and BRA too" },
  { label: "Kitchen display", arfa: "Growth and above", eas: "Pro and above, with a token screen" },
  { label: "Inventory", arfa: "Growth and above", eas: "Pro and above: recipes, deduction, purchase orders, supplier ledgers" },
  { label: "WhatsApp receipts", arfa: "Growth and above", eas: "Every plan, with a monthly allowance; your own number on Business" },
  { label: "Payroll", arfa: "Business", eas: "Business, with attendance rules and a fingerprint kiosk" },
  { label: "Double-entry accounts, balance sheet", arfa: "Not stated on the site", eas: true },
  { label: "Desktop till", arfa: "Windows 10 or 11", eas: "Windows, Linux and macOS" },
  { label: "Order-taker tablet, rider app, QR table ordering, storefront", arfa: true, eas: true },
  { label: "Customer app on Android", arfa: true, eas: false },
  { label: "Customer-facing display at the counter", arfa: true, eas: false },
  { label: "Support", arfa: "WhatsApp, described as 24/7", eas: "WhatsApp and email, 10 am to 11 pm, every day" },
  { label: "Built in", arfa: "Bhakkar, Pakistan (AiroxLab)", eas: "Lahore, Pakistan" },
];

const FAQ = [
  { q: "Is EasAlpha cheaper than ArfaPOS?", a: `On the published monthly prices, yes at every tier: ${rs(0)} against Rs 4,999, ${rs(1)} against Rs 9,999 and ${rs(2)} against Rs 14,999. The fairer comparison is what each tier includes. A Starter restaurant that needs FBR filing pays ArfaPOS Rs 4,999 plus a Rs 2,500 add-on; on EasAlpha e-invoicing starts at Pro, ${rs(1)}, which also brings the kitchen display and inventory.` },
  { q: "What does ArfaPOS have that EasAlpha does not?", a: "Two things on their site today that we do not offer: a branded customer ordering app on Android, and a customer-facing display at the counter. EasAlpha's customer ordering runs as a website on your domain with QR table ordering, which works on any phone without an install, and the token screen faces the queue rather than the counter. If a native Android app matters to you, that is a real difference." },
  { q: "Can I move my menu and customers across?", a: "Products, categories and customers import from CSV, and the setup checklist walks through printers, tills and tax registration. Export the lists from your current admin portal, send them to us and we will map the columns; most single-branch menus are live the same day." },
  { q: "Where do the ArfaPOS figures come from?", a: `Every ArfaPOS fact on this page was read from arfapos.com on ${CHECKED}: the plan prices and what they include, the trial, the FBR add-on, the hardware and the support hours. We have not tested their software ourselves and make no claim about how well it works. If something here is out of date, tell us and we will correct it.` },
];

function CellView({ v }: { v: Cell }) {
  if (v === true) return <Check className="h-5 w-5 text-[#FF7A1A]" aria-label="Yes" />;
  if (v === false) return <span className="inline-flex items-center gap-1.5 text-slate-500"><Minus className="h-4 w-4" aria-hidden />Not offered</span>;
  return <>{v}</>;
}

export default function ArfaPosAlternativePage() {
  return (
    <SiteShell>
      <GuideSchema guide={guide} faq={FAQ} />
      <PageHero crumb={guide.nav} eyebrow="ArfaPOS alternative" title="EasAlpha and ArfaPOS, compared fairly"
        text={`Both are restaurant POS systems built in Pakistan with an offline till, FBR and PRA e-invoicing and a rider app. This page sets the two side by side on what each publishes, with the ArfaPOS figures taken from their site on ${CHECKED}.`}
        visual={<HeroStack chips={[{ icon: Scale, title: "Like for like", text: "published prices and plan contents" }, { icon: CalendarCheck, title: `${TRIAL_DAYS} days against 7`, text: "trial length, no card on either" }, { icon: Banknote, title: `${rs(0)} against Rs 4,999`, text: "entry plan, per month" }]} />} />

      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <SectionHeading align="left" eyebrow="Why this page exists" title="How to read a comparison written by one of the two" />
        <GuideText className="mx-0 mt-8">
          <p>Owners looking for an ArfaPOS alternative usually ask the same three questions: what does it cost, does it do the Pakistani things (FBR, PRA, JazzCash, EasyPaisa, offline), and what will I lose by switching. We wrote this page to answer them plainly. Every ArfaPOS fact is something their public site says today, quoted as closely as the table allows; where their site does not say, the table says so rather than guessing.</p>
          <p>The two products are closer in shape than most comparisons admit. Both run a Windows till that keeps selling offline, both file e-invoices to FBR and PRA, both take JazzCash and EasyPaisa, both have an order-taker tablet, a rider app, QR table ordering and a customer website. The differences are in price, in what each tier includes, in trial length, in the accounting and inventory depth, and in two customer-facing extras ArfaPOS has and we do not. The table below lists them; the <Link href="/features" className={GUIDE_LINK}>features page</Link> and the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link> carry the full EasAlpha detail.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <SectionHeading eyebrow="Side by side" title="What each product publishes" text={`ArfaPOS column from arfapos.com on ${CHECKED}. EasAlpha column from this site. Prices are monthly in rupees before tax.`} />
        <div className="mt-12 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">EasAlpha compared with ArfaPOS</caption>
            <thead>
              <tr className="bg-[#0B1F3A] text-left text-white [--heading-color:#fff]">
                <th scope="col" className="px-5 py-4 font-semibold">What</th>
                <th scope="col" className="px-5 py-4 font-semibold">ArfaPOS</th>
                <th scope="col" className="px-5 py-4 font-semibold">EasAlpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">{r.label}</th>
                  <td className="px-5 py-3 text-slate-700"><CellView v={r.arfa} /></td>
                  <td className="px-5 py-3 text-slate-700"><CellView v={r.eas} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <SectionHeading align="left" eyebrow="The differences that matter" title="Where the two part ways" />
        <GuideText className="mx-0 mt-8">
          <h3>Price and what a tier includes</h3>
          <p>EasAlpha&apos;s three plans are {rs(0)}, {rs(1)} and {rs(2)} a month; ArfaPOS publishes Rs 4,999, Rs 9,999 and Rs 14,999. The gap is widest where it is felt most: a one-counter restaurant that must file to FBR pays ArfaPOS Rs 7,499 a month with the Starter add-on, or moves to Growth at Rs 9,999. On EasAlpha, filing comes with Pro at {rs(1)}, together with the kitchen display, inventory, riders and tables. Extra branches cost from Rs 3,000 a month on ArfaPOS; on EasAlpha Business covers up to 20 branches in the price. EasAlpha also publishes yearly billing at ten months&apos; price; ArfaPOS&apos;s site does not mention a yearly rate.</p>
          <h3>Trial and the first month</h3>
          <p>ArfaPOS offers 7 days of its Business plan with no card. EasAlpha offers {TRIAL_DAYS} days of whichever plan you pick, also with no card. Seven days shows the till; ninety covers a full month of closing, counts and a payroll run.</p>
          <h3>Depth behind the counter</h3>
          <p>Both products list inventory, but EasAlpha&apos;s is recipe-driven: selling a dish deducts its ingredients once on completion, with a Deduction Health screen for anything missed, purchase orders, goods received, supplier ledgers and actual-against-theoretical reports. Money is double-entry: payment accounts, expenses, journal vouchers, trial balance and balance sheet, with 27 reports that export to CSV and PDF. ArfaPOS&apos;s site lists full reports and inventory without that detail, so we do not claim they lack it; we only say what ours contains.</p>
          <h3>What ArfaPOS has that we do not</h3>
          <p>A customer ordering app on Android under your brand, and a customer-facing display at the counter. EasAlpha&apos;s ordering runs as a branded website with QR table ordering on any phone, and its guest-facing screen is the token board for the queue. If a native app or a second screen at the till is on your list, weigh that honestly.</p>
          <h3>Platforms and support</h3>
          <p>ArfaPOS names Windows 10 or 11 for the counter. EasAlpha&apos;s till installs on Windows, Linux and macOS. ArfaPOS describes its WhatsApp support as 24/7; ours answers in English and Urdu from 10 am to 11 pm every day, and we say so rather than promise more.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <SectionHeading align="left" eyebrow="Switching" title="Moving from ArfaPOS without losing the month" />
        <GuideText className="mx-0 mt-8">
          <p>Export products, categories and customers from the admin portal you use today and import them from CSV; khata balances come across as opening balances with a reason recorded. Pair the same counter PC as a till, keep the same 58 or 80 mm printers, enter the branch&apos;s FBR or PRA registration and run the new till beside the old one for a shift before you switch. If the two tills disagree at close, <Link href="/contact" className={GUIDE_LINK}>message us on WhatsApp</Link>; a person answers.</p>
        </GuideText>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading align="left" eyebrow="Questions" title="About the comparison" text="Price, what we lack, moving across, and where the figures come from." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="Try it beside your current till" text={`${TRIAL_DAYS} days free, no card, your own menu. Keep whichever one closes the day correctly.`} secondary={{ href: "/pricing", label: "Compare the plans" }} />
      <RelatedGuides slug={SLUG} />
    </SiteShell>
  );
}
