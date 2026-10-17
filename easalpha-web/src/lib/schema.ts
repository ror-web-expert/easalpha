// JSON-LD for the public site, built as typed objects from the same data the pages render (plans, contact, FAQ),
// so the structured data cannot drift from the visible content. Rendered through <JsonLd> (components/site/json-ld.tsx).
import { CONTACT, OFFICE, OG_IMAGE_PATH, PLANS, SITE_DESCRIPTION, TRIAL_DAYS, formatMoney, monthlyMinor, type Currency, type Plan, type SiteContact } from "@/components/site/site-helpers";
import { SITE_URL } from "@/app/sitemap";

const CONTEXT = "https://schema.org" as const;

interface Node { "@context": typeof CONTEXT; "@type": string }
export interface PostalAddress { "@type": "PostalAddress"; streetAddress: string; addressLocality: string; addressRegion: string; addressCountry: string }
export interface ContactPoint { "@type": "ContactPoint"; contactType: string; telephone: string; email: string; availableLanguage: string[] }
export interface Organization extends Node { "@type": "Organization"; "@id": string; name: string; url: string; logo: string; email: string; telephone: string; address: PostalAddress; contactPoint: ContactPoint[] }
export interface WebSite extends Node { "@type": "WebSite"; "@id": string; name: string; url: string; inLanguage: string; publisher: { "@id": string } }
export interface Offer { "@type": "Offer"; name: string; price: string; priceCurrency: Currency; url: string; availability: "https://schema.org/InStock"; description: string }
export interface SoftwareApplication extends Node { "@type": "SoftwareApplication"; name: string; url: string; description: string; applicationCategory: "BusinessApplication"; operatingSystem: string; image: string; featureList: string[]; offers: Offer[]; publisher: { "@id": string } }
export interface Question { "@type": "Question"; name: string; acceptedAnswer: { "@type": "Answer"; text: string } }
export interface FaqPage extends Node { "@type": "FAQPage"; mainEntity: Question[] }
export interface Product extends Node { "@type": "Product"; name: string; description: string; image: string; brand: { "@type": "Brand"; name: string }; offers: Offer[] }
export interface ListItem { "@type": "ListItem"; position: number; name: string; item: string }
export interface BreadcrumbList extends Node { "@type": "BreadcrumbList"; itemListElement: ListItem[] }
export interface ItemList extends Node { "@type": "ItemList"; name: string; itemListElement: ListItem[] }
export interface OpeningHours { "@type": "OpeningHoursSpecification"; dayOfWeek: string[]; opens: string; closes: string }
export interface LocalBusiness extends Node { "@type": "LocalBusiness"; "@id": string; name: string; url: string; image: string; telephone: string; email: string; address: PostalAddress; openingHoursSpecification: OpeningHours[]; priceRange: string; parentOrganization: { "@id": string } }
export type JsonLdNode = Organization | WebSite | SoftwareApplication | FaqPage | Product | BreadcrumbList | ItemList | LocalBusiness;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

/** Block 1: the company. Address and support contacts come from site-helpers (the same values the footer shows). */
export function organization(contact: SiteContact = CONTACT): Organization {
  return {
    "@context": CONTEXT, "@type": "Organization", "@id": ORG_ID,
    name: contact.productName, url: SITE_URL, logo: `${SITE_URL}/icon-512.png`,
    email: contact.email, telephone: contact.whatsapp,
    address: { "@type": "PostalAddress", streetAddress: OFFICE.street, addressLocality: OFFICE.city, addressRegion: OFFICE.region, addressCountry: OFFICE.countryCode },
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", telephone: contact.whatsapp, email: contact.email, availableLanguage: ["English", "Urdu"] }],
  };
}

/** Block 2: the site. */
export function webSite(): WebSite {
  return { "@context": CONTEXT, "@type": "WebSite", "@id": SITE_ID, name: "EasAlpha", url: SITE_URL, inLanguage: "en", publisher: { "@id": ORG_ID } };
}

