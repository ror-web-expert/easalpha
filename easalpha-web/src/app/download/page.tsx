import type { Metadata } from "next";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, Container, HeroChip, PageHero, SHOTS } from "@/components/site/sections";
import { CloudOff, MonitorDown } from "lucide-react";
import { getPlatform } from "@/components/site/platform-server";
import { headers } from "next/headers";
import { DownloadList } from "@/components/site/download-list";
import { applyManifest, downloadsBase, installers, originFromHeaders } from "@/components/site/download-helpers";
import { readDownloadsManifest } from "@/components/site/downloads-server";
import { SITE_URL } from "@/app/sitemap";

export const metadata: Metadata = {
  title: "Download",
  description: "EasAlpha POS for Windows, macOS and Linux with setup guides, requirements and fixes for each; iPhone, iPad and Android run the web app from the home screen.",
  alternates: { canonical: "/download" },
};

export default async function DownloadPage() {
  const p = await getPlatform();
  const h = await headers();
  // Links follow the address the site is opened on: localhost in development, the live domain in production.
  const base = downloadsBase(p?.downloads_url, originFromHeaders((n) => h.get(n), SITE_URL));
  // The installers' own manifest (written by the desktop workflow when it uploads) decides the version and which files exist;
  // the super panel's desktop_version is the fallback when the folder is elsewhere.
  const manifest = p?.downloads_url ? null : await readDownloadsManifest();
  const fallback = p?.desktop_version || "0.2.0";
  const { version, list } = applyManifest(installers(fallback), manifest);
  return (
    <SiteShell>
      <PageHero eyebrow="Download" title="EasAlpha POS for your counter" text="The desktop app wraps the till and adds direct receipt printing and the print server that order-taker tablets print through. It keeps selling when the internet drops and syncs when it is back."
        visual={<div className="relative lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.till} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={MonitorDown} title="Windows · Linux · Mac" text="one installer per computer" className="absolute -left-4 -bottom-6 hidden sm:flex" /><HeroChip icon={CloudOff} title="Offline" text="sells with no internet" tone="navy" className="absolute -right-2 -top-6 hidden sm:flex" /></div>} />
      <Container className="py-16 lg:py-24">
        <DownloadList baseUrl={base} version={version ?? fallback} list={list} builtAt={manifest?.built_at ?? null} />
      </Container>
    </SiteShell>
  );
}
