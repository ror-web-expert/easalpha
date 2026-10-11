"use client";
import { createElement } from "react";
import { cn } from "@/lib/utils";
import { useLangStore } from "./lang-store";
import { t, type UiKey } from "./site-helpers";

const URDU_FONT = { fontFamily: '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Roboto", system-ui, sans-serif' };

/** Renders a dictionary string in the chosen language. Urdu gets dir="rtl", lang="ur" and a Nastaliq fallback font. */
export function Txt({ k, as = "span", className, children }: { k: UiKey; as?: keyof React.JSX.IntrinsicElements; className?: string; children?: React.ReactNode }) {
  const lang = useLangStore((s) => s.lang);
  const ur = lang === "ur";
  return createElement(as, { lang, dir: ur ? "rtl" : undefined, style: ur ? URDU_FONT : undefined, className: cn(ur && "leading-[1.9]", className) }, t(k, lang), children);
}

/** Switches direction and language on a wrapper without changing the text. */
export function LangBox({ as = "div", className, children }: { as?: keyof React.JSX.IntrinsicElements; className?: string; children: React.ReactNode }) {
  const lang = useLangStore((s) => s.lang);
  const ur = lang === "ur";
  return createElement(as, { lang, dir: ur ? "rtl" : undefined, style: ur ? URDU_FONT : undefined, className }, children);
}
