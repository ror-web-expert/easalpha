// After a deploy, a page still open from the previous build asks for script chunks that are gone (a route it never
// opened, a part loaded on demand such as the camera scanner or the PDF export), and the app fails where it stands.
// One reload brings the new build. A mark in sessionStorage stops a chunk that fails again soon after (no signal, a
// broken deploy) from reloading the page over and over; the "new version" notice is the way out then. Review R30.

export const CHUNK_RELOAD_KEY = "easalpha.chunk-reload-at";
/** The automatic reload happens at most once in this long, per tab. */
export const CHUNK_RELOAD_GUARD_MS = 5 * 60_000;

/** A failed load of one of the app's script or style chunks, as webpack, the browser or a dynamic import reports it. */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = typeof err === "object" ? String((err as { name?: unknown }).name ?? "") : "";
  const message = typeof err === "string" ? err : typeof err === "object" ? String((err as { message?: unknown }).message ?? "") : "";
  return name === "ChunkLoadError"
    || /Loading (CSS )?chunk [\w./-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

/** A <script> or stylesheet <link> of the app's own build files that failed to load (a resource error, seen on window in the capture phase). */
export function isChunkResourceError(e: Event): boolean {
  const t = e.target;
  const url = t instanceof HTMLScriptElement ? t.src : t instanceof HTMLLinkElement && t.rel === "stylesheet" ? t.href : "";
  if (!url) return false;
  try { return new URL(url, window.location.href).pathname.startsWith("/_next/static/"); } catch { return false; }
}

/**
 * Reloads the page unless this tab already did so for a chunk in the last CHUNK_RELOAD_GUARD_MS, or the device is
 * offline (the reload would fail the same way). True when it reloaded.
 */
export function reloadForChunkError(opts: { storage?: Pick<Storage, "getItem" | "setItem">; now?: number; online?: boolean; reload?: () => void } = {}): boolean {
  const online = opts.online ?? (typeof navigator === "undefined" || navigator.onLine);
  if (!online) return false;
  const now = opts.now ?? Date.now();
  try {
    const storage = opts.storage ?? window.sessionStorage;
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (last > 0 && now - last < CHUNK_RELOAD_GUARD_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false; // without sessionStorage there is no loop guard, so no automatic reload
  }
  (opts.reload ?? (() => window.location.reload()))();
  return true;
}

/**
 * Calls `onChunkError` for every chunk failure the page sees: an error React or webpack reports on window (Next reports
 * an error no boundary caught there), a rejected promise nobody caught (an import() in a click handler), and a build
 * file's script or stylesheet that failed to load. Returns the unsubscribe.
 */
export function watchChunkErrors(onChunkError: () => void): () => void {
  const onError = (e: Event) => {
    if (e instanceof ErrorEvent ? isChunkLoadError(e.error ?? e.message) : isChunkResourceError(e)) onChunkError();
  };
  const onRejection = (e: PromiseRejectionEvent) => { if (isChunkLoadError(e.reason)) onChunkError(); };
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
