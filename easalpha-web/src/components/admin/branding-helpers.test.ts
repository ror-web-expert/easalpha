import { describe, expect, it } from "vitest";
import type { SettingKey, SettingsResponse } from "@/lib/types";
import {
  brandingFor, effectiveLogo, EMPTY_RECEIPT_DRAFT, flattenSettings, identityDraftFrom, identityPatch, isImageUrl, normalizeHex, receiptDraftFrom, receiptValuesPatch,
  sampleReceipt, siteTitle, THEME_PRESETS,
} from "./branding-helpers";

const UPLOAD = "http://localhost:3001/api/v1/uploads/eyJfcmFpbHMiOnsiZGF0YSI6MX19--abc";

const key = (k: string, type: SettingKey["type"], value: unknown, group = "point_of_sale", screen = "Receipt Branding"): SettingKey => ({ key: k, group, screen, type, label: k, value, default: null });
const settings: SettingsResponse = {
  version: 7,
  groups: {
    point_of_sale: { name: "Point of Sale", screens: { "Receipt Branding": [
      key("pos.receipt.header", "string", "Thank you!"), key("pos.receipt.footer", "string", null), key("pos.receipt.show_logo", "boolean", false),
      key("pos.receipt.footer_qr_url", "string", "https://easalpha.com/store/karahi"), key("pos.receipt.paper", "string", "58"), key("pos.receipt.language", "string", "ur"),
    ], "Print Server": [key("pos.print_server.ip", "string", null)] } },
    store: { name: "Store", screens: { "Store Profile": [key("store.secondary_phone", "string", "042-111", "store", "Store Profile")] } },
  },
};

describe("isImageUrl", () => {
  it("accepts the API's absolute upload URLs, data URIs and site paths", () => {
    expect(isImageUrl(UPLOAD)).toBe(true);
    expect(isImageUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isImageUrl("data:image/png;base64,iVBOR")).toBe(true);
    expect(isImageUrl("/icon.svg")).toBe(true);
  });
  it("rejects blanks, bare keys and non-strings", () => {
    expect(isImageUrl("")).toBe(false);
    expect(isImageUrl("   ")).toBe(false);
    expect(isImageUrl("uploads/abc")).toBe(false);
    expect(isImageUrl("http://")).toBe(false);
    expect(isImageUrl(null)).toBe(false);
    expect(isImageUrl(undefined)).toBe(false);
    expect(isImageUrl(42)).toBe(false);
  });
});

describe("theme colour", () => {
  it("normalises hex and keeps the Website Config presets, navy first", () => {
    expect(normalizeHex("#10294D")).toBe("#10294d");
    expect(normalizeHex(" ff7a1a ")).toBe("#ff7a1a");
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("blue")).toBeNull();
    expect(THEME_PRESETS[0]).toBe("#10294d");
    expect(THEME_PRESETS).toHaveLength(8);
  });
});

describe("receipt draft", () => {
  it("reads the pos.receipt.* keys and the store secondary phone from any screen", () => {
    const keys = flattenSettings(settings);
    expect(keys.map((k) => k.key)).toContain("store.secondary_phone");
    expect(receiptDraftFrom(keys)).toEqual({ header: "Thank you!", footer: "", show_logo: false, footer_qr_url: "https://easalpha.com/store/karahi", paper: "58", language: "ur", secondary_phone: "042-111" });
  });
  it("falls back to defaults when the registry has no such key", () => {
    expect(receiptDraftFrom([])).toEqual(EMPTY_RECEIPT_DRAFT);
    expect(flattenSettings(undefined)).toEqual([]);
    expect(receiptDraftFrom([key("pos.receipt.paper", "string", "A4")]).paper).toBe("80");
  });
  it("patches only the changed keys, blank text as null, trimmed", () => {
    const original = receiptDraftFrom(flattenSettings(settings));
    expect(receiptValuesPatch(original, original)).toEqual({});
    const edited = { ...original, header: "  Shukriya  ", footer: "   ", show_logo: true, secondary_phone: "" };
    expect(receiptValuesPatch(original, edited)).toEqual({ "pos.receipt.header": "Shukriya", "pos.receipt.show_logo": true, "store.secondary_phone": null });
  });
  it("turns the draft into ReceiptView branding the way print.ts does at print time", () => {
    expect(brandingFor({ ...EMPTY_RECEIPT_DRAFT, paper: "58", show_logo: false, footer_qr_url: " https://x.y ", secondary_phone: " " }))
      .toEqual({ paper: "58", showLogo: false, footerQrUrl: "https://x.y", secondaryPhone: null });
  });
});

