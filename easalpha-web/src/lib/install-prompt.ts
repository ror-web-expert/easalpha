"use client";
// "Install this app" for the rider app and each restaurant's customer app. Chrome on Android fires
// beforeinstallprompt once the page is installable; the event is kept here (it can fire before React mounts, so the
// listener is attached when this module loads) and replayed when the rider or customer taps Install. iPhone has no
// prompt: the page shows the Share, Add to Home Screen steps instead.
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { installed = true; deferred = null; notify(); });
}

export type InstallMode = "installed" | "prompt" | "ios" | "android-manual" | "none";

/** What to offer: nothing once it runs as an app, the browser's prompt when there is one, the Share steps on an
 *  iPhone or iPad (Safari only; other iOS browsers cannot add to the home screen), a menu hint on Android otherwise. */
export function installMode(ua: string, standalone: boolean, hasPrompt: boolean, justInstalled = false): InstallMode {
  if (standalone || justInstalled) return "installed";
  if (hasPrompt) return "prompt";
  const s = ua.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(s) || (/macintosh/.test(s) && /mobile/.test(s));
  if (ios) return "ios";
  if (/android/.test(s)) return "android-manual";
  return "none";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const mode: InstallMode = mounted ? installMode(navigator.userAgent, isStandalone(), !!deferred, installed) : "none";
  const prompt = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    const e = deferred;
    deferred = null;
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") installed = true;
    notify();
    return choice.outcome;
  };
  return { mode, prompt };
}
