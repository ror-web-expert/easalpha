import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_LOG_LIMIT, eventFromDataset, track, trackAttrs } from "./analytics";

type W = Window & { umami?: { track: (n: string, p?: unknown) => void }; plausible?: (n: string, o?: unknown) => void; __easalphaEvents?: unknown[] };
const w = window as W;

afterEach(() => { delete w.umami; delete w.plausible; delete w.__easalphaEvents; });

describe("analytics", () => {
  it("logs every event in the page and hands it to Umami when loaded", () => {
    const umami = { track: vi.fn() };
    w.umami = umami;
    track("cta_start_free_click", { where: "hero" });
    expect(umami.track).toHaveBeenCalledWith("cta_start_free_click", { where: "hero" });
    expect(w.__easalphaEvents).toHaveLength(1);
    expect(w.__easalphaEvents?.[0]).toMatchObject({ name: "cta_start_free_click", props: { where: "hero" } });
  });

  it("uses Plausible's call shape when that is the loaded provider", () => {
    const plausible = vi.fn();
    w.plausible = plausible;
    track("pricing_toggle", { billing: "yearly", currency: "USD" });
    expect(plausible).toHaveBeenCalledWith("pricing_toggle", { props: { billing: "yearly", currency: "USD" } });
  });

  it("keeps the in-page log bounded and survives a failing tracker", () => {
    w.umami = { track: () => { throw new Error("blocked"); } };
    for (let i = 0; i < EVENT_LOG_LIMIT + 5; i++) track("faq_open", { question: `q${i}` });
    expect(w.__easalphaEvents).toHaveLength(EVENT_LOG_LIMIT);
    expect((w.__easalphaEvents?.[0] as { props: { question: string } }).props.question).toBe("q5");
  });

  it("round-trips an element's data attributes", () => {
    const attrs = trackAttrs("cta_start_free_click", { where: "pricing_pro" });
    expect(attrs).toEqual({ "data-track": "cta_start_free_click", "data-track-where": "pricing_pro" });
    const el = document.createElement("a");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    expect(eventFromDataset(el.dataset)).toEqual({ name: "cta_start_free_click", props: { where: "pricing_pro" } });
    expect(eventFromDataset(document.createElement("a").dataset)).toBeNull();
  });
});

describe("analytics loader", () => {
  it("reads the provider from the environment and defaults the script URL", async () => {
    const { analyticsConfig } = await import("@/components/site/analytics");
    expect(analyticsConfig({})).toBeNull();
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "umami" })).toBeNull();
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "Umami", ANALYTICS_ID: " abc " })).toEqual({ provider: "umami", src: "https://cloud.umami.is/script.js", id: "abc" });
    expect(analyticsConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible", NEXT_PUBLIC_ANALYTICS_ID: "easalpha.com", ANALYTICS_SRC: "https://stats.example.com/js/script.js" })).toEqual({ provider: "plausible", src: "https://stats.example.com/js/script.js", id: "easalpha.com" });
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "ga4", ANALYTICS_ID: "G-1" })).toBeNull();
  });

  it("adds the tracker script once with the provider's attribute", async () => {
    const { loadTracker } = await import("@/components/site/analytics-client");
    document.head.querySelectorAll("script").forEach((s) => s.remove());
    expect(loadTracker(null)).toBe(false);
    expect(loadTracker({ provider: "umami", src: "https://cloud.umami.is/script.js", id: "site-1" })).toBe(true);
    const s = document.head.querySelector("script[data-easalpha-analytics]");
    expect(s?.getAttribute("data-website-id")).toBe("site-1");
    expect(s?.getAttribute("src")).toBe("https://cloud.umami.is/script.js");
    expect(loadTracker({ provider: "umami", src: "https://cloud.umami.is/script.js", id: "site-1" })).toBe(false);
    expect(document.head.querySelectorAll("script[data-easalpha-analytics]")).toHaveLength(1);
  });
});
