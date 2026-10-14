import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/shell";
import { CtaBand, FaqList, HeroStack, PageHero, Section, SectionHeading } from "@/components/site/sections";
import { BadgeCheck, Banknote, CalendarCheck } from "lucide-react";
import { PricingTable } from "@/components/site/pricing-table";
import { TRIAL_DAYS } from "@/components/site/site-helpers";

export const metadata: Metadata = {
  title: "Pricing",
  description: `EasAlpha plans in USD or PKR: Starter, Pro and Business, billed monthly or yearly. Yearly billing is ten months' price. Every plan starts with a ${TRIAL_DAYS}-day free trial.`,
  alternates: { canonical: "/pricing" },
};

const FAQ = [
  { q: "How do I pay?", a: "Debit or credit card or bank transfer anywhere; JazzCash and EasyPaisa in Pakistan. Customers in Pakistan are billed in rupees, everyone else in US dollars." },
  { q: "What happens when the trial ends?", a: `Your trial lasts ${TRIAL_DAYS} days with every feature of the plan you picked. Near the end we remind you by email and WhatsApp. If you do not pick a plan, the account goes read-only: you can still log in and export everything, and nothing is deleted without your say.` },
  { q: "Is yearly billing really two months free?", a: "Yes. A year is charged at ten times the monthly price. The cards above show the yearly amount spread over twelve months so plans compare easily." },
  { q: "Can I change plans?", a: "Any time. Upgrades apply immediately and you pay the difference for the rest of the period. Downgrades apply at the next renewal." },
  { q: "What counts as a till?", a: "A paired device that takes payment: the desktop till or a tablet running the till. Kitchen displays, token screens, order-taker tablets and rider phones do not count as tills." },
  { q: "What are WhatsApp utility messages?", a: "Receipts, statements, OTP codes and order updates sent to customers. Each plan includes a monthly allowance; marketing campaigns use the same allowance. On Business you can send from your own WhatsApp number linked by QR." },
  { q: "Do you charge per order or per branch?", a: "No per-order fees. Starter and Pro are for one branch; Business covers up to 20 branches in one account with branch-level reports and store management." },
  { q: "Is there a setup fee or a contract?", a: "No setup fee and no lock-in. Monthly plans cancel any time and run to the end of the paid month. Yearly plans run to the end of the paid year." },
];

export default function PricingPage() {
  return (
    <SiteShell>
      <PageHero eyebrow="Pricing" title="Plans that grow with your restaurant" text={`Prices in rupees, no per-order fees, and every plan starts with a ${TRIAL_DAYS}-day free trial. No card needed to begin.`} 
        visual={<HeroStack chips={[{ icon: CalendarCheck, title: `${TRIAL_DAYS}-day free trial`, text: "every plan, every feature" }, { icon: Banknote, title: "Prices in rupees", text: "no per-order fees" }, { icon: BadgeCheck, title: "Cancel any time", text: "no contract, no card to start" }]} />} />
      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <PricingTable />
        <p className="mt-6 text-center text-sm text-slate-500">Prices exclude sales tax where it applies. Customers outside Pakistan are billed in US dollars.</p>
      </Section>
      <Section tone="tint">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div className="min-w-0">
            <SectionHeading align="left" eyebrow="Billing questions" title="How paying for EasAlpha works" />
            <p className="mt-6 text-slate-600">Something specific? <Link href="/contact" className="py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">Ask us</Link>, we reply the same day.</p>
          </div>
          <FaqList items={FAQ} />
        </div>
      </Section>
      <CtaBand title={`Try every feature free for ${TRIAL_DAYS} days`} text="Pick a plan when you are ready. Until then, nothing is charged." secondary={{ href: "/features", label: "See all features" }} />
    </SiteShell>
  );
}
