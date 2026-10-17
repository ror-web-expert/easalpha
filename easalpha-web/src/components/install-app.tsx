"use client";
import { Download, PlusSquare, Share, Smartphone } from "lucide-react";
import { useInstallPrompt } from "@/lib/install-prompt";
import { cn } from "@/lib/utils";

/** "Install the app" card for the rider app and the restaurant customer apps. Shows nothing once the page runs as an
 *  installed app or on a desktop browser; on Android it replays Chrome's install prompt, on iPhone it shows the Share,
 *  Add to Home Screen steps. Colours come from the caller so it fits the till's tokens and each restaurant's theme. */
export function InstallAppCard({ appName, text, className, buttonStyle, buttonClassName }: { appName: string; text: string; className?: string; buttonStyle?: React.CSSProperties; buttonClassName?: string }) {
  const { mode, prompt } = useInstallPrompt();
  if (mode === "installed" || mode === "none") return null;
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center", className)} data-install-card={mode}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink"><Smartphone className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="font-semibold text-heading">Install {appName}</div>
          {mode === "ios" ? (
            <p className="mt-1 text-sm text-fg-secondary">In Safari tap <Share className="inline h-4 w-4 align-[-3px]" aria-label="Share" /> Share, then <PlusSquare className="inline h-4 w-4 align-[-3px]" aria-label="Add to Home Screen" /> Add to Home Screen.</p>
          ) : mode === "android-manual" ? (
            <p className="mt-1 text-sm text-fg-secondary">Open the browser menu (three dots) and choose Install app or Add to Home screen.</p>
          ) : (
            <p className="mt-1 text-sm text-fg-secondary">{text}</p>
          )}
        </div>
      </div>
      {mode === "prompt" ? (
        <button type="button" onClick={() => { void prompt(); }} style={buttonStyle}
          className={cn("inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg", buttonClassName)}>
          <Download className="h-4 w-4" /> Install
        </button>
      ) : null}
    </div>
  );
}
