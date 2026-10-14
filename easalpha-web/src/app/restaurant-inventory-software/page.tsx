import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardList, FileStack, Scale, ShoppingCart, Trash2 } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, CtaBand, FaqList, FeatureRow, HeroChip, PageHero, Section, SectionHeading, SHOTS, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { GUIDE_LINK, GuideSchema, GuideText, RelatedGuides } from "@/components/site/guide-page";
import { guideBySlug } from "@/components/site/guides";
import { PLANS, TRIAL_DAYS, formatMoney } from "@/components/site/site-helpers";

const SLUG = "restaurant-inventory-software";
const guide = guideBySlug(SLUG)!;

export const metadata: Metadata = {
  title: "Restaurant inventory software with recipes",
  description: "Restaurant inventory software where recipes deduct stock as orders complete: food cost per dish, actual vs theoretical, COGS, waste and purchase orders.",
  alternates: { canonical: `/${SLUG}`, languages: { en: `/${SLUG}`, "x-default": `/${SLUG}` } },
};

const pro = formatMoney(PLANS[1].pricePkrMinor, "PKR");

const FAQ = [
  { q: "Do I have to count every ingredient before I can sell?", a: "No. The till sells from day one with no stock at all. Add items and recipes when you are ready, one category at a time, and deduction starts for the products that have a recipe. A stock count document sets the opening figures whenever you take one." },
  { q: "How does deduction cope with a power cut or a till that was offline?", a: "Deduction happens on the server when a synced order completes, once per order, so a till that sold offline for three hours deducts correctly when its queue arrives. A safety-net job catches any order that was missed, and the Deduction Health screen lists deducted, pending and retried orders with a Retry button." },
  { q: "Can I see the real food cost of a dish?", a: "Yes. A recipe lists ingredients and quantities, purchase prices come from goods received, and the food cost screen puts the two together per dish with overheads if you set them. Actual against theoretical then shows where the kitchen used more than the recipes say." },
  { q: "Does it tell me what to order?", a: "Demand buckets group items by how soon they run out at the current rate of use, and a purchase order can be raised from the list for each supplier. Goods received, returns and the supplier ledger follow from the order." },
  { q: "Which plan includes inventory?", a: `Pro (${pro} a month) and Business. Starter has the till, receipts, customers, khata, expenses and reports but not recipes or stock.` },
];

const PARTS = [
  { icon: BookOpen, tile: TILE_ORANGE, title: "Recipes link dishes to ingredients", text: "A product's recipe lists what goes into it: 180 g of chicken, 40 g of onion, one naan. Sizes and modifiers can carry their own quantities. Items have units with conversions, so a 20 kg sack buys in kilograms and deducts in grams." },
  { icon: Scale, tile: TILE_NAVY, title: "Deduction on completion, once", text: "When an order completes, the server deducts each ingredient exactly once. A re-sent order, a reopened order or a till that was offline cannot deduct twice. Deduction Health shows deducted, pending and retried orders so a missed one is visible, not discovered at the count." },
  { icon: FileStack, tile: TILE_ORANGE, title: "Nine document types, five statuses", text: "Purchase, goods received, return, waste, adjustment, transfer, production, count and reset. Every movement of stock is a document with a status, a reason and a user, which is what makes the stock ledger believable." },
  { icon: ShoppingCart, tile: TILE_NAVY, title: "Purchasing with a supplier ledger", text: "Purchase orders go to the supplier, goods received update stock and the purchase price, returns and payments post to a debit-and-credit ledger per supplier. Price history flags a jump, and payables aging shows who is owed what and for how long." },
  { icon: Trash2, tile: TILE_ORANGE, title: "Waste, consumption and actual vs theoretical", text: "Waste and adjustments are documents too, with reasons. The consumption report shows what each item used over a period, and actual against theoretical compares it with what the recipes say should have been used, which is where portion sizes and pilferage show up." },
  { icon: ClipboardList, tile: TILE_NAVY, title: "Demand buckets and the daily stock sheet", text: "Demand buckets sort items by how soon they run out at the current rate, so the morning order is a list, not a walk through the store. The daily stock sheet gives the counter a one-page opening, used and closing view per item." },
];

