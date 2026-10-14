"use client";
import { useEffect } from "react";
import { eventFromDataset, track } from "@/lib/analytics";
import type { AnalyticsConfig } from "./analytics";

const MARK = "data-easalpha-analytics";

/** Adds the provider's script tag once, from the config the server reads at request time. Umami reads
 *  data-website-id and Plausible data-domain from their own script element, so a dynamic tag works as a static one. */
export function loadTracker(cfg: Partial<AnalyticsConfig> | null | undefined, doc: Document = document): boolean {
  if (!cfg?.provider || !cfg.src || !cfg.id || doc.querySelector(`script[${MARK}]`)) return false;
  const s = doc.createElement("script");
  s.src = cfg.src; s.defer = true; s.setAttribute(MARK, cfg.provider);
  if (cfg.provider === "umami") s.setAttribute("data-website-id", cfg.id); else s.setAttribute("data-domain", cfg.id);
  doc.head.appendChild(s);
  return true;
}

/** One listener for the whole public site: a click on any element carrying data-track (see trackAttrs) sends that
 *  event; a <details data-track> sends it when it opens. Server components stay server components. */
export function AnalyticsClient() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics").then((r) => (r.ok ? r.json() : null)).then((cfg) => { if (!cancelled) loadTracker(cfg); }).catch(() => {});
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
      if (!el || el.tagName === "DETAILS") return;
      const ev = eventFromDataset(el.dataset);
      if (ev) track(ev.name, ev.props);
    };
    const onToggle = (e: Event) => {
      const el = e.target as HTMLDetailsElement | null;
      if (!el || el.tagName !== "DETAILS" || !el.open) return;
      const ev = eventFromDataset(el.dataset);
      if (ev) track(ev.name, ev.props);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("toggle", onToggle, true); // toggle does not bubble; capture catches it
    return () => { cancelled = true; document.removeEventListener("click", onClick); document.removeEventListener("toggle", onToggle, true); };
  }, []);
  return null;
}
