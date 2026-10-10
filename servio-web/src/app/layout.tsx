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


export const metadata: Metadata = {
  title: { default: "Servio", template: "%s | Servio" },
  description: "Servio restaurant POS",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#005bbf",
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
