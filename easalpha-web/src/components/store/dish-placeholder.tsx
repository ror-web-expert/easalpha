"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Every menu row shows a picture: the product's own image, or this cloche mark in the storefront's theme colour on a soft
// tint when there is none. DishImage falls back to the placeholder on a load error so a broken-image icon never appears.

/** A plate under a cloche, drawn in `color`. Fills its 56x56 (or any square) box. */
export function DishPlaceholder({ color = "#10294d", className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg", className)}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* cloche */}
        <path d="M8 30a16 16 0 0 1 32 0" />
        <path d="M24 14v-3" />
        <circle cx="24" cy="9.5" r="1.8" fill="currentColor" stroke="none" />
        {/* plate */}
        <path d="M4 34h40" />
        <path d="M9 34c1 3 3.5 5 7 5h16c3.5 0 6-2 7-5" />
        {/* steam */}
        <path d="M18 24c0-2 2-2 2-4" opacity="0.55" />
        <path d="M24 23c0-2 2-2 2-4" opacity="0.55" />
      </svg>
    </span>
  );
}

/** The product image when it has one and loads; otherwise the placeholder. Same box either way. */
export function DishImage({ src, alt = "", color, className }: { src: string | null | undefined; alt?: string; color?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <DishPlaceholder color={color} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("h-14 w-14 shrink-0 rounded-lg object-cover", className)} />
  );
}
