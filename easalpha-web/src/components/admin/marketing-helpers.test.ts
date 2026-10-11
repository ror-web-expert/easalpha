import { describe, expect, it } from "vitest";
import {
  averageRatingLabel, balanceLabel, balanceVariant, bestTier, daysSinceLastOrder, discountValueLabel, insertVariable, listToText, ratingWord, readableOn, renderTemplate,
  slugify, sortTiers, templateVariables, textToList, unknownVariables, voucherBatchState, voucherExpiryLabel, voucherStatusLabel, voucherTerms, websiteFieldLabel, websiteFieldType,
  websiteSectionLabel, withinDaysLabel,
} from "./marketing-helpers";

const now = new Date("2026-10-11T12:00:00");

describe("balance label", () => {
  it("reads Settled at zero and To Receive when the customer owes", () => {
    expect(balanceLabel(0)).toBe("Settled");
    expect(balanceLabel(null)).toBe("Settled");
    expect(balanceLabel(12500)).toBe("To Receive");
  });
  it("reads In credit when the customer paid ahead", () => {
    expect(balanceLabel(-500)).toBe("In credit");
    expect(balanceVariant(-500)).toBe("info");
    expect(balanceVariant(500)).toBe("warning");
    expect(balanceVariant(0)).toBe("success");
  });
});

const tier = (id: string, within_days: number, extra: Partial<{ active: boolean; excluded_order_types: string[] }> = {}) =>
  ({ id, name: id, within_days, kind: "percent" as const, value: 10, min_order_minor: 0, excluded_product_ids: [], excluded_category_ids: [], excluded_order_types: [], active: true, ...extra });

describe("regular discount tiers", () => {
  it("sorts by window, smallest first", () => {
    expect(sortTiers([tier("week", 7), tier("day", 1), tier("month", 30)]).map((t) => t.id)).toEqual(["day", "week", "month"]);
  });
  it("picks the smallest window the customer falls inside", () => {
    const tiers = [tier("week", 7), tier("day", 1), tier("month", 30)];
    expect(bestTier(tiers, 0)?.id).toBe("day");
    expect(bestTier(tiers, 1)?.id).toBe("day");
    expect(bestTier(tiers, 2)?.id).toBe("week");
    expect(bestTier(tiers, 20)?.id).toBe("month");
    expect(bestTier(tiers, 45)).toBeNull();
  });
  it("gives nothing to customers who never ordered or are blocked", () => {
    expect(bestTier([tier("day", 1)], null)).toBeNull();
    expect(bestTier([tier("day", 1)], 0, { blocked: true })).toBeNull();
  });
  it("skips tiers that exclude the order type and inactive tiers", () => {
    const tiers = [tier("day", 1, { excluded_order_types: ["delivery"] }), tier("week", 7)];
    expect(bestTier(tiers, 0, { orderType: "delivery" })?.id).toBe("week");
    expect(bestTier([tier("day", 1, { active: false }), tier("week", 7)], 0)?.id).toBe("week");
  });
  it("counts whole days since the last order", () => {
    expect(daysSinceLastOrder("2026-10-10T13:00:00", now)).toBe(0);
    expect(daysSinceLastOrder("2026-10-09T11:00:00", now)).toBe(2);
    expect(daysSinceLastOrder(null, now)).toBeNull();
  });
  it("labels values and windows", () => {
    expect(discountValueLabel("percent", 10)).toBe("10%");
    expect(discountValueLabel("percent", 12.5)).toBe("12.5%");
    expect(discountValueLabel("fixed", 150)).toBe("Rs 150");
    expect(withinDaysLabel(1)).toBe("Within 1 day");
    expect(withinDaysLabel(7)).toBe("Within 7 days");
  });
});

describe("vouchers", () => {
  it("reads the batch state in API order", () => {
    expect(voucherBatchState({ active: true, expired: false, exhausted: false }).label).toBe("Active");
    expect(voucherBatchState({ active: true, expired: true, exhausted: false }).label).toBe("Expired");
    expect(voucherBatchState({ active: true, expired: false, exhausted: true }).label).toBe("Used up");
    expect(voucherBatchState({ active: false, expired: true, exhausted: true }).label).toBe("Inactive");
  });
  it("labels expiry against today", () => {
    expect(voucherExpiryLabel(null, now)).toBe("No expiry");
    expect(voucherExpiryLabel("2026-10-11", now)).toBe("Expires today");
    expect(voucherExpiryLabel("2026-12-31", now)).toBe("Expires 31 Dec 2026");
    expect(voucherExpiryLabel("2026-10-01", now)).toBe("Expired 1 Oct 2026");
  });
  it("labels voucher status and terms", () => {
    expect(voucherStatusLabel("issued")).toBe("Issued");
    expect(voucherStatusLabel("redeemed")).toBe("Redeemed");
    expect(voucherTerms({ value_kind: "percent", value: 20, min_spend_minor: 100000 })).toBe("20% off, minimum spend Rs 1,000");
    expect(voucherTerms({ value_kind: "fixed", value: 500, min_spend_minor: 0 })).toBe("Rs 500 off");
  });
});

