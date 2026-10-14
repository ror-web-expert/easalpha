"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Renders `to` in the server HTML (crawlers and anyone who sees the page before JavaScript runs get the real number),
 *  then counts up from 0 to `to` once when scrolled into view (1.2 s ease-out). Width is reserved so nothing shifts. */
export function Counter({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setValue(to); return; }
    let frame = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1200);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(to * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, [to]);
  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)} style={{ minWidth: `${String(to).length + suffix.length}ch` }} aria-label={`${to}${suffix}`}>
      {value}{suffix}
    </span>
  );
}
