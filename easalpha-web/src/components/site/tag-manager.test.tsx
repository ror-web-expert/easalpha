import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { track } from "@/lib/analytics";
import { GTM_ID, TagManager, validGtmId } from "./tag-manager";

vi.mock("next/script", () => ({ default: ({ id, children }: { id: string; children: string }) => <script data-testid={id}>{children}</script> }));

type W = Window & { dataLayer?: Record<string, unknown>[]; __easalphaEvents?: unknown[] };
const w = window as W;
afterEach(() => { delete w.dataLayer; delete w.__easalphaEvents; });

describe("Google Tag Manager (public site)", () => {
  it("uses the EasAlpha container and accepts only well-formed ids", () => {
    expect(GTM_ID).toBe("GTM-MQ8PKZS2");
    expect(validGtmId("GTM-MQ8PKZS2")).toBe(true);
    expect(validGtmId("GTM-1');alert(1)//")).toBe(false);
    expect(validGtmId("")).toBe(false);
  });

  it("renders Google's loader with the container id and the no-JavaScript iframe", () => {
    const { container, getByTestId } = render(<TagManager />);
    expect(getByTestId("google-tag-manager").textContent).toContain("'dataLayer','GTM-MQ8PKZS2'");
    expect(getByTestId("google-tag-manager").textContent).toContain("https://www.googletagmanager.com/gtm.js?id=");
    expect(container.querySelector("noscript")).not.toBeNull();
  });

  it("renders nothing for a malformed id", () => {
    const { container } = render(<TagManager id="not-a-container" />);
    expect(container.innerHTML).toBe("");
  });

  it("passes the site's own events to Tag Manager once it has loaded", () => {
    track("cta_start_free_click", { where: "hero" });
    expect(w.dataLayer).toBeUndefined(); // no Tag Manager on this page: nothing created
    w.dataLayer = [];
    track("signup_submit", { plan: "pro" });
    expect(w.dataLayer).toEqual([{ event: "signup_submit", plan: "pro" }]);
  });
});
