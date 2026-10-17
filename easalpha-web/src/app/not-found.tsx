import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Home, Search } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { CARD, Container, HeroStack, PageHero, PrimaryLink, SecondaryLink } from "@/components/site/sections";
import { GUIDES } from "@/components/site/guides";

export const metadata: Metadata = { title: "Page not found", description: "That address is not on easalpha.com. The home page, features, pricing and the guides are one tap away.", robots: { index: false, follow: true } };

const PLACES = [
  { href: "/features", title: "Features", text: "Every area of EasAlpha, screen by screen." },
  { href: "/pricing", title: "Pricing", text: "Three plans in rupees or dollars, 40 days free." },
  { href: "/download", title: "Download", text: "The desktop till for Windows, Linux and Mac." },
  { href: "/contact", title: "Contact", text: "WhatsApp or email; a person answers." },
];

/** The branded 404 for every address that is not a page: same header, footer and tone as the rest of the site. */
export default function NotFound() {
  return (
    <SiteShell>
      <PageHero crumb="Not found" eyebrow="404" title="That page is not here" text="The address may have a typo, or the page moved when the site was reorganised. Nothing on your account is affected."
        visual={<HeroStack chips={[{ icon: Search, title: "Not found", text: "no page at this address" }, { icon: Home, title: "Home", text: "start again from the top" }, { icon: Compass, title: "Guides", text: "five pages on what matters" }]} />}>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryLink href="/" size="lg">Go to the home page</PrimaryLink>
          <SecondaryLink href="/contact" size="lg" dark>Tell us what you were looking for</SecondaryLink>
        </div>
      </PageHero>
      <Container className="py-16 lg:py-24">
        <ul className="grid gap-5 sm:grid-cols-2">
          {[...PLACES, ...GUIDES.slice(0, 2).map((g) => ({ href: `/${g.slug}`, title: g.title, text: g.short }))].map((pl) => (
            <li key={pl.href} className={`flex ${CARD}`}>
              <Link href={pl.href} className="flex flex-1 flex-col p-6">
                <span className="text-lg font-bold text-[#0B1F3A]">{pl.title}</span>
                <span className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{pl.text}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A]">Open<ArrowRight className="h-4 w-4 text-[#FF7A1A]" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </SiteShell>
  );
}