describe("sampleReceipt", () => {
  const draft = { ...EMPTY_RECEIPT_DRAFT, header: "Welcome\nEnjoy", footer: "Come again", paper: "58" as const };
  const r = sampleReceipt({ name: "Karahi House", legal_name: "KH (Pvt) Ltd", phone: "0300-1234567", logo_key: UPLOAD, currency: "PKR" }, draft);

  it("carries the business block, header, footer, paper and language from the inputs", () => {
    expect(r.business).toEqual({ name: "Karahi House", legal_name: "KH (Pvt) Ltd", phone: "0300-1234567", logo_key: UPLOAD, currency: "PKR" });
    expect(r.header).toBe("Welcome\nEnjoy");
    expect(r.footer).toBe("Come again");
    expect(r.paper).toBe("58");
    expect(r.language).toBe("en");
    expect(r.feedback_whatsapp).toBe("0300-1234567");
  });
  it("has items, tax and a cash payment that add up", () => {
    const linesTotal = r.lines.reduce((s, l) => s + l.line_total_minor, 0);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.totals.subtotal_minor).toBe(linesTotal);
    expect(r.totals.tax_lines[0]).toMatchObject({ rate: 16, inclusive: false, taxable_minor: linesTotal });
    expect(r.totals.total_minor).toBe(r.totals.subtotal_minor + r.totals.tax_minor);
    expect(r.payments).toHaveLength(1);
    expect(r.payments[0].method).toBe("cash");
    expect(r.payments[0].amount_minor).toBe(r.totals.total_minor);
    expect(r.payments[0].change_minor).toBe((r.payments[0].tendered_minor ?? 0) - r.totals.total_minor);
    expect(r.totals.due_minor).toBe(0);
    expect(r.duplicate).toBe(false);
  });
  it("blank header and footer become null, missing business fields default", () => {
    const plain = sampleReceipt({ name: "" }, EMPTY_RECEIPT_DRAFT, null);
    expect(plain.header).toBeNull();
    expect(plain.footer).toBeNull();
    expect(plain.business).toEqual({ name: "Your business", legal_name: null, phone: null, logo_key: null, currency: "PKR" });
    expect(plain.branch.name).toBe("Main branch");
  });
  it("uses the session branch when given", () => {
    const b = sampleReceipt({ name: "X" }, EMPTY_RECEIPT_DRAFT, { name: "DHA", address: "Y Block", city: "Lahore", phone: "042-999", tax_registration: { authority: "fbr", ntn: "1234567-8" } });
    expect(b.branch).toEqual({ name: "DHA", address: "Y Block", city: "Lahore", phone: "042-999", tax_registration: { authority: "fbr", ntn: "1234567-8" } });
  });
});

