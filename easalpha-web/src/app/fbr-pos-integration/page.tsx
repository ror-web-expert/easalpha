import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CloudOff, QrCode, ReceiptText, RefreshCw } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, CtaBand, FaqList, FeatureRow, HeroChip, PageHero, Section, SectionHeading, SHOTS, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { GUIDE_LINK, GuideSchema, GuideText, RelatedGuides } from "@/components/site/guide-page";
import { guideBySlug } from "@/components/site/guides";
import { PLANS, TRIAL_DAYS, formatMoney } from "@/components/site/site-helpers";

const SLUG = "fbr-pos-integration";
const guide = guideBySlug(SLUG)!;

export const metadata: Metadata = {
  title: "FBR POS integration and PRA e-invoicing",
  description: "FBR POS integration in the till: fiscal invoice number and QR code on every receipt, PRA, SRB, KPRA and BRA adapters, offline queueing and a status screen.",
  alternates: { canonical: `/${SLUG}`, languages: { en: `/${SLUG}`, "x-default": `/${SLUG}` } },
};

const pro = formatMoney(PLANS[1].pricePkrMinor, "PKR");

const FAQ = [
  { q: "Do I need a separate FBR POS machine or fiscal device?", a: "No. The till submits each paid order to the authority's API itself and prints the returned invoice number and QR code on the receipt. The only hardware is the counter PC and a thermal printer you already have." },
  { q: "What happens to invoices when the internet is down?", a: "The sale completes as normal and the invoice is queued with the order. When the connection returns the queue is submitted in order, failed submissions retry with a growing delay up to 50 times, and the receipt can be reprinted with the QR once the number arrives. The Tax Invoices screen shows what is still waiting." },
  { q: "Can branches in different provinces file to different authorities?", a: "Yes. The authority, NTN, POS ID and token are stored per branch, so a Lahore branch can file to PRA while a Karachi branch files to SRB, and the reports still roll up into one account." },
  { q: "How do I test before going live?", a: "Until a live token is entered, the branch runs in sandbox mode: every paid order still gets an invoice record and a sandbox number so cashiers see exactly how the receipt will look, and nothing is sent to the authority. Enter the production token and the next order files for real." },
  { q: "Which plan includes e-invoicing?", a: `Tax invoices are on Pro (${pro} a month) and Business. Every plan includes tax rates per item and per payment method, inclusive or exclusive, on the receipt; the authority filing is the part that needs Pro.` },
];

const STEPS = [
  { icon: ReceiptText, tile: TILE_ORANGE, title: "1. Register the branch", text: "In Settings, pick the authority for the branch (FBR, PRA, SRB, KPRA or BRA), enter the NTN, the POS ID the authority issued and the access token. Each branch has its own registration." },
  { icon: CheckCircle2, tile: TILE_NAVY, title: "2. Sell as usual", text: "Nothing changes at the counter. When an order is paid, EasAlpha builds the invoice from the order's lines, taxes and payment and submits it. The cashier never types anything twice." },
  { icon: QrCode, tile: TILE_ORANGE, title: "3. Number and QR on the receipt", text: "The authority's invoice number comes back and prints on the receipt with the QR code the customer can scan to verify it. The number is stored against the order for the reports." },
  { icon: RefreshCw, tile: TILE_NAVY, title: "4. Watch the queue", text: "Tax Invoices in the admin panel lists every invoice as queued, sent, accepted, failed or skipped, with the authority's reply when it rejects one, so a wrong NTN or an expired token is caught the same day." },
];

