import type { Metadata, Viewport } from "next";
// Type: Inter for the whole product (self-hosted by next/font, so tills render it offline too);
// Roboto Mono stays for receipts and other fixed-width figures.
import { Inter } from "next/font/google";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/site/json-ld";
import { organization, webSite } from "@/lib/schema";
import { SITE_DESCRIPTION } from "@/components/site/site-helpers";

// No weight list: next/font then serves Google's variable Inter, one file for every weight instead of five, so the
// headline (the largest contentful paint on phones) swaps to the real font sooner.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://easalpha.com").replace(/\/$/, "");
// 155 characters (Google cuts descriptions at about 155 to 160; the old one ran to 253). Shared with the schema.
const DESCRIPTION = SITE_DESCRIPTION;
// Paste the content value Google Search Console gives you (Settings, Ownership verification, HTML tag). The tag is
// only rendered once the placeholder is replaced, so production never carries a dummy value.
const GOOGLE_SITE_VERIFICATION = "REPLACE_ME";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "EasAlpha: restaurant POS for any restaurant, anywhere", template: "%s | EasAlpha" },
  description: DESCRIPTION,
  applicationName: "EasAlpha",
  alternates: { canonical: "/", languages: { en: "/", "x-default": "/" } },
  ...(GOOGLE_SITE_VERIFICATION !== "REPLACE_ME" ? { verification: { google: GOOGLE_SITE_VERIFICATION } } : {}),
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon-192.png" },
  openGraph: {
    type: "website", siteName: "EasAlpha", locale: "en_PK", url: SITE_URL,
    title: "EasAlpha: restaurant POS for any restaurant, anywhere", description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "EasAlpha restaurant POS" }],
  },
  twitter: { card: "summary_large_image", title: "EasAlpha: restaurant POS for any restaurant, anywhere", description: DESCRIPTION, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#10294D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-full">
        <JsonLd data={[organization(), webSite()]} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
