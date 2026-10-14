"use client";
import { useEffect } from "react";
import { eventFromDataset, track } from "@/lib/analytics";

/** One listener for the whole public site: a click on any element carrying data-track (see trackAttrs) sends that
 *  event; a <details data-track> sends it when it opens. Server components stay server components. */
export function AnalyticsEvents() {
  useEffect(() => {
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
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("toggle", onToggle, true); };
  }, []);
  return null;
}