describe("reviews", () => {
  it("shows the rating as a word", () => {
    expect(ratingWord(1)).toBe("Poor");
    expect(ratingWord(3)).toBe("Good");
    expect(ratingWord(5)).toBe("Excellent");
    expect(ratingWord(null)).toBe("Pending");
  });
  it("formats the average", () => {
    expect(averageRatingLabel(4.25)).toBe("4.3");
    expect(averageRatingLabel(null)).toBe("-");
  });
});

describe("whatsapp templates", () => {
  it("renders {variables} and {{variables}}", () => {
    expect(renderTemplate("{business_name}: {customer_name} owes Rs {{new_balance}}.", { business_name: "Cafe", customer_name: "Ali", new_balance: 1200 })).toBe("Cafe: Ali owes Rs 1200.");
  });
  it("leaves unknown names visible and blanks null values", () => {
    expect(renderTemplate("Hi {customer_name}, {unknown}", { customer_name: null })).toBe("Hi , {unknown}");
  });
  it("lists variables once, in order of use", () => {
    expect(templateVariables("{a} and {b} then {{a}}")).toEqual(["a", "b"]);
    expect(unknownVariables("{customer_name} {foo}", ["customer_name"])).toEqual(["foo"]);
  });
  it("inserts a variable at the caret", () => {
    expect(insertVariable("Hello ", 6, "customer_name")).toEqual({ text: "Hello {customer_name}", caret: 21 });
    expect(insertVariable("ab", 99, "x").text).toBe("ab{x}");
  });
});

describe("website config fields", () => {
  it("types fields from the key name before the value", () => {
    expect(websiteFieldType("identity", "theme_color", "#1976d2")).toBe("color");
    expect(websiteFieldType("delivery", "min_order_minor", 0)).toBe("money");
    expect(websiteFieldType("delivery", "free_above_minor", null)).toBe("money");
    expect(websiteFieldType("identity", "logo_key", null)).toBe("image");
    expect(websiteFieldType("mobile_app", "android_url", null)).toBe("url");
    expect(websiteFieldType("social", "facebook", null)).toBe("url");
    expect(websiteFieldType("location", "lat", null)).toBe("number");
    expect(websiteFieldType("identity", "description", null)).toBe("textarea");
    expect(websiteFieldType("contact", "email", null)).toBe("email");
    expect(websiteFieldType("whatsapp", "number", null)).toBe("phone");
  });
  it("types the rest from the value", () => {
    expect(websiteFieldType("pages", "home", true)).toBe("switch");
    expect(websiteFieldType("seo", "keywords", [])).toBe("list");
    expect(websiteFieldType("delivery", "eta_minutes", 45)).toBe("number");
    expect(websiteFieldType("system", "analytics_id", null)).toBe("text");
  });
  it("labels keys and sections plainly", () => {
    expect(websiteFieldLabel("theme_color")).toBe("Theme colour");
    expect(websiteFieldLabel("free_above_minor")).toBe("Free above");
    expect(websiteFieldLabel("android_url")).toBe("Android URL");
    expect(websiteSectionLabel("signups")).toBe("Customer Sign-ups");
    expect(websiteSectionLabel("made_up")).toBe("Made Up");
  });
  it("round-trips lists one item per line, objects as JSON", () => {
    expect(listToText(["a", { label: "Menu", url: "/menu" }])).toBe('a\n{"label":"Menu","url":"/menu"}');
    expect(textToList('a\n\n{"label":"Menu","url":"/menu"}\n')).toEqual(["a", { label: "Menu", url: "/menu" }]);
  });
  it("slugs and picks readable text colours", () => {
    expect(slugify("Lahore Grill House!")).toBe("lahore-grill-house");
    expect(readableOn("#1976d2")).toBe("#ffffff");
    expect(readableOn("#ffeb3b")).toBe("#191c23");
    expect(readableOn("nope")).toBe("#ffffff");
  });
});
