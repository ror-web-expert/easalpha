import type { Viewport } from "next";
import { PosRoot } from "@/components/pos/pos-root";

// Tills are touch screens: no pinch or double-tap zoom, the layout fills the screen edge to edge, and the on-screen
// keyboard resizes the page instead of covering the field being typed in.
export const viewport: Viewport = {
  themeColor: "#10294D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <PosRoot>{children}</PosRoot>;
}
