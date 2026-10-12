"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Apple, CheckCircle2, Clock, Download, ListChecks, Monitor, Smartphone, Terminal, Wrench } from "lucide-react";
import { CARD } from "@/components/site/sections";
import {
  AFTER_INSTALL, detectOs, installers, installerUrl, MOBILE_GUIDES, ordered, OS_LABEL, PLATFORM_GUIDES,
  type Installer, type MobileGuide, type Os, type PlatformGuide,
} from "@/components/site/download-helpers";

const ICON: Record<Os, React.ComponentType<{ className?: string }>> = { windows: Monitor, linux: Terminal, mac: Apple, android: Smartphone, ios: Smartphone, other: Monitor };
const BTN_PRIMARY = "inline-flex h-11 items-center gap-2 rounded-full bg-[#FF7A1A] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C]";
const BTN_SECONDARY = "inline-flex h-11 items-center gap-2 rounded-full border border-[#0B1F3A]/20 px-5 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F4F7FB]";

/** This machine's installer first, then one card per kind of computer and phone with its own requirements, install
 *  steps and known issues. A build that is not uploaded yet keeps its card, marked "with the next release". */
export function DownloadList({ baseUrl, version, list: given, builtAt }: { baseUrl: string; version: string; list?: Installer[]; builtAt?: string | null }) {
  const [os, setOs] = useState<Os>("other");
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    setOs(detectOs(navigator.userAgent, nav.userAgentData?.platform));
  }, []);
  const list = given ?? installers(version);
  const { mine } = ordered(os, list);
  const ready = mine.filter((i) => i.available !== false);
  const Icon = ICON[os];
  const mobile = os === "android" || os === "ios";
  const guides = [...PLATFORM_GUIDES].sort((a, b) => Number(b.os === os) - Number(a.os === os));
  const phones = [...MOBILE_GUIDES].sort((a, b) => Number(b.os === os) - Number(a.os === os));
  const built = builtAt ? new Date(builtAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="space-y-12">
      <section className={`p-6 sm:p-8 ${CARD}`}>
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0B1F3A] text-white"><Icon className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C2410C]">Recommended for {OS_LABEL[os]}</p>
            {mobile ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">No installer needed on a phone or tablet</h2>
                <p className="mt-2 text-sm text-slate-600">Open EasAlpha in the browser, sign in once as a manager on the setup screen and add it to the home screen. The steps for {OS_LABEL[os]} are below.</p>
                <Link href="/setup" className={`mt-4 ${BTN_PRIMARY}`}>Open the setup screen</Link>
              </>
            ) : ready.length ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">EasAlpha POS {version} for {OS_LABEL[os]}</h2>
                <p className="mt-2 text-sm text-slate-600">{ready[0].note}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {ready.map((i, n) => <DownloadButton key={i.id} i={i} baseUrl={baseUrl} primary={n === 0} />)}
                </div>
              </>
            ) : os !== "other" ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">The {OS_LABEL[os]} build of {version} comes with the next release</h2>
                <p className="mt-2 text-sm text-slate-600">Until then the till runs in your browser with the same login and the same screens. The {OS_LABEL[os]} guide below already applies.</p>
                <Link href="/setup" className={`mt-4 ${BTN_SECONDARY}`}>Open the setup screen</Link>
              </>
            ) : (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">EasAlpha POS {version}</h2>
                <p className="mt-2 text-sm text-slate-600">We could not tell which computer this is. Pick your system below.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Desktop app for every counter</h2>
        <p className="mt-1 text-sm text-slate-600">Version {version}{built ? `, built ${built}` : ""}. One installer per computer; the same app, the same screens on each. Builds marked &ldquo;next release&rdquo; are produced by the release pipeline and appear here on their own.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {guides.map((g) => <PlatformCard key={g.key} guide={g} list={list} baseUrl={baseUrl} highlight={g.os === os} />)}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Phones and tablets</h2>
        <p className="mt-1 text-sm text-slate-600">Order-taker tablets, rider phones, kitchen displays and queue screens run the web app from the home screen. Nothing to download; they print through the counter PC.</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {phones.map((g) => <MobileCard key={g.key} guide={g} highlight={g.os === os} />)}
        </div>
      </section>

      <section className={`p-6 sm:p-8 ${CARD}`}>
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#0B1F3A]"><ListChecks className="h-5 w-5 text-[#FF7A1A]" /> After installing, on every computer</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {AFTER_INSTALL.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <p className="mt-4 text-sm text-slate-600">Stuck? <Link href="/contact" className="font-semibold text-[#C2410C] hover:underline">Contact support</Link> or write to the EasAlpha team from Admin, Help.</p>
      </section>
    </div>
  );
}

