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
