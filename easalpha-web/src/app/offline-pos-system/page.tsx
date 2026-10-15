import type { Metadata } from "next";
import { pageMetadata } from "@/components/site/seo";
import Link from "next/link";
import { AlertTriangle, Bell, CloudOff, Database, ListOrdered, Printer, Wifi } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, CtaBand, FaqList, FeatureRow, HeroChip, PageHero, Section, SectionHeading, SHOTS, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { GUIDE_LINK, GuideSchema, GuideText, RelatedGuides } from "@/components/site/guide-page";
import { guideBySlug } from "@/components/site/guides";
import { TRIAL_DAYS } from "@/components/site/site-helpers";

const SLUG = "offline-pos-system";
const guide = guideBySlug(SLUG)!;

export const metadata: Metadata = pageMetadata({ title: "Offline POS system for restaurants", description: "An offline POS for restaurants: orders, cash and khata payments, receipts and shifts saved on the till with no internet, then synced in order, never twice.", path: `/${SLUG}` });

const FAQ = [
  { q: "What exactly keeps working with no internet?", a: "Taking orders of every type, cash and khata payments with cash rounding, printing receipts and kitchen tickets on local printers, the cash drawer, shift open and close with the Z report for that till, discounts, voids and price overrides with a manager PIN, and today's report for that till. The menu, prices, PINs, permissions, tables and open orders are all on the device." },
  { q: "Can two tills sell offline at the same time?", a: "Yes. Each till numbers its own orders with its till code in front of the serial, such as T1-059, and every record carries a UUID made on the device. When both tills sync, the server accepts each UUID once, so nothing is duplicated and nothing is renumbered." },
  { q: "What if the power cuts in the middle of an order?", a: "Every action is written to the till's local database as it happens, in under a tenth of a second, so the open order is there when the PC comes back. On a bare desktop the order reopens where it was." },
  { q: "Does the kitchen display work during an outage?", a: "The kitchen screen needs the connection to the server today, so stations fall back to printed kitchen tickets from the till's own printer. The order-taker tablet also needs the connection; floor staff take orders at the till until it returns." },
  { q: "How do I know what is still waiting to sync?", a: "The till shows Online, Offline or Syncing in its top bar with the number of records waiting. Anything the server rejects when it arrives goes to a Needs Attention list in the admin panel with the reason, and the owner gets a push notification if a till stays offline for too long." },
];

const OFFLINE = [
  { icon: Database, tile: TILE_ORANGE, title: "Everything the counter needs is on the device", text: "The till keeps the menu, prices, tax rates, staff PINs and permissions, tables, open orders, the current shift and the last seven days of synced orders in its own local database. The catalog is checked against the server on launch, so a price change made in the admin panel reaches the till the next time it opens." },
  { icon: ListOrdered, tile: TILE_NAVY, title: "Save first, sync in order", text: "An order, an item, a payment, a void, a cash movement or a shift event is written locally first, online or not, then queued. The queue goes to the server in the order things happened, in batches, with a UUID per record as the idempotency key. A retried batch can never create a second order." },
  { icon: Printer, tile: TILE_ORANGE, title: "Receipts and kitchen tickets still print", text: "The desktop app prints straight to ESC/POS printers on USB or the network, and it runs a print server that tablets print through. Receipts and kitchen tickets come out whether the line is up or not; the only thing a receipt waits for is a fiscal number, which prints on a reprint once it arrives." },
  { icon: AlertTriangle, tile: TILE_NAVY, title: "Rejected records are a list, not a mystery", text: "When the queue reaches the server, anything it cannot accept lands in Needs Attention with the reason: a product archived while the till was offline, a customer deleted, a stock figure that cannot go negative. The owner clears each one with the facts in front of them." },
  { icon: Bell, tile: TILE_ORANGE, title: "The owner hears about it", text: "A push notification goes to the owner when a till stays offline longer than it should, alongside the day-close, low-stock and cancellation alerts. Nothing silently drifts for a week." },
  { icon: Wifi, tile: TILE_NAVY, title: "What honestly needs the line", text: "Online wallet and card collection, the WhatsApp receipt (queued and sent later), new orders from the website, QR tables and Foodpanda, the kitchen display, live stock figures and the admin panel." },
];

