import type { Metadata } from "next";

export const SITE_NAME = "EasAlpha";
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "EasAlpha restaurant POS" };

/** Metadata for one public page: title (with the | EasAlpha template, or as given when absolute), description,
 *  canonical and hreflang for the path, and matching Open Graph and Twitter tags, since Next replaces a parent's
 *  openGraph block rather than merging it and the layout's would otherwise describe the homepage on every page. */
export function pageMetadata({ title, description, path, absolute = false, extra = {} }: { title: string; description: string; path: string; absolute?: boolean; extra?: Metadata }): Metadata {
  const full = absolute ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path, languages: { en: path, "x-default": path } },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_PK", url: path, title: full, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE.url] },
    ...extra,
  };
}
