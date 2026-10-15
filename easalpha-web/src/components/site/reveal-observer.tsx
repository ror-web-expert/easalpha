"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Watches every [data-reveal] element on the page and marks it shown the first time it scrolls into view.
 *  Re-runs on client-side navigation so a newly rendered page gets its own observer. */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.shown)"));
    if (!els.length) return;
    if (typeof IntersectionObserver === "undefined") { els.forEach((el) => el.classList.add("shown")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("shown"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
    // Hydration can finish after the reader has already scrolled: anything at or above the current viewport is shown
    // at once, otherwise it would never intersect and stay invisible. Only blocks still below the fold wait for a scroll.
    const fold = window.innerHeight;
    for (const el of els) { if (el.getBoundingClientRect().top < fold) el.classList.add("shown"); else io.observe(el); }
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
