import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { CARD, Container, CtaBand, HeroStack, PageHero } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { GUIDES } from "@/components/site/guides";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbs, itemList } from "@/lib/schema";
import { pageMetadata } from "@/components/site/seo";
import { GUIDE_LINK, GuideText } from "@/components/site/guide-page";
import { TRIAL_DAYS } from "@/components/site/site-helpers";
import { CloudOff, Receipt, Scale } from "lucide-react";

export const metadata: Metadata = pageMetadata({ title: "Guides for restaurant owners", description: "Six plain-language guides on what decides a restaurant POS purchase in Pakistan: FBR and PRA e-invoicing, power cuts, the kitchen screen, stock, local payments and how EasAlpha compares.", path: "/guides" });

export default function GuidesPage() {
  return (
    <SiteShell>
      <JsonLd data={[breadcrumbs("Guides", "/guides"), itemList("EasAlpha guides", GUIDES.map((g) => ({ name: g.title, url: `/${g.slug}` })))]} />
      <PageHero crumb="Guides" eyebrow="Guides" title="What to check before you buy a restaurant POS" text="Six short, specific guides written from the product as it is today, not from a roadmap. Each one answers the questions owners ask us most, with a FAQ at the end."
        visual={<HeroStack chips={[{ icon: Receipt, title: "Tax filing", text: "FBR, PRA and the receipt" }, { icon: CloudOff, title: "Power cuts", text: "what still works offline" }, { icon: Scale, title: "Comparison", text: "EasAlpha and ArfaPOS side by side" }]} />} />
      <Container className="py-16 lg:py-24">
        <GuideText className="mx-0">
          <p>A point of sale is bought once and lived with for years, so the questions worth asking are practical ones: will the receipt carry the authority&apos;s invoice number, what happens to a sale when the internet drops, does the kitchen see a changed order, will the stock figure be true by Thursday, and what does the whole thing cost in rupees. These guides answer each of those from the product itself. The short version of every feature is on the <Link href="/features" className={GUIDE_LINK}>features page</Link> and the plans are on the <Link href="/pricing" className={GUIDE_LINK}>pricing page</Link>; the guides go one level deeper.</p>
        </GuideText>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g, i) => (
            <Reveal as="li" key={g.slug} delay={(i % 3) * 70} className={`flex ${CARD}`}>
              <Link href={`/${g.slug}`} className="flex flex-1 flex-col p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#FFF1E8] text-[#E0640C]"><BookOpen className="h-5 w-5" /></span>
                <span className="mt-4 text-lg font-bold text-[#0B1F3A]">{g.title}</span>
                <span className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{g.short}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A]">Read the guide<ArrowRight className="h-4 w-4 text-[#FF7A1A]" /></span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </Container>
      <CtaBand title="See it on your own menu" text={`Create your restaurant, import the menu and try every screen free for ${TRIAL_DAYS} days.`} secondary={{ href: "/contact", label: "Book a demo" }} />
    </SiteShell>
  );
}
