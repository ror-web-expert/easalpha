import type { Metadata, Viewport } from "next";
// Type: Inter for the whole product (self-hosted by next/font, so tills render it offline too);
// Roboto Mono stays for receipts and other fixed-width figures.
import { Inter } from "next/font/google";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter", display: "swap" });

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://easalpha.com").replace(/\/$/, "");
const DESCRIPTION = "EasAlpha is the complete restaurant POS for any country: an offline desktop till, order-taker tablet, kitchen display, inventory with recipe deduction, purchasing, double-entry accounts, payroll, riders, customer credit, WhatsApp receipts, local tax rules and 27 reports, in your currency.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "EasAlpha: restaurant POS for every country", template: "%s | EasAlpha" },
  description: DESCRIPTION,
  applicationName: "EasAlpha",
  keywords: ["restaurant POS", "offline POS", "kitchen display", "restaurant inventory", "multi-currency POS", "restaurant POS Pakistan", "FBR POS", "WhatsApp receipts"],
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon-192.png" },
  openGraph: {
    type: "website", siteName: "EasAlpha", locale: "en_PK", url: SITE_URL,
    title: "EasAlpha: restaurant POS for every country", description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "EasAlpha restaurant POS" }],
  },
  twitter: { card: "summary_large_image", title: "EasAlpha: restaurant POS for every country", description: DESCRIPTION, images: ["/og.png"] },
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
