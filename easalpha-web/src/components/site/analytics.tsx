import { AnalyticsClient } from "./analytics-client";

export type AnalyticsConfig = { provider: "umami" | "plausible"; src: string; id: string };

/** Which tracker the public site loads, from the server's environment: ANALYTICS_PROVIDER (umami or plausible),
 *  ANALYTICS_ID (the Umami website id or the Plausible domain) and, for a self-hosted script, ANALYTICS_SRC.
 *  NEXT_PUBLIC_ variants baked in at build time work too. Nothing loads until a provider and an id are set. */
export function analyticsConfig(env: Record<string, string | undefined> = process.env): AnalyticsConfig | null {
  const provider = (env.ANALYTICS_PROVIDER || env.NEXT_PUBLIC_ANALYTICS_PROVIDER || "").trim().toLowerCase();
  const id = (env.ANALYTICS_ID || env.NEXT_PUBLIC_ANALYTICS_ID || "").trim();
  if ((provider !== "umami" && provider !== "plausible") || !id) return null;
  const src = (env.ANALYTICS_SRC || env.NEXT_PUBLIC_ANALYTICS_SRC || "").trim() || (provider === "umami" ? "https://cloud.umami.is/script.js" : "https://plausible.io/js/script.js");
  return { provider, src, id };
}

/** Loads the tracker (cookieless, no consent banner needed) from /api/analytics and listens for the funnel events. */
export function Analytics() {
  return <AnalyticsClient />;
}
