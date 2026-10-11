import type { Metadata, Viewport } from "next";
// Material Design 3 type: Roboto, self-hosted so tills render it offline too
// (regular 400 and medium 500 carry the M3 scale; bold 700 for big figures).
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";


const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://servio.pk").replace(/\/$/, "");
const DESCRIPTION = "Servio is the complete restaurant POS for Pakistan: an offline desktop till, order-taker tablet, kitchen display, inventory with recipe deduction, purchasing, double-entry accounts, payroll, riders, khata credit, WhatsApp receipts, FBR and PRA tax and 27 reports.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Servio: restaurant POS built for Pakistan", template: "%s | Servio" },
  description: DESCRIPTION,
  applicationName: "Servio",
  keywords: ["restaurant POS Pakistan", "offline POS", "kitchen display", "restaurant inventory", "FBR POS", "PRA POS", "khata", "WhatsApp receipts"],
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon-192.png" },
  openGraph: {
    type: "website", siteName: "Servio", locale: "en_PK", url: SITE_URL,
    title: "Servio: restaurant POS built for Pakistan", description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Servio restaurant POS" }],
  },
  twitter: { card: "summary_large_image", title: "Servio: restaurant POS built for Pakistan", description: DESCRIPTION, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#1565C0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
