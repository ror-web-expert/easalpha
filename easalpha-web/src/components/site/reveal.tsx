"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fades a block in the first time it scrolls into view. CSS only; falls back to visible without IntersectionObserver. */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  // All three tags take the same props here, so one element type keeps the ref simple.
  const Tag = as as "div";
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={cn("transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none", shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0", className)}
    >
      {children}
    </Tag>
  );
}
