import type { Metadata } from "next";
import { pageMetadata } from "@/components/site/seo";
import Link from "next/link";
import { Bell, ChefHat, Megaphone, Tablet, Timer, Wifi } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, CtaBand, FaqList, FeatureRow, HeroChip, PageHero, Section, SectionHeading, SHOTS, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { GUIDE_LINK, GuideSchema, GuideText, RelatedGuides } from "@/components/site/guide-page";
import { guideBySlug } from "@/components/site/guides";
import { PLANS, TRIAL_DAYS, formatMoney } from "@/components/site/site-helpers";

const SLUG = "kitchen-display-system";
const guide = guideBySlug(SLUG)!;

export const metadata: Metadata = pageMetadata({ title: "Kitchen display system for restaurants", description: "Kitchen display system on any tablet: tickets per station, timers that turn amber then red, bump to clear, alerts for changed orders and a token screen.", path: `/${SLUG}` });

const pro = formatMoney(PLANS[1].pricePkrMinor, "PKR");

const FAQ = [
  { q: "What hardware does the kitchen display need?", a: "Any Android tablet, or a PC or TV browser. The screen is a web app added to the home screen, paired to the branch with a 24-hour code from the admin panel; nothing is installed and nothing is licensed per device. A kitchen ticket printer on a station is the fallback for the days the connection is down." },
  { q: "Can the grill, the tandoor and the drinks counter each have their own screen?", a: "Yes. Stations are set per branch, each with its own display device or printer, and every product belongs to a station. One order with a karahi, two naans and a lassi becomes three tickets on three screens; All stations shows the whole order on one." },
  { q: "What happens when the kitchen screen loses the internet?", a: "The screen needs the connection to receive tickets today, so stations fall back to printed kitchen tickets from the till's own printer, which works with no internet. The till keeps selling throughout; see the offline guide for exactly what works where." },
  { q: "Do tablet orders go straight to the kitchen?", a: "Yes. A floor server takes a dine-in or takeaway order on the order-taker tablet and the ticket appears on the station screens the moment it is placed, with the table number and any kitchen note. Website, QR table and Foodpanda orders arrive the same way." },
  { q: "Which plan includes the kitchen display?", a: `Pro (${pro} a month) and Business. Kitchen displays, token screens, order-taker tablets and rider phones do not count as tills, so adding screens does not move you up a plan.` },
];

const PARTS = [
  { icon: ChefHat, tile: TILE_ORANGE, title: "Stations, not one long list", text: "Every product belongs to a station, and every station has a screen or a printer. An order splits into one ticket per station the moment it is placed, so the grill sees the grill and the drinks counter sees the drinks, with the table or token number on each." },
  { icon: Timer, tile: TILE_NAVY, title: "Timers with two thresholds", text: "Each ticket shows how long it has been waiting. Set a target time for the store and the timer turns amber at half of it and red when it passes, so a glance across the pass shows which ticket is in trouble before a server has to ask." },
  { icon: Bell, tile: TILE_ORANGE, title: "Alerts for changed and cancelled orders", text: "When a cashier edits an order that is already in the kitchen, or cancels it, the ticket flags the change instead of quietly becoming a different ticket. The old line is still visible, so a plate already on the grill is not wasted twice." },
  { icon: Megaphone, tile: TILE_NAVY, title: "Bump, and the token screen follows", text: "Bump clears the ticket from the station. When every station has bumped an order it is ready, and the token screen in the dining room moves its number to Ready. Guests watch the screen instead of the counter." },
  { icon: Tablet, tile: TILE_ORANGE, title: "Fed by the tablet, the till, the website and Foodpanda", text: "Dine-in orders from the order-taker tablet, counter orders from the till, QR table orders and Foodpanda orders all reach the same stations the same way. The kitchen does not need to know where an order came from, only what to cook." },
  { icon: Wifi, tile: TILE_NAVY, title: "Live over a persistent connection", text: "Tickets arrive over a connection that stays open, not a refresh every few seconds, so a new order appears within a second of being placed. The screen blocks pull-to-refresh, pinch zoom and text selection, because wet hands on a tablet should only ever bump." },
];

