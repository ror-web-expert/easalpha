/** The long-form landing pages under /<slug>: listed in the footer, linked from the homepage, in the sitemap, and
 *  cross-linked from each other. Each page's own copy lives in src/app/<slug>/page.tsx. */
export interface Guide { slug: string; title: string; short: string; nav: string }

export const GUIDES: Guide[] = [
  { slug: "restaurant-pos-pakistan", nav: "Restaurant POS in Pakistan", title: "Restaurant POS for Pakistan", short: "FBR and PRA invoices, JazzCash and EasyPaisa, Urdu receipts, khata and a till that runs through load-shedding." },
  { slug: "fbr-pos-integration", nav: "FBR and PRA e-invoicing", title: "FBR POS integration", short: "Fiscal invoice numbers and QR codes on every receipt, queued when the internet is down, for FBR, PRA, SRB, KPRA and BRA." },
  { slug: "offline-pos-system", nav: "Offline POS system", title: "Offline POS system", short: "What the till does with no internet, how the queue syncs in order, and what Needs Attention catches." },
  { slug: "arfapos-alternative", nav: "ArfaPOS alternative", title: "An ArfaPOS alternative", short: "A fair, feature-by-feature comparison with the prices both products publish today." },
  { slug: "kitchen-display-system", nav: "Kitchen display system", title: "Kitchen display system", short: "Tickets per station with timers, bump and alerts, plus the token screen guests watch." },
  { slug: "restaurant-inventory-software", nav: "Restaurant inventory software", title: "Restaurant inventory software", short: "Recipes that deduct stock on completion, actual vs theoretical, COGS and demand buckets that say what to order." },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** The guides that follow this one in the list, wrapping round, for a Related section at the foot of a page.
 *  Rotating rather than always taking the first three means every guide is linked from three others. */
export function otherGuides(slug: string, limit = 3): Guide[] {
  const i = GUIDES.findIndex((g) => g.slug === slug);
  const rest = i < 0 ? GUIDES : [...GUIDES.slice(i + 1), ...GUIDES.slice(0, i)];
  return rest.filter((g) => g.slug !== slug).slice(0, limit);
}
