import type { StorefrontProduct } from "@/lib/types";

// Pure helpers for the branded storefront page (storefront.tsx and storefront-sections.tsx). No React; unit-tested in
// storefront-helpers.test.ts. Website Config sections arrive as loose key/value hashes, so every reader here tolerates
// missing keys, blank strings and the odd wrong type.

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** "#abc", "abc" or "#AABBCC" as lowercase "#aabbcc"; null for anything that is not a hex colour. */
export function normalizeHex(v: unknown): string | null {
  const s = str(v).replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${s.split("").map((c) => c + c).join("").toLowerCase()}`;
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : null;
}

/** Mixes a #rrggbb colour toward black (amount < 0) or white (amount > 0) by |amount| (0 to 1). Anything else comes back as given. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const t = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (t - c) * p).toString(16).padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** The colour to use for theme-coloured text on white: the theme itself when it is dark enough to read, otherwise near-black. */
export function themeInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return "#191c23";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // 4.5:1 against white (WCAG AA body text) needs a relative luminance of 0.183 or less.
  return lum <= 0.183 ? `#${m[1].toLowerCase()}` : "#191c23";
}

/** The lowest price a guest can pay: the product's own price, or its cheapest variant. */
export function fromPrice(p: Pick<StorefrontProduct, "price_minor" | "variants">): number {
  return p.variants.length ? Math.min(...p.variants.map((v) => v.price_minor)) : p.price_minor;
}

/** Menu search: every word must appear in the name, description or a variant name (any case). Blank matches everything. */
export function matchesMenu(p: Pick<StorefrontProduct, "name" | "description" | "variants">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [p.name, p.description ?? "", ...p.variants.map((v) => v.name)].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** One bar per star rating, 5 down to 1, with its share of all ratings (0 to 100, rounded). */
export function ratingBars(byRating: Record<string, number> | null | undefined, rated: number): { stars: number; count: number; pct: number }[] {
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = Math.max(0, num(byRating?.[String(stars)]) ?? 0);
    return { stars, count, pct: rated > 0 ? Math.round((count / rated) * 100) : 0 };
  });
}

interface LocationSettings { map_link?: unknown; lat?: unknown; lng?: unknown }

/** Where "Open in Maps" goes: the owner's own map link, else the saved pin, else a Google Maps search for the address. */
export function mapLink(location: LocationSettings | null | undefined, address: string | null | undefined): string | null {
  const own = str(location?.map_link);
  if (/^https?:\/\//i.test(own)) return own;
  const lat = num(location?.lat), lng = num(location?.lng);
  if (lat !== null && lng !== null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const a = str(address);
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}

/** The embeddable map for the Visit us section (no API key needed): the pin when saved, else the address. */
export function mapEmbed(location: LocationSettings | null | undefined, address: string | null | undefined): string | null {
  const lat = num(location?.lat), lng = num(location?.lng);
  const q = lat !== null && lng !== null ? `${lat},${lng}` : str(address);
  return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed` : null;
}

export type SocialNetwork = "facebook" | "instagram" | "tiktok" | "youtube" | "other";
export interface SocialProfile { key: string; network: SocialNetwork; label: string; href: string }

const NETWORKS: Record<string, { label: string; base: string }> = {
  facebook: { label: "Facebook", base: "https://facebook.com/" },
  instagram: { label: "Instagram", base: "https://instagram.com/" },
  tiktok: { label: "TikTok", base: "https://www.tiktok.com/@" },
  youtube: { label: "YouTube", base: "https://youtube.com/@" },
};

/**
 * Profiles the owner filled in, Facebook, Instagram, TikTok and YouTube first, then any other key. A bare handle
 * ("demo.cafe" or "@demo.cafe") becomes the network's profile URL; the Instagram section's handle fills in a missing
 * Instagram link. Anything that is neither a URL nor a handle is dropped.
 */
export function socialProfiles(social: Record<string, unknown> | null | undefined, instagramHandle?: unknown): SocialProfile[] {
  const entries: [string, string][] = Object.entries(social ?? {}).map(([k, v]) => [k, str(v)]);
  if (!entries.some(([k, v]) => k === "instagram" && v) && str(instagramHandle)) entries.push(["instagram", str(instagramHandle)]);
  const order = (k: string) => { const i = Object.keys(NETWORKS).indexOf(k); return i === -1 ? 99 : i; };
  const seen = new Set<string>();
  const out: SocialProfile[] = [];
  for (const [key, value] of [...entries].sort((a, b) => order(a[0]) - order(b[0]))) {
    if (!value || seen.has(key)) continue;
    const known = NETWORKS[key];
    let href: string | null = null;
    if (/^https?:\/\//i.test(value)) href = value;
    else if (/^www\./i.test(value) || /\.[a-z]{2,}\//i.test(value)) href = `https://${value}`;
    else if (known && /^@?[\w.-]+$/.test(value)) href = `${known.base}${value.replace(/^@/, "")}`;
    if (!href) continue;
    seen.add(key);
    out.push({ key, network: known ? (key as SocialNetwork) : "other", label: known?.label ?? key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), href });
  }
  return out;
}

/** Menu slider pictures: Website Config keeps one image URL per line; objects with image_key, image or url are read too. */
export function sliderImages(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => (typeof it === "string" ? it.trim() : it && typeof it === "object" ? str((it as Record<string, unknown>).image_key) || str((it as Record<string, unknown>).image) || str((it as Record<string, unknown>).url) : ""))
    .filter((u) => /^(https?:\/\/|\/)/i.test(u));
}

export interface LegalDocument { key: string; label: string; text: string }
const DOCUMENT_LABELS: Record<string, string> = { terms: "Terms of service", privacy: "Privacy policy", refund: "Refund policy" };

/** The Website Config documents that have text, in the order terms, privacy, refund. */
export function legalDocuments(documents: Record<string, unknown> | null | undefined): LegalDocument[] {
  return Object.keys(DOCUMENT_LABELS).map((key) => ({ key, label: DOCUMENT_LABELS[key], text: str(documents?.[key]) })).filter((d) => d.text);
}

/** Footer links are JSON-ish: {label, url} objects or plain URL strings. Only web, mail, phone and on-site links are kept. */
export function footerLinks(links: unknown): { label: string; url: string }[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((l) => (l && typeof l === "object" ? { label: str((l as Record<string, unknown>).label), url: str((l as Record<string, unknown>).url) } : { label: str(l), url: str(l) }))
    .map((l) => ({ ...l, url: /^www\./i.test(l.url) ? `https://${l.url}` : l.url }))
    .filter((l) => /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(l.url))
    .map((l) => ({ label: l.label || l.url, url: l.url }));
}

/** Digits for a wa.me link, or null when there is no number. */
export function whatsappHref(number: string | null | undefined, greeting?: string | null): string | null {
  const digits = (number ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const text = (greeting ?? "").trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
