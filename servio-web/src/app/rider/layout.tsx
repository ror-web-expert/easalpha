import type { Metadata, Viewport } from "next";
import { RiderShell } from "@/components/rider/shell";

// SPEC surfaces: the rider app is its own installable page on the rider's phone (portrait, standalone), with its own
// manifest so it installs apart from the till.
export const metadata: Metadata = {
  title: { default: "Servio Rider", template: "%s | Servio Rider" },
  description: "Servio rider app: your deliveries and delivery status",
  manifest: "/manifest-rider.json",
  appleWebApp: { capable: true, title: "Servio Rider", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#10294D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return <RiderShell>{children}</RiderShell>;
}
