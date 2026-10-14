// Cookieless analytics for the public site. The provider script (Umami or Plausible, picked by env in
// components/site/analytics.tsx) counts page views on its own; this module sends the funnel events and keeps a small
// in-page log (window.__easalphaEvents) so the wiring can be checked from the console without an account.

export type EventProps = Record<string, string | number | boolean>;

export type TrackedEvent = { name: string; props: EventProps; at: number };

export const EVENT_LOG_LIMIT = 50;

interface AnalyticsWindow extends Window {
  umami?: { track: (name: string, props?: EventProps) => void };
  plausible?: (name: string, options?: { props?: EventProps }) => void;
  __easalphaEvents?: TrackedEvent[];
}

/** Sends one event to whichever provider is loaded and records it in window.__easalphaEvents. Safe to call anywhere. */
export function track(name: string, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  const log = (w.__easalphaEvents ??= []);
  log.push({ name, props, at: Date.now() });
  if (log.length > EVENT_LOG_LIMIT) log.splice(0, log.length - EVENT_LOG_LIMIT);
  try {
    if (w.umami) w.umami.track(name, props);
    else if (w.plausible) w.plausible(name, { props });
  } catch {
    // a blocked or failed tracker must never break the page
  }
  if (process.env.NODE_ENV === "development") console.info(`[analytics] ${name}`, props);
}

/** Data attributes for a server-rendered element; the client listener in analytics-events.tsx reads them on click. */
export function trackAttrs(name: string, props: Record<string, string> = {}): Record<`data-track${string}`, string> {
  const out: Record<`data-track${string}`, string> = { "data-track": name };
  for (const [k, v] of Object.entries(props)) out[`data-track-${k}`] = v;
  return out;
}

/** The event and properties encoded on an element by trackAttrs. */
export function eventFromDataset(dataset: DOMStringMap): { name: string; props: EventProps } | null {
  const name = dataset.track;
  if (!name) return null;
  const props: EventProps = {};
  for (const [k, v] of Object.entries(dataset)) {
    if (k === "track" || !k.startsWith("track") || v === undefined) continue;
    // dataset turns data-track-where into trackWhere; give back "where"
    const key = k.slice("track".length);
    props[key.charAt(0).toLowerCase() + key.slice(1)] = v;
  }
  return { name, props };
}
