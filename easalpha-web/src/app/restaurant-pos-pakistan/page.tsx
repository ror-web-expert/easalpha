import type { Metadata } from "next";
import { pageMetadata } from "@/components/site/seo";
import Link from "next/link";
import { Banknote, BookOpen, CloudOff, Languages, MessageCircle, ShoppingBag } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, CtaBand, FaqList, FeatureRow, HeroChip, PageHero, Section, SectionHeading, SHOTS, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { GUIDE_LINK, GuideSchema, GuideText, RelatedGuides } from "@/components/site/guide-page";
import { guideBySlug } from "@/components/site/guides";
import { PLANS, TRIAL_DAYS, formatMoney } from "@/components/site/site-helpers";

const SLUG = "restaurant-pos-pakistan";
const guide = guideBySlug(SLUG)!;

export const metadata: Metadata = pageMetadata({ title: "Restaurant POS in Pakistan: FBR, Urdu, khata", description: "Restaurant POS for Pakistan: FBR and PRA e-invoices with a QR receipt, JazzCash and EasyPaisa, Urdu names, khata and a till that sells through load-shedding.", path: `/${SLUG}` });

const price = (i: number) => formatMoney(PLANS[i].pricePkrMinor, "PKR");

const FAQ = [
  { q: "Which tax authorities does EasAlpha file to?", a: "FBR for federal registration, PRA for Punjab, and SRB, KPRA and BRA for Sindh, Khyber Pakhtunkhwa and Balochistan. The authority, NTN and POS ID are set per branch, so a chain with outlets in two provinces files each one correctly. Until the live token is entered, invoices run in a sandbox mode so staff can see how the numbers and QR appear." },
  { q: "Can I take JazzCash and EasyPaisa at the counter?", a: "Yes. JazzCash and EasyPaisa are payment accounts in the same way cash, cards and bank transfer are. The cashier picks the method, the payment lands in that account, and the Grand Report and finance screens show each account separately, so each wallet can be reconciled against the books." },
  { q: "Does the menu work in Urdu?", a: "Categories, products and modifiers take an Urdu name beside the English one, and the menu import from a spreadsheet accepts an Urdu column. Staff can search the till in either language and the ordering site shows the Urdu name. Thermal receipts print the English name today." },
  { q: `What does it cost in rupees?`, a: `Plans are ${price(0)}, ${price(1)} and ${price(2)} a month, with no per-order fees. Pay yearly and two months are free. Every plan starts with a ${TRIAL_DAYS}-day free trial with no card, and you can pay by card, bank transfer, JazzCash or EasyPaisa when the trial ends.` },
  { q: "Does it handle Foodpanda orders and delivery riders?", a: "Foodpanda orders arrive in the same order list as counter, website and QR orders, with the commission accounted for in the reports. Riders pair their own phone with a code, see their assignments and update status, and cash on delivery is confirmed at the till when they return." },
];

const LOCAL = [
  { icon: Languages, title: "Urdu on the menu", tile: TILE_ORANGE, text: "Categories, products and modifiers carry an Urdu name beside the English one. Staff search the till in either language, the ordering site shows the Urdu name, and the spreadsheet import takes an Urdu column." },
  { icon: BookOpen, title: "Khata that closes at month end", tile: TILE_NAVY, text: "Every regular is a ledger account with a khata number, a credit limit or none, aging and a statement. A sale on account sends a WhatsApp message with the new balance, and monthly bills go out to everyone in one run." },
  { icon: CloudOff, title: "Built for load-shedding", tile: TILE_ORANGE, text: "The till keeps the menu, prices, staff PINs and open orders on the device. Orders, cash payments and receipts save locally first and sync in order when the connection returns; anything the server rejects lands in a Needs Attention list." },
  { icon: Banknote, title: "Priced in rupees, paid locally", tile: TILE_NAVY, text: `Plans are ${price(0)}, ${price(1)} and ${price(2)} a month with no per-order fees, paid by card, bank transfer, JazzCash or EasyPaisa. Yearly billing is ten months' price. The ${TRIAL_DAYS}-day trial needs no card.` },
  { icon: MessageCircle, title: "WhatsApp from your own number", tile: TILE_ORANGE, text: "Link the restaurant's WhatsApp by scanning a QR. Receipts, khata statements, OTP codes and campaigns go out from a number customers already know, with opt-in and STOP handled for you." },
  { icon: ShoppingBag, title: "Foodpanda in the same list", tile: TILE_NAVY, text: "Foodpanda orders land beside counter, website and QR orders with their commission recorded, so reports show the real margin per channel." },
];