export default function KitchenDisplaySystemPage() {
  return (
    <SiteShell>
      <GuideSchema guide={guide} faq={FAQ} />
      <PageHero crumb={guide.nav} eyebrow="Kitchen display system" title="A kitchen display system the pass can read from across the room"
        text="Tickets land on the right station the moment an order is placed. Timers turn amber then red, changed orders are flagged, bump clears the ticket, and a token screen tells guests when their number is ready. Any tablet, paired with a code."
        visual={<div className="relative min-w-0 lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.kitchen} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={Timer} title="Amber, then red" text="a late ticket shows itself" className="absolute -left-4 -bottom-6 hidden sm:flex" /></div>} />

      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <SectionHeading align="left" eyebrow="Why a screen" title="What a kitchen display fixes that a printer cannot" />
        <GuideText className="mx-0 mt-8">
          <p>A kitchen ticket printer tells the kitchen what was ordered. It does not tell anyone how long ago, whether the order changed after the ticket printed, which station still has a line open, or whether the guest at table nine has been waiting longer than the guest at table four. On a quiet Tuesday none of that matters. At 9 pm on a Friday it is the difference between a kitchen that runs itself and a manager shouting across the pass.</p>
          <p>A kitchen display system (KDS) replaces the paper with a screen per station. Each ticket shows its age, changes are flagged, and clearing a ticket is one tap. EasAlpha&apos;s kitchen display runs on any Android tablet or a browser, is paired to the branch with a code, and comes with the Pro plan alongside the inventory and tax features; the <Link href="/features#kitchen" className={GUIDE_LINK}>features page</Link> lists it with the rest, and the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link> has the plan detail.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <SectionHeading eyebrow="How it works" title="Six parts of the kitchen display" text="Stations, timers, alerts, bump, the sources that feed it and the connection underneath." />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PARTS.map((f, i) => (
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
          <FeatureRow eyebrow="Token screen" title="The queue watches a screen, not the counter" text="A second display in the dining room lists order numbers under Preparing and Ready. When the last station bumps an order its number moves across, so takeaway guests stop crowding the counter and the cashier stops answering the same question. It runs on any TV with a browser."
            bullets={["Numbers move from Preparing to Ready when the kitchen bumps the last ticket", "Any TV or tablet with a browser, paired like a kitchen screen", "Counts as a screen, not a till, on every plan"]}
            shot={SHOTS.orders} caption="Orders" href="/features#kitchen" hrefLabel="Kitchen features" />
          <FeatureRow flip eyebrow="Order-taker tablet" title="From the table to the station without a trip to the till" text="Floor staff take dine-in and takeaway orders on a tablet with the same menu, modifiers and kitchen notes as the till. The ticket reaches the stations the moment it is placed and the order waits on the table for the bill. The tablet prints through the counter PC, so a receipt is one tap away."
            bullets={["Same menu, modifiers, deals and kitchen notes as the till", "Tickets reach the stations as the order is placed, with the table number", "Reviews can be collected on the tablet after the meal"]}
            shot={SHOTS.till} caption="Till" href="/features#sell" hrefLabel="Selling features" />
        </div>
      </Section>

      <Section tone="tint">
        <SectionHeading align="left" eyebrow="Setting it up" title="A screen per station in an afternoon" />
        <GuideText className="mx-0 mt-8">
          <p>In the admin panel, create the stations for the branch and give each one a display or a printer. Assign products to stations, which is usually one pass through the category list. Pair a tablet to each station with the 24-hour code, add the web app to its home screen, and set the store&apos;s target time so the timers know when amber and red begin. The till, the order-taker tablet and the website need no change; their orders start arriving on the screens with the next sale.</p>
          <p>Reports close the loop. The operations and cancelled-and-modified reports show which tickets ran late and which orders changed after they reached the kitchen, by station and by hour, so a slow Friday grill is a number rather than an argument. If the kitchen screen&apos;s connection drops, the station&apos;s ticket printer takes over while the <Link href="/offline-pos-system" className={GUIDE_LINK}>till keeps selling offline</Link>.</p>
        </GuideText>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading align="left" eyebrow="Questions" title="About the kitchen display" text="Hardware, stations, outages, tablets and plans." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="Put a screen on the pass this week" text={`Pair a tablet with a code and watch the first ticket arrive. ${TRIAL_DAYS} days free, no card.`} secondary={{ href: "/pricing", label: "See the Pro plan" }} />
      <RelatedGuides slug={SLUG} />
    </SiteShell>
  );
}
