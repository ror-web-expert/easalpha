import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CARD, Section, SectionHeading } from "./sections";
import { Reveal } from "./reveal";
import { otherGuides, type Guide } from "./guides";
import { JsonLd } from "./json-ld";
import { breadcrumbs, faqPage } from "@/lib/schema";

/** Inline link inside guide copy: navy, orange underline, padded for a 44px tap height without moving the line. */
export const GUIDE_LINK = "py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]";

/** Breadcrumb and the page's own FAQ as JSON-LD. */
export function GuideSchema({ guide, faq }: { guide: Guide; faq: { q: string; a: string }[] }) {
  return <JsonLd data={[breadcrumbs(guide.title, `/${guide.slug}`), faqPage(faq)]} />;
}

/** The reading column: paragraphs, lists and sub-headings in the site's body type. */
export function GuideText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-auto max-w-3xl space-y-5 text-[17px] leading-[1.7] text-slate-700 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-[#0B1F3A] [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-[#FF7A1A] [&_strong]:text-[#0B1F3A] [&_ul]:space-y-2 ${className ?? ""}`}>
      {children}
    </div>
  );
}

/** Three of the other guides, at the foot of a guide. */
export function RelatedGuides({ slug }: { slug: string }) {
  const items = otherGuides(slug);
  return (
    <Section tone="tint" data-boilerplate="">
      <SectionHeading eyebrow="Related" title="Keep reading" />
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map((g, i) => (
          <Reveal as="li" key={g.slug} delay={i * 70} className={`flex ${CARD}`}>
            <Link href={`/${g.slug}`} className="flex flex-1 flex-col p-6">
              <span className="text-lg font-bold text-[#0B1F3A]">{g.title}</span>
              <span className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{g.short}</span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A]">Read the guide<ArrowRight className="h-4 w-4 text-[#FF7A1A]" /></span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
