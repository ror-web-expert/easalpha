import Script from "next/script";
import { AnalyticsEvents } from "./analytics-events";

/** Which tracker the public site loads, from the server's environment (read at render time, so the server .env is
 *  enough; NEXT_PUBLIC_ values baked at build time also work). Nothing loads until a provider and an id are set. */
export function analyticsConfig(env: NodeJS.ProcessEnv = process.env): { provider: "umami" | "plausible"; src: string; id: string } | null {
  const provider = (env.ANALYTICS_PROVIDER || env.NEXT_PUBLIC_ANALYTICS_PROVIDER || "").trim().toLowerCase();
  const id = (env.ANALYTICS_ID || env.NEXT_PUBLIC_ANALYTICS_ID || "").trim();
  if ((provider !== "umami" && provider !== "plausible") || !id) return null;
  const src = (env.ANALYTICS_SRC || env.NEXT_PUBLIC_ANALYTICS_SRC || "").trim() || (provider === "umami" ? "https://cloud.umami.is/script.js" : "https://plausible.io/js/script.js");
  return { provider, src, id };
}

/** The tracker script (cookieless, no consent banner needed) plus the click listener for the funnel events. */
export function Analytics() {
  const cfg = analyticsConfig();
  return (
    <>
      {cfg?.provider === "umami" ? <Script src={cfg.src} data-website-id={cfg.id} strategy="afterInteractive" /> : null}
      {cfg?.provider === "plausible" ? <Script src={cfg.src} data-domain={cfg.id} strategy="afterInteractive" /> : null}
      <AnalyticsEvents />
    </>
  );
}