export default function RestaurantInventorySoftwarePage() {
  return (
    <SiteShell>
      <GuideSchema guide={guide} faq={FAQ} />
      <PageHero crumb={guide.nav} eyebrow="Restaurant inventory software" title="Restaurant inventory software that deducts from the recipe, not the receipt"
        text="Every dish has a recipe. When an order completes, its ingredients come off stock once, on the server, even if the till was offline. Food cost per dish, actual against theoretical, COGS, waste and purchase orders follow from that one rule."
        visual={<div className="relative min-w-0 lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.stock} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={Scale} title="Deducted once" text="never twice, never missed" className="absolute -left-4 -bottom-6 hidden sm:flex" /></div>} />

      <Section className="pt-16 sm:pt-20 lg:pt-24">
        <SectionHeading align="left" eyebrow="The problem" title="Why most restaurant stock figures are fiction by Thursday" />
        <GuideText className="mx-0 mt-8">
          <p>Most restaurant inventory software asks the owner to deduct stock by hand, or deducts whole products rather than ingredients, or deducts at the moment of sale and then again when a cashier reopens the order. By Thursday the figure on the screen and the figure in the store disagree, nobody trusts either, and the monthly count becomes the only number that means anything. Food cost is worked out once a quarter on a spreadsheet, if at all.</p>
          <p>EasAlpha starts from recipes. A dish is a list of ingredients and quantities; selling it deducts those quantities on the server when the order completes, once, with a safety net for anything that slips. Everything else on this page is a consequence of getting that one step right: food cost per dish, actual against theoretical use, cost of goods sold, waste with reasons, demand buckets that say what to order, and a supplier ledger that shows what is owed. Inventory comes with the Pro plan; the <Link href="/features#inventory" className={GUIDE_LINK}>features page</Link> has the screen-by-screen list and the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link> the plan detail.</p>
        </GuideText>
      </Section>

      <Section tone="tint">
        <SectionHeading eyebrow="How it works" title="Six parts of the inventory" text="Recipes, deduction, documents, purchasing, waste and demand. Each has its own screen in the admin panel." />
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
          <FeatureRow eyebrow="Deduction Health" title="The screen that makes the stock figure trustworthy" text="Deduction Health lists every completed order with its deduction state: deducted, pending or retried. If a server hiccup or an odd recipe stops a deduction, the order sits in pending with a Retry button rather than silently leaving the stock too high. It is the first screen a manager opens when a count looks wrong."
            bullets={["Deducted, pending and retried orders in one list with Retry", "A safety-net job re-checks completed orders on a schedule", "Stock ledger shows every movement by document, user and reason"]}
            shot={SHOTS.deduction} caption="Deduction Health" href="/offline-pos-system" hrefLabel="Deduction after an outage" />
          <FeatureRow flip eyebrow="Valuation and COGS" title="Stock in hand, valued, with cost of goods sold" text="Stock in hand shows quantities and values by section at the purchase prices goods received recorded. Valuation and COGS put a figure on what the kitchen used over a period, and the food cost screen shows it per dish against its selling price, with overheads if you enter them. Two recipes losing money show up in the first week, not the first year."
            bullets={["Stock in hand by section with quantities and values", "Valuation and cost of goods sold per period", "Food cost per dish against its price, with overheads"]}
            shot={SHOTS.stock} caption="Stock in hand" href="/features#inventory" hrefLabel="Inventory features" />
        </div>
      </Section>

      <Section tone="tint">
        <SectionHeading align="left" eyebrow="Purchasing" title="From the morning order to the supplier's statement" />
        <GuideText className="mx-0 mt-8">
          <p>The morning starts in demand buckets: items sorted by how soon they run out at the current rate of use. Raise a purchase order per supplier from that list, receive it when the van arrives (goods received updates quantities and the purchase price), send back what is short or spoiled as a return, and record the payment. Each supplier has a debit-and-credit ledger with a running balance, payables aging shows what is overdue, and the purchase price history puts a verdict beside a price that jumped, so a quiet increase on tomatoes is caught at the receipt, not at the month end.</p>
          <p>Production and transfers cover the rest: a batch of sauce made from raw items becomes a stock item of its own, and a transfer moves stock between sections or branches with both sides recorded. Consumables such as boxes and bags deduct per order type, so packaging is costed on takeaway and delivery but not on dine-in. If stock is new to you, <Link href="/contact" className={GUIDE_LINK}>message us</Link> and we will set the first twenty recipes up with you during the {TRIAL_DAYS}-day trial.</p>
        </GuideText>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading align="left" eyebrow="Questions" title="About inventory" text="Counting, outages, food cost, ordering and plans." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="Know the food cost of every dish by next week" text={`Import the menu, add the first recipes and watch the deductions. ${TRIAL_DAYS} days free, no card.`} secondary={{ href: "/features#inventory", label: "See the inventory screens" }} />
      <RelatedGuides slug={SLUG} />
    </SiteShell>
  );
}
