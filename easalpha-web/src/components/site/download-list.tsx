"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, Download, Monitor, Smartphone, Terminal } from "lucide-react";
import { CARD } from "@/components/site/sections";
import { detectOs, installers, installerUrl, ordered, OS_LABEL, type Installer, type Os } from "@/components/site/download-helpers";

const ICON: Record<Os, React.ComponentType<{ className?: string }>> = { windows: Monitor, linux: Terminal, mac: Apple, android: Smartphone, ios: Smartphone, other: Monitor };

/** Picks this machine's installer and offers it first; every other build is listed underneath. */
export function DownloadList({ baseUrl, version, list: given, builtAt }: { baseUrl: string; version: string; list?: Installer[]; builtAt?: string | null }) {
  const [os, setOs] = useState<Os>("other");
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    setOs(detectOs(navigator.userAgent, nav.userAgentData?.platform));
  }, []);
  const list = given ?? installers(version);
  const { mine, others } = ordered(os, list);
  const Icon = ICON[os];
  const mobile = os === "android" || os === "ios";
  return (
    <div className="space-y-10">
      <section className={`p-6 sm:p-8 ${CARD}`}>
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0B1F3A] text-white"><Icon className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C2410C]">Recommended for {OS_LABEL[os]}</p>
            {mobile ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">No installer needed on a phone or tablet</h2>
                <p className="mt-2 text-sm text-slate-600">Open EasAlpha in the browser, sign in once as a manager on the setup screen and add it to the home screen. The tablet prints through the counter PC&apos;s print server.</p>
                <Link href="/setup" className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[#FF7A1A] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C]">Open the setup screen</Link>
              </>
            ) : mine.length ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">EasAlpha POS {version} for {OS_LABEL[os]}</h2>
                <p className="mt-2 text-sm text-slate-600">{mine[0].note}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {mine.map((i, n) => <DownloadButton key={i.id} i={i} baseUrl={baseUrl} primary={n === 0} />)}
                </div>
              </>
            ) : os !== "other" ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">The {OS_LABEL[os]} build of {version} is not published yet</h2>
                <p className="mt-2 text-sm text-slate-600">It arrives with the next release. Until then use the web till in your browser, or pick another installer below.</p>
                <Link href="/setup" className="mt-4 inline-flex h-11 items-center gap-2 rounded-full border border-[#0B1F3A]/20 px-5 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F4F7FB]">Open the setup screen</Link>
              </>
            ) : (
              <>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A]">EasAlpha POS {version}</h2>
                <p className="mt-2 text-sm text-slate-600">We could not tell which computer this is. Pick your installer below.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#0B1F3A]">{mine.length ? "Other computers" : "All installers"}</h2>
        <p className="mt-1 text-sm text-slate-600">Version {version}{builtAt ? `, built ${new Date(builtAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}. Every build updates itself from the same place when a new version is released.</p>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {(mine.length ? others : list).length === 0 ? <li className="text-sm text-slate-600">No installers are published yet.</li> : null}
          {(mine.length ? others : list).map((i) => {
            const I = ICON[i.os];
            return (
              <li key={i.id} className={`flex items-start gap-4 p-5 ${CARD}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F4F7FB] text-[#0B1F3A]"><I className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[#0B1F3A]">{i.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{i.note}</p>
                  <a href={installerUrl(baseUrl, i.file)} className="mt-3 inline-flex items-center gap-1.5 break-all text-sm font-semibold text-[#C2410C] hover:underline"><Download className="h-4 w-4 shrink-0" /> {i.file}</a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`p-6 ${CARD}`}>
        <h2 className="text-lg font-bold text-[#0B1F3A]">After installing</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Open EasAlpha POS. It shows the setup screen; a manager signs in once and chooses what this machine is: till, kitchen display, token screen or queue screen.</li>
          <li>Printers: EasAlpha menu, Printers (Ctrl+Shift+P). Pick the receipt and kitchen printers and print a test page. The same window shows this computer&apos;s address for tablets.</li>
          <li>Running your own server? Set its address in the same Printers window; the app opens it on every start.</li>
        </ol>
      </section>
    </div>
  );
}

function DownloadButton({ i, baseUrl, primary }: { i: Installer; baseUrl: string; primary: boolean }) {
  return (
    <a href={installerUrl(baseUrl, i.file)} download className={primary
      ? "inline-flex h-11 items-center gap-2 rounded-full bg-[#FF7A1A] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C]"
      : "inline-flex h-11 items-center gap-2 rounded-full border border-[#0B1F3A]/20 px-5 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F4F7FB]"}>
      <Download className="h-4 w-4" /> {primary ? "Download" : i.arch === "arm64" ? "Apple Silicon" : i.id === "deb" ? ".deb package" : i.title}
    </a>
  );
}