describe("website identity", () => {
  const sections = { identity: { name: "Karahi House", slug: "karahi", description: null, theme_color: "#10294D", logo_key: null, cover_key: UPLOAD, favicon_key: null }, pages: { menu: true } };

  it("reads the identity section as strings and ignores the slug", () => {
    expect(identityDraftFrom(sections)).toEqual({ name: "Karahi House", description: "", theme_color: "#10294D", logo_key: "", cover_key: UPLOAD, favicon_key: "" });
    expect(identityDraftFrom(undefined)).toEqual({ name: "", description: "", theme_color: "", logo_key: "", cover_key: "", favicon_key: "" });
  });
  it("returns null when nothing changed, including a re-cased theme colour", () => {
    const draft = identityDraftFrom(sections);
    expect(identityPatch(sections, draft)).toBeNull();
    expect(identityPatch(sections, { ...draft, theme_color: "#10294d" })).toBeNull();
  });
  it("sends only the changed keys, blanks as null, and normalises the colour", () => {
    const draft = identityDraftFrom(sections);
    expect(identityPatch(sections, { ...draft, description: " Family dining ", cover_key: "", theme_color: "FF7A1A", favicon_key: UPLOAD }))
      .toEqual({ description: "Family dining", theme_color: "#ff7a1a", cover_key: null, favicon_key: UPLOAD });
  });
  it("does not report a change when a blank field stays blank", () => {
    expect(identityPatch(sections, { ...identityDraftFrom(sections), logo_key: "   " })).toBeNull();
  });
});

describe("storefront fallbacks", () => {
  it("prefers the website logo, then the business logo, then nothing", () => {
    expect(effectiveLogo(UPLOAD, "http://x/biz.png")).toEqual({ src: UPLOAD, fallback: false });
    expect(effectiveLogo("", "http://x/biz.png")).toEqual({ src: "http://x/biz.png", fallback: true });
    expect(effectiveLogo(null, null)).toEqual({ src: null, fallback: false });
    expect(effectiveLogo("not a url", null)).toEqual({ src: null, fallback: false });
  });
  it("titles the tab with the site name, else the business name", () => {
    expect(siteTitle("Karahi House Online", "Karahi House")).toBe("Karahi House Online");
    expect(siteTitle("  ", "Karahi House")).toBe("Karahi House");
    expect(siteTitle(null, undefined)).toBe("Your storefront");
  });
});

describe("WhatsApp card", () => {
  it("reads the business phone and the storefront whatsapp section, button on by default", async () => {
    const { whatsappDraftFrom } = await import("./branding-helpers");
    expect(whatsappDraftFrom("+92 343 7172731", { whatsapp: { number: "+923437172731", greeting: "Salam!", button_label: "Order on WhatsApp" } })).toEqual({ phone: "+92 343 7172731", number: "+923437172731", greeting: "Salam!", show_button: true, button_label: "Order on WhatsApp" });
    expect(whatsappDraftFrom(null, { whatsapp: { show_button: false } })).toEqual({ phone: "", number: "", greeting: "", show_button: false, button_label: "" });
    expect(whatsappDraftFrom(undefined, undefined).show_button).toBe(true);
  });
  it("builds wa.me links from any Pakistani spelling and refuses junk", async () => {
    const { waDigits, waLink } = await import("./branding-helpers");
    expect(waDigits("0343 7172731")).toBe("923437172731");
    expect(waDigits("+92 343-7172731")).toBe("923437172731");
    expect(waDigits("0092 343 7172731")).toBe("923437172731");
    expect(waDigits("12")).toBeNull();
    expect(waLink("+923437172731", "Hi there")).toBe("https://wa.me/923437172731?text=Hi%20there");
    expect(waLink("+923437172731", "  ")).toBe("https://wa.me/923437172731");
    expect(waLink("", "Hi")).toBeNull();
  });
  it("splits changes between the business and the website section, blanks as null", async () => {
    const { whatsappPatch } = await import("./branding-helpers");
    const original = { phone: "+923437172731", number: "", greeting: "", show_button: true, button_label: "" };
    expect(whatsappPatch(original, original)).toEqual({ business: null, section: null });
    expect(whatsappPatch(original, { ...original, phone: " +923001112233 " })).toEqual({ business: { phone: "+923001112233" }, section: null });
    expect(whatsappPatch(original, { ...original, number: "+923437172731", greeting: "Salam", show_button: false })).toEqual({ business: null, section: { number: "+923437172731", greeting: "Salam", show_button: false } });
    expect(whatsappPatch({ ...original, number: "+92300" }, { ...original, number: "" })).toEqual({ business: null, section: { number: null } });
    expect(whatsappPatch(original, { ...original, button_label: " Order now " })).toEqual({ business: null, section: { button_label: "Order now" } });
  });
});
