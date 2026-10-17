import type { Metadata, Viewport } from "next";
import { getStorefront } from "@/components/store/storefront-server";
import { storeDescription, storeLogo, storeName, storeTheme } from "@/components/store/store-app";
import { StoreAppSetup } from "./store-app-setup";

type Params = { params: Promise<{ slug: string }> };

/** Each restaurant's site is its own installable app: its name, colour and icon, its own manifest, and link previews
 *  (WhatsApp, Facebook) that show the restaurant rather than EasAlpha. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const base = `/store/${encodeURIComponent(slug)}`;
  const data = await getStorefront(slug);
  if (!data) return { title: { absolute: "Restaurant" }, robots: { index: false, follow: false } };
  const name = storeName(data);
  const title = (typeof data.config?.seo?.title === "string" && data.config.seo.title.trim()) || name;
  const description = storeDescription(data);
  const image = (typeof data.config?.identity?.cover_key === "string" && data.config.identity.cover_key) || storeLogo(data);
  return {
    title: { absolute: title },
    description,
    applicationName: name,
    manifest: `${base}/app-manifest`,
    alternates: { canonical: base },
    icons: { icon: [{ url: `${base}/app-icon/192`, sizes: "192x192", type: "image/png" }], apple: [{ url: `${base}/app-icon/180`, sizes: "180x180" }] },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    openGraph: { type: "website", siteName: name, title, description, url: base, ...(image ? { images: [{ url: image, alt: name }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const { slug } = await params;
  const data = await getStorefront(slug);
  return { themeColor: data ? storeTheme(data) : "#10294d", width: "device-width", initialScale: 1 };
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<StoreAppSetup /></>;
}