function PlatformCard({ guide, list, baseUrl, highlight }: { guide: PlatformGuide; list: Installer[]; baseUrl: string; highlight: boolean }) {
  const I = ICON[guide.os];
  const files = guide.installerIds.map((id) => list.find((i) => i.id === id)).filter((i): i is Installer => !!i);
  const ready = files.filter((i) => i.available !== false);
  const pending = files.filter((i) => i.available === false);
  return (
    <article className={`flex flex-col p-6 ${CARD} ${highlight ? "ring-2 ring-[#FF7A1A]" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F4F7FB] text-[#0B1F3A]"><I className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#0B1F3A]">{guide.title}</h3>
          <p className="text-sm text-slate-600">{guide.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {ready.map((i, n) => <DownloadButton key={i.id} i={i} baseUrl={baseUrl} primary={n === 0} />)}
        {pending.map((i) => (
          <span key={i.id} className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-slate-300 px-4 text-sm text-slate-500" title={i.file}>
            <Clock className="h-4 w-4" /> {label(i)}: next release
          </span>
        ))}
      </div>

      <GuideBlock icon={CheckCircle2} title="Needs">
        <ul className="list-disc space-y-1 pl-5">{guide.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
      </GuideBlock>
      <GuideBlock icon={Download} title="Install">
        <ol className="list-decimal space-y-1 pl-5">{guide.install.map((s) => <li key={s}>{s}</li>)}</ol>
      </GuideBlock>
      <GuideBlock icon={Wrench} title="If something goes wrong">
        <dl className="space-y-2">
          {guide.issues.map((x) => (
            <div key={x.title}>
              <dt className="flex items-start gap-1.5 font-semibold text-[#0B1F3A]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C2410C]" /> {x.title}</dt>
              <dd className="pl-5 text-slate-600">{x.fix}</dd>
            </div>
          ))}
        </dl>
      </GuideBlock>
    </article>
  );
}

function MobileCard({ guide, highlight }: { guide: MobileGuide; highlight: boolean }) {
  const I = ICON[guide.os];
  return (
    <article className={`flex flex-col p-6 ${CARD} ${highlight ? "ring-2 ring-[#FF7A1A]" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F4F7FB] text-[#0B1F3A]"><I className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#0B1F3A]">{guide.title}</h3>
          <p className="text-sm text-slate-600">{guide.subtitle}</p>
        </div>
      </div>
      <div className="mt-4"><Link href="/setup" className={BTN_SECONDARY}>Open the setup screen</Link></div>
      <GuideBlock icon={CheckCircle2} title="Needs">
        <ul className="list-disc space-y-1 pl-5">{guide.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
      </GuideBlock>
      <GuideBlock icon={Smartphone} title="Add to the home screen">
        <ol className="list-decimal space-y-1 pl-5">{guide.install.map((s) => <li key={s}>{s}</li>)}</ol>
      </GuideBlock>
      <GuideBlock icon={Wrench} title="If something goes wrong">
        <dl className="space-y-2">
          {guide.issues.map((x) => (
            <div key={x.title}>
              <dt className="flex items-start gap-1.5 font-semibold text-[#0B1F3A]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C2410C]" /> {x.title}</dt>
              <dd className="pl-5 text-slate-600">{x.fix}</dd>
            </div>
          ))}
        </dl>
      </GuideBlock>
    </article>
  );
}

function GuideBlock({ icon: I, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-700">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500"><I className="h-3.5 w-3.5" /> {title}</h4>
      {children}
    </div>
  );
}

function label(i: Installer): string {
  if (i.arch === "arm64") return "Apple Silicon";
  if (i.arch === "x64") return "Intel";
  if (i.id === "deb") return ".deb package";
  if (i.id === "appimage") return "AppImage";
  if (i.id === "win") return "Windows installer";
  return i.title;
}

function DownloadButton({ i, baseUrl, primary }: { i: Installer; baseUrl: string; primary: boolean }) {
  return (
    <a href={installerUrl(baseUrl, i.file)} download className={primary ? BTN_PRIMARY : BTN_SECONDARY} title={i.file}>
      <Download className="h-4 w-4" /> {primary ? `Download ${label(i) === "Windows installer" ? "" : label(i)}`.trim() : label(i)}
    </a>
  );
}
