"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, Check, ChevronDown, Clock, Download, Monitor, Smartphone, Terminal } from "lucide-react";
import { CARD } from "@/components/site/sections";
import {
  AFTER_INSTALL, detectOs, installers, installerUrl, MOBILE_GUIDES, PLATFORM_GUIDES,
  type Installer, type Os,
} from "@/components/site/download-helpers";

const ICON: Record<Os, React.ComponentType<{ className?: string }>> = { windows: Monitor, linux: Terminal, mac: Apple, android: Smartphone, ios: Smartphone, other: Monitor };
const BTN_PRIMARY = "inline-flex h-11 items-center gap-2 rounded-full bg-[#FF7A1A] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C]";
const BTN_SECONDARY = "inline-flex h-11 items-center gap-2 rounded-full border border-[#0B1F3A]/20 px-5 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F4F7FB]";

type Guide = { os: Os; key: string; title: string; needs: string; install: string[]; issues: { title: string; fix: string }[]; installerIds?: string[] };

/** Tiles across the top, one per system, with this machine's tile selected on load; one panel underneath with the
 *  download, three steps and the usual fixes for whichever tile is selected. Phones and tablets get the same below. */
export function DownloadList({ baseUrl, version, list: given, builtAt }: { baseUrl: string; version: string; list?: Installer[]; builtAt?: string | null }) {
  const [os, setOs] = useState<Os>("other");
  const [desktop, setDesktop] = useState<Os>("windows");
  const [phone, setPhone] = useState<Os>("android");
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const detected = detectOs(navigator.userAgent, nav.userAgentData?.platform);
    setOs(detected);
    if (detected === "windows" || detected === "mac" || detected === "linux") setDesktop(detected);
    if (detected === "ios" || detected === "android") setPhone(detected);
  }, []);
  const list = given ?? installers(version);
  const built = builtAt ? new Date(builtAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  const mobile = os === "ios" || os === "android";

  return (
    <div className="space-y-14">
      <section>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Desktop app for the counter</h2>
        <p className="mt-1 text-sm text-slate-600">Version {version}{built ? `, ${built}` : ""}. One installer per computer; every build updates itself.{mobile ? " You are on a phone: the section below is for you." : ""}</p>
        <Picker guides={PLATFORM_GUIDES} selected={desktop} onSelect={setDesktop} detected={os} list={list} cols="sm:grid-cols-3" />
        <Panel guide={PLATFORM_GUIDES.find((g) => g.os === desktop) ?? PLATFORM_GUIDES[0]} list={list} baseUrl={baseUrl} version={version} />
      </section>

      <section>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Phones and tablets</h2>
        <p className="mt-1 text-sm text-slate-600">Order-taker tablets, rider phones, kitchen and queue screens run the web app from the home screen. Nothing to download; they print through the counter PC.</p>
        <Picker guides={MOBILE_GUIDES} selected={phone} onSelect={setPhone} detected={os} list={list} cols="sm:grid-cols-2" />
        <Panel guide={MOBILE_GUIDES.find((g) => g.os === phone) ?? MOBILE_GUIDES[0]} list={list} baseUrl={baseUrl} version={version} />
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

function filesFor(guide: Guide, list: Installer[]): Installer[] {
  return (guide.installerIds ?? []).map((id) => list.find((i) => i.id === id)).filter((i): i is Installer => !!i);
}

function Picker({ guides, selected, onSelect, detected, list, cols }: { guides: Guide[]; selected: Os; onSelect: (o: Os) => void; detected: Os; list: Installer[]; cols: string }) {
  return (
    <div role="tablist" aria-label="Choose your system" className={`mt-6 grid gap-4 ${cols}`}>
      {guides.map((g) => {
        const I = ICON[g.os];
        const active = g.os === selected;
        const files = filesFor(g, list);
        const ready = files.length === 0 || files.some((i) => i.available !== false);
        return (
          <button key={g.key} type="button" role="tab" aria-selected={active} onClick={() => onSelect(g.os)}
            className={`relative flex min-w-0 items-start gap-3 rounded-2xl border p-5 text-left transition ${active ? "border-[#FF7A1A] bg-white shadow-md ring-2 ring-[#FF7A1A]" : "border-slate-200 bg-white hover:border-[#0B1F3A]/40 hover:shadow-sm"}`}>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${active ? "bg-[#0B1F3A] text-white" : "bg-[#F4F7FB] text-[#0B1F3A]"}`}><I className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-[#0B1F3A]">{g.title}</span>
              <span className="block text-xs text-slate-600">{g.needs}</span>
              <span className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${ready ? "text-emerald-700" : "text-slate-500"}`}>
                {ready ? <><Check className="h-3.5 w-3.5" /> {files.length ? "Ready to download" : "Web app, no install"}</> : <><Clock className="h-3.5 w-3.5" /> Next release</>}
              </span>
            </span>
            {g.os === detected ? <span className="absolute -top-2.5 right-4 rounded-full bg-[#FF7A1A] px-2.5 py-0.5 text-[11px] font-semibold text-white">Your device</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Panel({ guide, list, baseUrl, version }: { guide: Guide; list: Installer[]; baseUrl: string; version: string }) {
  const I = ICON[guide.os];
  const files = filesFor(guide, list);
  const ready = files.filter((i) => i.available !== false);
  const pending = files.filter((i) => i.available === false);
  const isPhone = guide.os === "ios" || guide.os === "android";
  return (
    <div className={`mt-4 p-6 sm:p-8 ${CARD}`} role="tabpanel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0B1F3A] text-white"><I className="h-6 w-6" /></span>
          <div>
            <h3 className="text-xl font-bold text-[#0B1F3A]">{isPhone ? `EasAlpha on ${guide.title}` : `EasAlpha POS ${version} for ${guide.title}`}</h3>
            <p className="mt-1 text-sm text-slate-600">{guide.needs}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isPhone ? <Link href="/setup" className={BTN_PRIMARY}>Open the setup screen</Link> : null}
          {ready.map((i, n) => <DownloadButton key={i.id} i={i} baseUrl={baseUrl} primary={n === 0} />)}
          {pending.map((i) => <span key={i.id} className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-slate-300 px-4 text-sm text-slate-500" title={i.file}><Clock className="h-4 w-4" /> {label(i)}: next release</span>)}
        </div>
      </div>
      {!isPhone && ready.length === 0 ? <p className="mt-4 rounded-xl bg-[#F4F7FB] p-3 text-sm text-slate-700">This build is produced by the next release and appears here on its own. Until then the till runs in your browser: <Link href="/setup" className="font-semibold text-[#C2410C] hover:underline">open the setup screen</Link>.</p> : null}

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isPhone ? "Add to the home screen" : "Install"}</h4>
          <ol className="mt-3 space-y-3 text-sm text-slate-700">
            {guide.install.map((s, n) => (
              <li key={s} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FF7A1A] text-xs font-bold text-white">{n + 1}</span><span className="pt-0.5">{s}</span></li>
            ))}
          </ol>
        </div>
        <details className="group text-sm" open>
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 [&::-webkit-details-marker]:hidden">
            Problems? <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <dl className="mt-3 space-y-2.5">
            {guide.issues.map((x) => (
              <div key={x.title}>
                <dt className="font-semibold text-slate-800">{x.title}</dt>
                <dd className="text-slate-600">{x.fix}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
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
  const text = primary ? (i.id === "win" ? "Download" : `Download ${label(i)}`) : label(i);
  return (
    <a href={installerUrl(baseUrl, i.file)} download className={primary ? BTN_PRIMARY : BTN_SECONDARY} title={i.file}>
      <Download className="h-4 w-4" /> {text}
    </a>
  );
}
