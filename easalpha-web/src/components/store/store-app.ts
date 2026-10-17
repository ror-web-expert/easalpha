// The restaurant's own customer app: the storefront at /store/<slug> installs to the phone's home screen under the
// restaurant's name, colour and logo, and opens only that restaurant's site. Pure helpers, unit-tested; the manifest
// and icon routes under src/app/store/[slug]/ and the page metadata use them.
import type { Storefront } from "@/lib/types";
import { normalizeHex } from "./storefront-helpers";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const DEFAULT_THEME = "#10294d";

export function storeName(data: Pick<Storefront, "business" | "config">): string {
  return str(data.config?.identity?.name) || data.business.name;
}

export function storeTheme(data: Pick<Storefront, "config">): string {
  return normalizeHex(data.config?.identity?.theme_color) ?? DEFAULT_THEME;
}

export function storeLogo(data: Pick<Storefront, "business" | "config">): string | null {
  return str(data.config?.identity?.logo_key) || data.business.logo_key || null;
}

/** Up to 12 characters under the icon: the whole name when it fits, else whole words that fit, else a cut. */
export function shortName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length <= 12) return n;
  let out = "";
  for (const w of n.split(" ")) { if ((out ? `${out} ${w}` : w).length > 12) break; out = out ? `${out} ${w}` : w; }
  return out || n.slice(0, 12);
}

/** The letter on the icon when there is no logo: the first Latin letter or digit of the name, else of the slug. */
export function iconLetter(name: string, slug: string): string {
  const m = /[a-z0-9]/i.exec(name) ?? /[a-z0-9]/i.exec(slug);
  return (m?.[0] ?? "R").toUpperCase();
}

export function storeDescription(data: Pick<Storefront, "business" | "config">): string {
  const seo = str(data.config?.seo?.description);
  const about = str(data.config?.identity?.description);
  return seo || (about ? `${storeName(data)}: ${about}. Order online for delivery or pickup.` : `Order from ${storeName(data)} online for delivery or pickup.`);
}

export function storeManifest(slug: string, data: Pick<Storefront, "business" | "config">) {
  const base = `/store/${encodeURIComponent(slug)}`;
  const name = storeName(data);
  return {
    id: base,
    name,
    short_name: shortName(name),
    description: storeDescription(data),
    lang: "en",
    start_url: `${base}?source=app`,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: storeTheme(data),
    categories: ["food", "shopping"],
    icons: [
      { src: `${base}/app-icon/192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/app-icon/512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/app-icon/512?maskable=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
