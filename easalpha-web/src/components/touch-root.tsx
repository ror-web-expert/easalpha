"use client";
import { useEffect } from "react";

/** Marks the document as a touch screen (globals.css: touch-ui) while this subtree is mounted: no pull-to-refresh, no
 *  bounce, no text selection on long press. The till does the same in its own root. */
export function TouchRoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("touch-ui-root");
    return () => document.documentElement.classList.remove("touch-ui-root");
  }, []);
  return <div className="touch-ui h-dvh overflow-y-auto overscroll-none">{children}</div>;
}
