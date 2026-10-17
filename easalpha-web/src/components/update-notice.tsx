"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { buildChanged, reloadsSilently, UPDATE_POLL_MS } from "@/lib/update-check";

/** Polls /version every few minutes and when the window regains focus. A changed build id means a deploy: display
 *  screens reload at once, every other screen shows a small "new version" pill with a Reload button, so a till in the
 *  middle of an order is never interrupted but still gets the update the same day. */
export function UpdateNotice() {
  const pathname = usePathname();
  const first = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const r = await fetch("/version", { cache: "no-store" });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (stopped || !build) return;
        if (!first.current) { first.current = build; return; }
        if (buildChanged(first.current, build)) {
          if (reloadsSilently(window.location.pathname)) window.location.reload();
          else setReady(true);
        }
      } catch {
        // offline or the server is restarting; try again next time
      }
    };
    void check();
    const timer = window.setInterval(check, UPDATE_POLL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, []);

  // A navigation after the prompt was dismissed is a quiet moment: take the update then.
  useEffect(() => { if (ready && hidden) window.location.reload(); }, [pathname, ready, hidden]);

  if (!ready || hidden) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#0B1F3A] py-2 pl-4 pr-2 text-sm text-white shadow-lg">
      <span>A new version of EasAlpha is ready.</span>
      <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-cta px-3 font-semibold text-cta-fg hover:bg-cta-hover"><RefreshCw className="h-3.5 w-3.5" /> Reload</button>
      <button type="button" onClick={() => setHidden(true)} aria-label="Later" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"><X className="h-4 w-4" /></button>
    </div>
  );
}
