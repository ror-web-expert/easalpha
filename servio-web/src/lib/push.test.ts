import { describe, expect, it } from "vitest";
import { browserLabel, derivePushState, resolveNotificationUrl, urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url without padding into the original bytes", () => {
    // "hello?" in standard base64 is aGVsbG8/ ; base64url swaps / for _ and drops padding
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8_"))).toEqual([104, 101, 108, 108, 111, 63]);
  });
  it("handles - and lengths that need one or two padding characters", () => {
    expect(Array.from(urlBase64ToUint8Array("-w"))).toEqual([251]);
    expect(Array.from(urlBase64ToUint8Array("AQI"))).toEqual([1, 2]);
    expect(urlBase64ToUint8Array("").length).toBe(0);
  });
  it("returns a Uint8Array backed by an ArrayBuffer so PushManager.subscribe accepts it", () => {
    const out = urlBase64ToUint8Array("BA");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("derivePushState", () => {
  it("is unsupported whatever the permission when the browser lacks push", () => {
    expect(derivePushState(false, "granted", true)).toBe("unsupported");
  });
  it("is denied once the user blocked notifications, even with a stale subscription", () => {
    expect(derivePushState(true, "denied", true)).toBe("denied");
  });
  it("is prompt before the user has been asked", () => {
    expect(derivePushState(true, "default", false)).toBe("prompt");
  });
  it("splits granted into subscribed and unsubscribed by the browser subscription", () => {
    expect(derivePushState(true, "granted", true)).toBe("subscribed");
    expect(derivePushState(true, "granted", false)).toBe("unsubscribed");
  });
});

describe("resolveNotificationUrl", () => {
  const origin = "https://till.easalpha.com";
  it("resolves a relative path against the app origin", () => {
    expect(resolveNotificationUrl("/admin/orders?status=placed", origin)).toBe("https://till.easalpha.com/admin/orders?status=placed");
  });
  it("keeps an absolute url on the same origin", () => {
    expect(resolveNotificationUrl("https://till.easalpha.com/kitchen", origin)).toBe("https://till.easalpha.com/kitchen");
  });
  it("falls back to the home page for a missing, broken or foreign url", () => {
    expect(resolveNotificationUrl(null, origin)).toBe("https://till.easalpha.com/");
    expect(resolveNotificationUrl("", origin)).toBe("https://till.easalpha.com/");
    expect(resolveNotificationUrl("https://evil.example/phish", origin)).toBe("https://till.easalpha.com/");
    expect(resolveNotificationUrl("http://[bad", origin)).toBe("https://till.easalpha.com/");
  });
});

describe("browserLabel", () => {
  it("names the browser and the platform from a user agent", () => {
    expect(browserLabel("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(browserLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox on Windows");
    expect(browserLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe("Safari on Mac");
    expect(browserLabel(null)).toBe("Unknown browser");
  });
});
