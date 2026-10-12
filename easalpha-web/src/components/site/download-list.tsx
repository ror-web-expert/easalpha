"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, ChevronDown, Clock, Download, Monitor, Smartphone, Terminal } from "lucide-react";
import { CARD } from "@/components/site/sections";
import {
  AFTER_INSTALL, detectOs, installers, installerUrl, MOBILE_GUIDES, ordered, OS_LABEL, PLATFORM_GUIDES,
  type Installer, type Os,
} from "@/components/site/download-helpers";

const ICON: Record<Os, React.ComponentType<{ className?: string }>> = { windows: Monitor, linux: Terminal, mac: Apple, android: Smartphone, ios: Smartphone, other: Monitor };
const BTN_PRIMARY = "inline-flex h-11 items-center gap-2 rounded-full bg-[#FF7A1A] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C]";
const BTN_SECONDARY = "inline-flex h-11 items-center gap-2 rounded-full border border-[#0B1F3A]/20 px-5 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F4F7FB]";

/** This machine's installer first, then one short card per kind of computer and phone: what it needs in one line, the
 *  download, three steps, and the usual fixes folded away. A build that is not uploaded yet keeps its card. */
export function DownloadList({ baseUrl, version, list: given, builtAt }: { baseUrl: string; version: string; list?: Installer[]; builtAt?: string | null }) {
  const [os, setOs] = useState<Os>("other");
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    setOs(detectOs(navigator.userAgent, nav.userAgentData?.platform));
  }, []);
  const list = given ?? installers(version);
  const ready = ordered(os, list).mine.filter((i) => i.available !== false);
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
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">Nothing to install on a phone or tablet</h2>
                <p className="mt-2 text-sm text-slate-600">Sign in once on the setup screen and add EasAlpha to the home screen. Three steps below.</p>
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
                <p className="mt-2 text-sm text-slate-600">Until then the till runs in your browser with the same login and screens.</p>
                <Link href="/setup" className={`mt-4 ${BTN_SECONDARY}`}>Open the setup screen</Link>
              </>
            ) : (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">EasAlpha POS {version}</h2>
                <p className="mt-2 text-sm text-slate-600">Pick your system below.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Desktop app</h2>
        <p className="mt-1 text-sm text-slate-600">Version {version}{built ? `, ${built}` : ""}. One installer per counter; every build updates itself.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {guides.map((g) => {
            const files = g.installerIds.map((id) => list.find((i) => i.id === id)).filter((i): i is Installer => !!i);
            const ready = files.filter((i) => i.available !== false);
            const pending = files.filter((i) => i.available === false);
            return (
              <GuideCard key={g.key} os={g.os} title={g.title} needs={g.needs} steps={g.install} issues={g.issues} highlight={g.os === os}
                actions={<>
                  {ready.map((i, n) => <DownloadButton key={i.id} i={i} baseUrl={baseUrl} primary={n === 0} />)}
                  {pending.map((i) => <span key={i.id} className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-slate-300 px-4 text-sm text-slate-500" title={i.file}><Clock className="h-4 w-4" /> {label(i)}: next release</span>)}
                </>} />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Phones and tablets</h2>
        <p className="mt-1 text-sm text-slate-600">Order-taker tablets, rider phones, kitchen and queue screens run the web app from the home screen. They print through the counter PC.</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {phones.map((g) => (
            <GuideCard key={g.key} os={g.os} title={g.title} needs={g.needs} steps={g.install} issues={g.issues} highlight={g.os === os}
              actions={<Link href="/setup" className={BTN_SECONDARY}>Open the setup screen</Link>} />
          ))}
        </div>
      </section>

      <section className={`p-6 sm:p-8 ${CARD}`}>
        <h2 className="text-lg font-bold text-[#0B1F3A]">After installing</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {AFTER_INSTALL.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <p className="mt-4 text-sm text-slate-600">Stuck? <Link href="/contact" className="font-semibold text-[#C2410C] hover:underline">Contact support</Link>, or write to the team from Admin, Help.</p>
      </section>
    </div>
  );
}

function GuideCard({ os, title, needs, steps, issues, actions, highlight }: {
  os: Os; title: string; needs: string; steps: string[]; issues: { title: string; fix: string }[]; actions: React.ReactNode; highlight: boolean;
}) {
  const I = ICON[os];
  return (
    <article className={`flex flex-col p-6 ${CARD} ${highlight ? "ring-2 ring-[#FF7A1A]" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F4F7FB] text-[#0B1F3A]"><I className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#0B1F3A]">{title}</h3>
          <p className="text-sm text-slate-600">{needs}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
      <ol className="mt-5 list-decimal space-y-1.5 border-t border-slate-100 pl-5 pt-4 text-sm text-slate-700">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <details className="group mt-4 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-[#0B1F3A] [&::-webkit-details-marker]:hidden">
          Problems? <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <dl className="mt-2 space-y-2">
          {issues.map((x) => (
            <div key={x.title}>
              <dt className="font-semibold text-slate-800">{x.title}</dt>
              <dd className="text-slate-600">{x.fix}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
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
  const text = primary ? (i.id === "win" ? "Download" : `Download ${label(i)}`) : label(i);
  return (
    <a href={installerUrl(baseUrl, i.file)} download className={primary ? BTN_PRIMARY : BTN_SECONDARY} title={i.file}>
      <Download className="h-4 w-4" /> {text}
    </a>
  );
}