/** One plan in one currency, priced from PLANS so the schema always matches the pricing table. */
export function offer(plan: Plan, currency: Currency): Offer {
  return {
    "@type": "Offer", name: `${plan.name} plan`, price: String(monthlyMinor(plan, currency) / 100), priceCurrency: currency,
    url: `${SITE_URL}/signup?plan=${plan.code}`, availability: "https://schema.org/InStock",
    description: `${plan.tagline} Per month, billed monthly; yearly billing is ten months' price. ${TRIAL_DAYS}-day free trial.`,
  };
}

function allOffers(): Offer[] {
  return PLANS.flatMap((p) => [offer(p, "PKR"), offer(p, "USD")]);
}

export const FEATURE_LIST = [
  "Offline till that keeps selling without internet", "Order-taker tablet", "Kitchen display with stations and timers",
  "Inventory with recipe deduction", "Purchasing and supplier ledgers", "Double-entry accounts", "Attendance and payroll",
  "Riders and delivery board", "Customer khata, loyalty and vouchers", "WhatsApp receipts and statements",
  "FBR and PRA tax invoices", "27 reports with CSV and PDF export",
];

/** Block 3: the product as software, with the three plans as offers in PKR and USD. */
export function softwareApplication(): SoftwareApplication {
  return {
    "@context": CONTEXT, "@type": "SoftwareApplication", name: "EasAlpha", url: SITE_URL, description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication", operatingSystem: "Windows, Linux, macOS, Android, iOS, Web",
    image: `${SITE_URL}${OG_IMAGE_PATH}`, featureList: FEATURE_LIST, offers: allOffers(), publisher: { "@id": ORG_ID },
  };
}

/** Block 4: an FAQ. Pass the same array the accordion renders. */
export function faqPage(items: { q: string; a: string }[]): FaqPage {
  return { "@context": CONTEXT, "@type": "FAQPage", mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })) };
}

/** Block 5: the pricing page's product with offers. */
export function pricingProduct(): Product {
  return { "@context": CONTEXT, "@type": "Product", name: "EasAlpha restaurant POS", description: SITE_DESCRIPTION, image: `${SITE_URL}${OG_IMAGE_PATH}`, brand: { "@type": "Brand", name: "EasAlpha" }, offers: allOffers() };
}

/** The Lahore office as a local business for the contact page: address, phone, email and the support hours. */
export function localBusiness(contact: SiteContact = CONTACT): LocalBusiness {
  return {
    "@context": CONTEXT, "@type": "LocalBusiness", "@id": `${SITE_URL}/contact#office`, name: `${contact.productName} (Lahore office)`, url: `${SITE_URL}/contact`,
    image: `${SITE_URL}${OG_IMAGE_PATH}`, telephone: contact.whatsapp, email: contact.email,
    address: { "@type": "PostalAddress", streetAddress: OFFICE.street, addressLocality: OFFICE.city, addressRegion: OFFICE.region, addressCountry: OFFICE.countryCode },
    openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "00:00", closes: "23:59" }],
    priceRange: `${formatMoney(PLANS[0].pricePkrMinor, "PKR")} to ${formatMoney(PLANS[PLANS.length - 1].pricePkrMinor, "PKR")} a month`,
    parentOrganization: { "@id": ORG_ID },
  };
}

/** Block 6: Home, then the current page. */
export function breadcrumbs(name: string, path: string): BreadcrumbList {
  return {
    "@context": CONTEXT, "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

/** Block 7: a list of pages, such as the app screens on /apps. */
export function itemList(name: string, items: { name: string; url: string }[]): ItemList {
  return { "@context": CONTEXT, "@type": "ItemList", name, itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url.startsWith("http") ? it.url : `${SITE_URL}${it.url}` })) };
}

/** JSON for a script tag: "<" is escaped so content can never close the tag early. */
export function serializeJsonLd(data: JsonLdNode | JsonLdNode[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
