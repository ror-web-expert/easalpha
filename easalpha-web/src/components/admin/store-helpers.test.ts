import { describe, expect, it } from "vitest";
import { CURRENCIES, currencyOptions, isTimeZone, taxRegistrationPayload, timeZoneOptions } from "./store-helpers";

describe("taxRegistrationPayload", () => {
  const f = { authority: "pra", ntn: " 1234567-8 ", strn: "", pos_id: "POS-77", token: "", token_clear: false };
  it("sends the numbers, and the token only when a new one was typed (S1: the API never sends it back)", () => {
    expect(taxRegistrationPayload(f)).toEqual({ authority: "pra", ntn: "1234567-8", strn: "", pos_id: "POS-77" });
    expect(taxRegistrationPayload({ ...f, token: " NEW-TOKEN " })).toMatchObject({ token: "NEW-TOKEN" });
  });
  it("asks the API to remove the saved token, and then sends no token at all", () => {
    expect(taxRegistrationPayload({ ...f, token: "typed", token_clear: true })).toEqual({ authority: "pra", ntn: "1234567-8", strn: "", pos_id: "POS-77", token_clear: true });
  });
});

describe("time zones and currencies (S14)", () => {
  it("accepts zone names a browser knows and refuses a country name", () => {
    expect(isTimeZone("Asia/Karachi")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Pakistan")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
  it("lists the zones with the current value, even an odd one, so opening the form changes nothing", () => {
    const zones = timeZoneOptions("Asia/Karachi");
    expect(zones).toContain("Asia/Karachi");
    expect(zones).toContain("UTC");
    expect(timeZoneOptions("Pakistan")).toContain("Pakistan");
  });
  it("offers every sign-up country's currency, Pakistan's first", () => {
    expect(CURRENCIES[0]).toBe("PKR");
    expect(CURRENCIES).toEqual(expect.arrayContaining(["AED", "SAR", "USD", "GBP", "EUR", "INR", "BDT"]));
    expect(CURRENCIES.length).toBeGreaterThan(5);
    expect(currencyOptions("XOF")).toContain("XOF");
  });
});
