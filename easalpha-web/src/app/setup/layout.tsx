import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Set up this device",
  description: "Sign in once as an owner or manager, choose what this machine is, and it opens that screen from now on.",
};

export const viewport: Viewport = { themeColor: "#10294D", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-page text-fg">{children}</div>;
}