export default function OfflinePosSystemPage() {
  return (
    <SiteShell>
      <GuideSchema guide={guide} faq={FAQ} />
      <PageHero crumb={guide.nav} eyebrow="Offline POS system" title="An offline POS system where the till never stops"
        text="Orders, cash and khata payments, receipts, kitchen tickets and shifts all work with no internet. Everything saves on the device first and syncs in order when the line returns, with no duplicates and a list of anything the server could not accept."
        visual={<div className="relative min-w-0 lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.till} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={CloudOff} title="Offline" text="sells with no internet" className="absolute -left-4 -bottom-6 hidden sm:flex" /></div>} />

      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <SectionHeading align="left" eyebrow="The principle" title="A sale is never blocked by a dead connection" />
        <GuideText className="mx-0 mt-8">
          <p>Cloud POS systems have a failure mode that every restaurant owner in Pakistan knows from experience: the internet drops, the screen spins, and a queue forms at the counter while someone restarts the router. Some systems offer an offline mode that is really a cache, where a few sales can be taken but payments, printing or the shift close wait for the server. The first time load-shedding lands on a Friday night, the difference is obvious.</p>
          <p>EasAlpha is built the other way round. The till is designed to work with no internet as its normal condition, and the connection is something it uses when it has one. A sale is never held up by a stock figure, a slow server or a dead line. Everything a cashier does is saved on the device first and reaches the server when it can, in the order it happened. This page explains what that means in practice, and lists plainly what still needs the line. The till itself is a desktop app for Windows, Linux and Mac on the <Link href="/download" className={GUIDE_LINK}>download page</Link>, and the full feature list is on the <Link href="/features" className={GUIDE_LINK}>features page</Link>.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <SectionHeading eyebrow="How it works" title="What happens on the till when the line drops" text="Six parts, each of which has to be right for an offline POS to be trustworthy." />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {OFFLINE.map((f, i) => (
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

      <Section>
        <div className="space-y-28">
          <FeatureRow eyebrow="Sync" title="Back online: the queue drains, in order, once" text="When the connection returns the till shows Syncing with the count of waiting records and sends them in batches. Each record's UUID means the server accepts it exactly once, so a batch interrupted halfway and sent again cannot double an order or a payment. Fiscal invoices queued during the outage are submitted to FBR or PRA at the same time."
            bullets={["Online, Offline and Syncing shown in the till's top bar with the number waiting", "Idempotency keys per record: a retry can never duplicate a sale", "Fiscal invoices and WhatsApp receipts follow the orders through the queue"]}
            shot={SHOTS.orders} caption="Orders" href="/fbr-pos-integration" hrefLabel="How e-invoicing queues" />
          <FeatureRow flip eyebrow="Stock" title="Stock is never deducted twice, even after an outage" text="Recipe deduction happens on the server when a synced order completes, and a safety-net job catches any order that was missed. The Deduction Health screen shows deducted, pending and retried orders with a Retry button, so a week of patchy internet does not turn into a stock count that is wrong by a sack of flour."
            bullets={["Deduction on completion, once, with a safety net for anything missed", "Deduction Health lists pending and retried orders", "The till shows the last known stock figure rather than guessing"]}
            shot={SHOTS.deduction} caption="Deduction Health" href="/restaurant-inventory-software" hrefLabel="How inventory works" />
        </div>
      </Section>

      <Section tone="tint">
        <SectionHeading align="left" eyebrow="Running it" title="A till for a generator, a UPS or neither" />
        <GuideText className="mx-0 mt-8">
          <p>The desktop app installs on any Windows or Linux PC (and Mac), enables touch for terminal screens, fits a 1024 by 768 display, and has a kiosk mode for a counter that should show nothing else. On a PC without a UPS, an outage reboots the machine and the open order reopens where it was. Printers connect over USB or the network; a kitchen ticket printer is the fallback for the kitchen display while the line is down.</p>
          <p>Offline selling is on every plan, including Starter, because it is not a feature on top of the till; it is how the till is built. Compare the plans on the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link>, or start the {TRIAL_DAYS}-day trial, pull the network cable and watch the first order go through.</p>
        </GuideText>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading align="left" eyebrow="Questions" title="About working offline" text="What works, what waits, and how you know." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="Pull the cable and sell anyway" text={`Install the till, pair it with a code and take the first order with the internet off. ${TRIAL_DAYS} days free, no card.`} secondary={{ href: "/download", label: "Download the till" }} />
      <RelatedGuides slug={SLUG} />
    </SiteShell>
  );
}