export default function FbrPosIntegrationPage() {
  return (
    <SiteShell>
      <GuideSchema guide={guide} faq={FAQ} />
      <PageHero crumb={guide.nav} eyebrow="FBR and PRA e-invoicing" title="FBR POS integration that lives in the till, not beside it"
        text="Every paid order becomes a fiscal invoice with the authority's number and a QR code on the receipt. Filing works through an outage, every submission has a status, and one account can file to FBR, PRA, SRB, KPRA and BRA branch by branch."
        visual={<div className="relative min-w-0 lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.grand} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={QrCode} title="QR on every receipt" text="the customer can verify it" className="absolute -left-4 -bottom-6 hidden sm:flex" /><HeroChip icon={CloudOff} title="Queued offline" text="submitted when the line is back" tone="navy" className="absolute -right-2 -top-6 hidden sm:flex" /></div>} />

      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <SectionHeading align="left" eyebrow="The requirement" title="What FBR and PRA actually ask of a restaurant" />
        <GuideText className="mx-0 mt-8">
          <p>FBR&apos;s point-of-sale integration for Tier-1 retailers and the Punjab Revenue Authority&apos;s e-invoicing both come down to the same thing at the counter: every sale has to be reported to the authority as it happens, and the receipt has to carry the invoice number the authority returns and a QR code the customer can scan to check it. The sales tax itself is nothing new; the reporting is.</p>
          <p>Most restaurants meet the rule with a second system: a fiscal device or a separate FBR POS beside the real till, with staff re-entering every bill into it. That doubles the keystrokes on a busy night, and the two systems drift apart by the end of the month. The receipts carry a number but the figures do not match, and the gap shows up in an audit.</p>
          <p>EasAlpha treats the fiscal invoice as part of the order. When an order is paid, the same record that prints the receipt and updates stock is also submitted to the authority, and the number and QR come back onto that receipt. There is one system, one set of figures, and one place to look when something is rejected. The plan comparison is on the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link>, and tax sits with the rest of the money features on the <Link href="/features#money" className={GUIDE_LINK}>features page</Link>.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <SectionHeading eyebrow="How it works" title="Four steps, none of them at the counter" text="Set up once per branch, then the till does the filing on every paid order." />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={(i % 2) * 80} className={`flex gap-4 p-6 ${CARD}`}>
              <span className={s.tile}><s.icon className="h-6 w-6" /></span>
              <div>
                <h3 className="font-bold text-[#0B1F3A]">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="space-y-28">
          <FeatureRow eyebrow="Outages" title="Filing that survives load-shedding" text="A fiscal rule that only works online would stop sales every time the line drops. EasAlpha completes the sale offline, queues the invoice with the order, and submits the queue in order when the connection returns. Submissions that fail are retried with a growing delay, up to 50 attempts, and nothing is marked done until the authority accepts it."
            bullets={["The sale, receipt and stock deduction never wait for the authority", "Queued and failed invoices retry on their own; the status screen shows which are still waiting", "A reprint carries the QR once the number has arrived"]}
            shot={SHOTS.till} caption="Till, offline" href="/offline-pos-system" hrefLabel="How the offline till works" />
          <FeatureRow flip eyebrow="Tax rates" title="Tax the way the authority wants it, before the filing" text="The invoice is only as right as the tax on it. Rates can be set per item or per category, inclusive or exclusive of the price, and per payment method, so a card sale and a cash sale can carry different rates where the province asks for that. The Grand Report then ties sales, discounts, tax and payments together to the rupee."
            bullets={["Rates per item, category or payment method, inclusive or exclusive", "The receipt shows the tax lines and the registration details of the branch", "27 reports, with the Grand Report reconciling tax against payments"]}
            shot={SHOTS.grand} caption="Grand Report" href="/features#reports" hrefLabel="See the reports" />
        </div>
      </Section>

      <Section tone="tint">
        <SectionHeading align="left" eyebrow="Honest limits" title="What the integration does not do" />
        <GuideText className="mx-0 mt-8">
          <p>It does not register you with the authority. Getting the NTN, the POS ID and the token is still paperwork you do with FBR or the provincial authority, and we will tell you exactly which fields to ask for. It does not file your monthly return; it gives you the invoice-level data the return is built from, exportable to CSV and PDF from the reports. And it does not invent a number when the authority is unreachable: the invoice waits in the queue, visibly, until the authority answers. A fiscal number is the authority&apos;s to issue, not ours.</p>
          <p>If you are moving from another POS that already files, the orders you bring across keep their history and the filing starts from the first sale on EasAlpha. <Link href="/contact" className={GUIDE_LINK}>Talk to us</Link> before the switch and we will walk through the registration for each branch, or start the {TRIAL_DAYS}-day trial and try the sandbox mode on your own menu first.</p>
        </GuideText>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading align="left" eyebrow="Questions" title="About e-invoicing" text="Hardware, outages, provinces, testing and plans." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="File every invoice from the till you already use" text={`Set up a branch, enter the registration and watch the first sandbox invoice print. ${TRIAL_DAYS} days free, no card.`} secondary={{ href: "/pricing", label: "See the plans" }} />
      <RelatedGuides slug={SLUG} />
    </SiteShell>
  );
}
