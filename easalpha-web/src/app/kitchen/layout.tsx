import type { Viewport } from "next";
import { TouchRoot } from "@/components/touch-root";

// Kitchen displays are often touch screens: no pinch or double-tap zoom, and the page never slides under a finger.
export const viewport: Viewport = { themeColor: "#0B1F3A", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" };

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return <TouchRoot>{children}</TouchRoot>;
}