export default function RestaurantPosPakistanPage() {
  return (
    <SiteShell>
      <GuideSchema guide={guide} faq={FAQ} />
      <PageHero crumb={guide.nav} eyebrow="Restaurant POS in Pakistan" title="A restaurant POS built for how Pakistan trades"
        text={`Tax invoices that reach FBR and PRA, the wallets your customers already carry, Urdu on the menu, khata for regulars and a till that keeps selling when the power goes. Priced in rupees from ${price(0)} a month.`}
        visual={<div className="relative min-w-0 lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.till} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={CloudOff} title="Offline" text="sells through load-shedding" className="absolute -left-4 -bottom-6 hidden sm:flex" /></div>} />

      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <SectionHeading align="left" eyebrow="Why it is different here" title="What a generic till gets wrong in Pakistan" />
        <GuideText className="mx-0 mt-8">
          <p>Most restaurant POS software is written for a card-and-cloud world: every sale assumes a connection, every payment is a card, and tax is a percentage printed at the bottom of the bill. A restaurant in Lahore or Karachi works differently in specific, practical ways, and a till that ignores them makes work for the owner every single day: the FBR or PRA invoice typed into a separate machine, EasyPaisa payments reconciled from a phone screen at closing, the regular who pays at month end tracked in a notebook, and a generator that comes on while the orders wait.</p>
          <p>EasAlpha was built in Lahore around those details. This page covers the six that come up in almost every conversation with an owner: tax e-invoicing, wallet payments, Urdu on the menu, khata, load-shedding and rupee pricing. Each one is in the product today, not on a roadmap. The complete list by area is on the <Link href="/features" className={GUIDE_LINK}>features page</Link> and the plans are on the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link>.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <div className="space-y-28">
          <FeatureRow eyebrow="Tax" title="FBR and PRA invoices from the receipt itself" text="Register the branch once with its authority, NTN and POS ID. From then on every paid order is submitted as a fiscal invoice and the number and QR code print on the customer's receipt. A Punjab restaurant files to PRA, a federal registration files to FBR, and Sindh, KP and Balochistan have their own adapters."
            bullets={["The fiscal invoice number and QR code print on the receipt, no separate FBR machine", "Orders paid during an outage are queued and submitted when the internet returns, with up to 50 retries", "A Tax Invoices screen shows queued, sent, accepted and failed, so a rejected invoice is a task, not a surprise"]}
            shot={SHOTS.finance} caption="Finance" href="/fbr-pos-integration" hrefLabel="How the e-invoicing works" />
          <FeatureRow flip eyebrow="Payments" title="JazzCash, EasyPaisa, bank and cash, each with its own account" text="Every payment method is a payment account with its own balance. One bill can be split between cash and a wallet, a card machine's fee can be set per account as a percentage or a fixed amount, and every payment posts to double-entry books on its own, so the books are right without re-entry."
            bullets={["Payment accounts for cash, cards, bank transfer, JazzCash and EasyPaisa", "Split payments and part payments on a single order", "The Grand Report ties sales, discounts, tax and payments together to the rupee"]}
            shot={SHOTS.balance} caption="Balance sheet" href="/features#money" hrefLabel="Money and accounts" />
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="The local list" title="Four more things that decide a purchase in Pakistan" text="Language, credit, power and price, each with its own screen." />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LOCAL.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 3) * 70} className={`flex gap-4 p-6 ${CARD}`}>
              <span className={f.tile}><f.icon className="h-6 w-6" /></span>
              <div>
                <h3 className="font-bold text-[#0B1F3A]">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section tone="tint">
        <SectionHeading align="left" eyebrow="Getting started" title="Set up in an afternoon, in Lahore or anywhere in Pakistan" />
        <GuideText className="mx-0 mt-8">
          <p>Create the account, import the menu from a spreadsheet with an Urdu column if you have one, and pair the counter PC as a till with a 24-hour code. Thermal printers on 58 or 80 mm paper work over USB or the network, and tablets print through the counter PC&apos;s print server. Enter the branch&apos;s tax registration and add the payment accounts you take, and the first order can go through before the evening rush. Recipes, stock and payroll can be switched on later without stopping sales.</p>
          <p>A few details are there because Pakistani restaurants asked for them. The business day can start and end at the hours you keep, so a 3 am close still counts as Friday&apos;s sales. Payroll records hold CNIC, department and designation, with daily wages or monthly salary and advances recovered on the run. Support answers in English and Urdu from 10 am to 11 pm, every day, from the office in Gulberg 3, Lahore.</p>
          <p>If you run one counter today, the Starter plan at {price(0)} a month covers offline selling, receipts, customers, khata, expenses and the reports. Kitchen screens, stock, riders and tax invoices come with Pro, and Business adds branches, payroll, loyalty and WhatsApp from your own number. Compare them on the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link>, or <Link href="/contact" className={GUIDE_LINK}>message us on WhatsApp</Link> with your menu and we will set up a demo on it.</p>
        </GuideText>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading align="left" eyebrow="Questions" title="Asked by restaurants in Pakistan" text="Specific to tax, wallets, language and price. The general questions are on the home page." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="Sell in rupees, file to FBR, run through the outage" text={`Create your restaurant, import the menu and sell this evening. ${TRIAL_DAYS} days free, no card, cancel any time.`} secondary={{ href: "/features", label: "See every feature" }} />
      <RelatedGuides slug={SLUG} />
    </SiteShell>
  );
}
