import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import {
  barcodeFormat, createScanDetector, eanCheckDigit, equivalentCodes, explainCapture, findBarcode, guessAffixes, isValidEan, judgeBurst, looksLikeBadEan,
  packQuantity, parseScaleLabel, scannerConfig, visibleKey, visibleText, withCheckDigit, type DetectorConfig, type KeyStroke, type ScaleConfig,
} from "./barcode";

const base: DetectorConfig = { prefix: "", suffix: "", terminator: "enter", minLength: 4, maxKeyIntervalMs: 50 };

/** Keys typed `gap` ms apart starting at `start`; returns every non-null result. */
function type(detector: ReturnType<typeof createScanDetector>, keys: string[], gap = 10, start = 1000) {
  const out = [];
  let t = start;
  for (const key of keys) {
    const r = detector.feed({ key, time: t });
    if (r) out.push(r);
    t += gap;
  }
  return { results: out, last: t - gap };
}
const chars = (s: string) => [...s];

describe("scannerConfig", () => {
  it("uses the registry defaults when nothing is set", () => {
    const c = scannerConfig({});
    expect(c).toMatchObject({ enabled: false, prefix: "", suffix: "", terminator: "enter", minLength: 4, maxKeyIntervalMs: 50, beep: true, camera: true, unknownCode: "ask" });
    expect(c.scale).toEqual({ enabled: false, prefixes: ["21", "22"], itemDigits: 5, value: "weight", decimals: 3 });
    expect(scannerConfig(undefined).enabled).toBe(false);
  });

  it("reads the till settings keys and clamps silly numbers", () => {
    const c = scannerConfig({
      "pos.barcode_scanning.enabled": true, "pos.barcode_scanning.prefix": "]E0", "pos.barcode_scanning.suffix": "#", "pos.barcode_scanning.terminator": "tab",
      "pos.barcode_scanning.min_length": 0, "pos.barcode_scanning.max_key_interval_ms": "80", "pos.barcode_scanning.beep": false, "pos.barcode_scanning.camera": "false",
      "pos.barcode_scanning.unknown_code": "ignore", "pos.barcode_scanning.scale_barcodes": true, "pos.barcode_scanning.scale_prefixes": " 20, 21 ,x, 29",
      "pos.barcode_scanning.scale_item_digits": 4, "pos.barcode_scanning.scale_value": "price", "pos.barcode_scanning.scale_decimals": 9,
    });
    expect(c).toMatchObject({ enabled: true, prefix: "]E0", suffix: "#", terminator: "tab", minLength: 1, maxKeyIntervalMs: 80, beep: false, camera: false, unknownCode: "ignore" });
    expect(c.scale).toEqual({ enabled: true, prefixes: ["20", "21", "29"], itemDigits: 4, value: "price", decimals: 6 });
  });

  it("falls back to enter for an unknown terminator", () => {
    expect(scannerConfig({ "pos.barcode_scanning.terminator": "space" }).terminator).toBe("enter");
    expect(scannerConfig({ "pos.barcode_scanning.terminator": "none" }).terminator).toBe("none");
  });
});

describe("scan detector", () => {
  it("turns a fast burst ending in Enter into a scan", () => {
    const d = createScanDetector(base);
    const { results } = type(d, [...chars("8964000123456"), "Enter"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ok: true, code: "8964000123456" });
    expect(results[0].burst).toMatchObject({ raw: "8964000123456", keys: 13, end: "enter", startedAt: 1000, endedAt: 1130 });
    expect(results[0].burst.gaps).toEqual(Array(12).fill(10));
    expect(d.length).toBe(0);
  });

  it("ignores a person typing slowly, Enter included", () => {
    const d = createScanDetector(base);
    const { results } = type(d, [...chars("1234"), "Enter"], 150);
    expect(results).toEqual([]);
  });

  it("treats a burst shorter than min_length as typing", () => {
    const d = createScanDetector(base);
    const [r] = type(d, [...chars("123"), "Enter"]).results;
    expect(r).toMatchObject({ ok: false, reason: "too_short", code: "123" });
  });

  it("never reports a single character", () => {
    const d = createScanDetector({ ...base, minLength: 1 });
    expect(type(d, ["7", "Enter"]).results).toEqual([]);
  });

  it("accepts exactly min_length characters", () => {
    const d = createScanDetector(base);
    expect(type(d, [...chars("1234"), "Enter"]).results[0]).toMatchObject({ ok: true, code: "1234" });
  });

  it("strips the prefix and suffix", () => {
    const d = createScanDetector({ ...base, prefix: "]E0", suffix: "*" });
    const [r] = type(d, [...chars("]E04006381333931*"), "Enter"]).results;
    expect(r).toMatchObject({ ok: true, code: "4006381333931" });
    expect(r.burst.raw).toBe("]E04006381333931*");
  });

  it("rejects a burst without the configured prefix or suffix", () => {
    const d = createScanDetector({ ...base, prefix: "]E0", suffix: "*" });
    expect(type(d, [...chars("4006381333931*"), "Enter"]).results[0]).toMatchObject({ ok: false, reason: "missing_prefix" });
    expect(type(d, [...chars("]E04006381333931"), "Enter"], 10, 5000).results[0]).toMatchObject({ ok: false, reason: "missing_suffix", code: "4006381333931" });
  });

  it("checks min_length after the prefix and suffix are removed", () => {
    const d = createScanDetector({ ...base, prefix: "AB", minLength: 4 });
    expect(type(d, [...chars("AB123"), "Enter"]).results[0]).toMatchObject({ ok: false, reason: "too_short", code: "123" });
  });

  it("ignores Shift between characters (capital letters)", () => {
    const d = createScanDetector(base);
    const [r] = type(d, ["Shift", "A", "Shift", "B", "-", "1", "2", "Enter"]).results;
    expect(r).toMatchObject({ ok: true, code: "AB-12" });
  });

  it("uses Tab when that is the terminator, and flags the other key as the wrong one", () => {
    const tab = createScanDetector({ ...base, terminator: "tab" });
    expect(type(tab, [...chars("12345678"), "Tab"]).results[0]).toMatchObject({ ok: true, code: "12345678" });
    expect(type(tab, [...chars("12345678"), "Enter"], 10, 9000).results[0]).toMatchObject({ ok: false, reason: "wrong_terminator" });
    const enter = createScanDetector(base);
    expect(type(enter, [...chars("12345678"), "Tab"]).results[0]).toMatchObject({ ok: false, reason: "wrong_terminator", burst: { end: "tab" } });
  });

  it("flags a fast burst that stops without the terminator", () => {
    const d = createScanDetector(base);
    type(d, chars("12345678"));
    expect(d.flush(1070 + 40)).toBeNull(); // still within the interval
    expect(d.flush(1070 + 51)).toMatchObject({ ok: false, reason: "no_terminator", code: "12345678", burst: { end: "pause" } });
  });

  it("with terminator none, a pause ends the scan (flush or the next key)", () => {
    const d = createScanDetector({ ...base, terminator: "none" });
    type(d, chars("12345678"));
    expect(d.flush(1200)).toMatchObject({ ok: true, code: "12345678", burst: { end: "pause", endedAt: 1070 } });
    expect(d.length).toBe(0);
    // No flush: the next slow key reports the finished burst and starts a new one.
    type(d, chars("87654321"), 10, 2000);
    const r = d.feed({ key: "x", time: 2500 });
    expect(r).toMatchObject({ ok: true, code: "87654321" });
    expect(d.length).toBe(1);
  });

  it("with terminator none, a fast Enter also ends the scan", () => {
    const d = createScanDetector({ ...base, terminator: "none" });
    expect(type(d, [...chars("12345678"), "Enter"]).results[0]).toMatchObject({ ok: true, code: "12345678", burst: { end: "enter" } });
  });

  it("does not take a slow Enter after a scan as its terminator", () => {
    const d = createScanDetector(base);
    type(d, chars("12345678"));
    const r = d.feed({ key: "Enter", time: 1070 + 200 });
    expect(r).toMatchObject({ ok: false, reason: "no_terminator", burst: { end: "pause", endedAt: 1070 } });
  });

  it("starts a new burst after a pause, so typing before a scan is not part of it", () => {
    const d = createScanDetector(base);
    const strokes: KeyStroke[] = [{ key: "a", time: 0 }, { key: "b", time: 300 }];
    strokes.forEach((s) => d.feed(s));
    const { results } = type(d, [...chars("12345678"), "Enter"], 8, 900);
    expect(results).toEqual([expect.objectContaining({ ok: true, code: "12345678" })]);
  });

  it("drops the burst on another named key (arrows, Backspace)", () => {
    const d = createScanDetector(base);
    const { results } = type(d, [...chars("1234"), "Backspace", ...chars("56"), "Enter"]);
    // Backspace dropped "1234"; "56" is a fresh burst, too short to be a scan.
    expect(results).toEqual([expect.objectContaining({ ok: false, reason: "too_short", code: "56" })]);
    expect(type(d, [...chars("1234"), "ArrowDown", ...chars("567890"), "Enter"], 10, 5000).results[0]).toMatchObject({ ok: true, code: "567890" });
  });

  it("measures the gaps between keys", () => {
    const d = createScanDetector(base);
    [0, 12, 20, 45, 60].forEach((t, i) => d.feed({ key: String(i), time: t }));
    const r = d.feed({ key: "Enter", time: 70 });
    expect(r?.burst.gaps).toEqual([12, 8, 25, 15]);
  });

  it("reset forgets a half-read burst", () => {
    const d = createScanDetector(base);
    type(d, chars("1234"));
    d.reset();
    expect(d.length).toBe(0);
    expect(d.feed({ key: "Enter", time: 1035 })).toBeNull();
  });

  it("judgeBurst trims spaces around the code", () => {
    expect(judgeBurst({ raw: " 12345 ", keys: 7, gaps: [], end: "enter", startedAt: 0, endedAt: 1 }, base)).toMatchObject({ ok: true, code: "12345" });
  });
});

describe("guessAffixes and visible keys", () => {
  it("finds the EAN inside a burst and calls the rest prefix and suffix", () => {
    expect(guessAffixes("]E04006381333931")).toEqual({ prefix: "]E0", code: "4006381333931", suffix: "" });
    expect(guessAffixes("*4006381333931#")).toEqual({ prefix: "*", code: "4006381333931", suffix: "#" });
    expect(guessAffixes("AB96385074CD")).toEqual({ prefix: "AB", code: "96385074", suffix: "CD" });
  });

  it("falls back to symbols at either end", () => {
    expect(guessAffixes("$ABC-123%")).toEqual({ prefix: "$", code: "ABC-123", suffix: "%" });
    expect(guessAffixes("ABC123")).toEqual({ prefix: "", code: "ABC123", suffix: "" });
  });

  it("makes control characters and named keys visible", () => {
    expect(visibleKey("Enter")).toEqual({ text: "⏎ Enter", control: true });
    expect(visibleKey("Tab")).toEqual({ text: "⇥ Tab", control: true });
    expect(visibleKey("\u0002")).toEqual({ text: "␂", control: true });
    expect(visibleKey("\u001d")).toEqual({ text: "␝", control: true });
    expect(visibleKey(" ")).toEqual({ text: "␠", control: true });
    expect(visibleKey("Unidentified")).toEqual({ text: "Unidentified", control: true });
    expect(visibleKey("7")).toEqual({ text: "7", control: false });
    expect(visibleText("\u000201234\u0003")).toBe("␂01234␃");
  });
});

describe("check digits and formats", () => {
  it("computes EAN/UPC check digits", () => {
    expect(eanCheckDigit("400638133393")).toBe(1);
    expect(eanCheckDigit("03600029145")).toBe(2);
    expect(eanCheckDigit("9638507")).toBe(4);
    expect(withCheckDigit("200000000001")).toBe("2000000000015");
  });

  it("validates EAN-13, UPC-A and EAN-8", () => {
    expect(isValidEan("4006381333931")).toBe(true);
    expect(isValidEan("4006381333932")).toBe(false);
    expect(isValidEan("036000291452")).toBe(true);
    expect(isValidEan("96385074")).toBe(true);
    expect(isValidEan("9638507")).toBe(false);
    expect(isValidEan("40063813339a1")).toBe(false);
    expect(looksLikeBadEan("4006381333932")).toBe(true);
    expect(looksLikeBadEan("4006381333931")).toBe(false);
    expect(looksLikeBadEan("ABC")).toBe(false);
  });

  it("detects the print format like the API", () => {
    expect(barcodeFormat("4006381333931")).toBe("ean13");
    expect(barcodeFormat("036000291452")).toBe("upca");
    expect(barcodeFormat("96385074")).toBe("ean8");
    expect(barcodeFormat("4006381333932")).toBe("code128"); // bad check digit
    expect(barcodeFormat("ABC-123")).toBe("code128");
    expect(barcodeFormat("12345")).toBe("code128");
    expect(barcodeFormat("https://example.com/p/1")).toBe("qr");
    expect(barcodeFormat("x".repeat(41))).toBe("qr");
    expect(barcodeFormat("x".repeat(40))).toBe("code128");
    expect(barcodeFormat("چائے")).toBe("qr");
    expect(barcodeFormat("A\u001dB")).toBe("qr");
  });

  it("writes a UPC-A with and without the leading zero", () => {
    expect(equivalentCodes("0036000291452")).toEqual(["036000291452"]);
    expect(equivalentCodes("036000291452")).toEqual(["0036000291452"]);
    expect(equivalentCodes("4006381333931")).toEqual([]);
    expect(equivalentCodes("ABC")).toEqual([]);
  });
});

const scale: ScaleConfig = { enabled: true, prefixes: ["21", "22"], itemDigits: 5, value: "weight", decimals: 3 };

describe("scale labels", () => {
  it("reads a weight label: prefix, item code, grams to kg", () => {
    const code = withCheckDigit("211234500523");
    expect(parseScaleLabel(code, scale)).toEqual({ code, prefix: "21", itemCode: "12345", valueDigits: "00523", kind: "weight", weightKg: 0.523, priceMinor: null });
    expect(parseScaleLabel(withCheckDigit("221234501500"), scale)?.weightKg).toBe(1.5);
  });

  it("reads a price label: 0 decimals means whole rupees, 2 means paisa", () => {
    const code = withCheckDigit("211234501250");
    expect(parseScaleLabel(code, { ...scale, value: "price", decimals: 0 })).toMatchObject({ kind: "price", priceMinor: 125000, weightKg: null });
    expect(parseScaleLabel(code, { ...scale, value: "price", decimals: 2 })?.priceMinor).toBe(1250);
    expect(parseScaleLabel(code, { ...scale, value: "price", decimals: 3 })?.priceMinor).toBe(125);
  });

  it("honours the item digits setting", () => {
    const code = withCheckDigit("210012001234");
    expect(parseScaleLabel(code, { ...scale, itemDigits: 4 })).toMatchObject({ itemCode: "0012", valueDigits: "001234", weightKg: 1.234 });
  });

  it("returns null when off, for another prefix, a bad check digit, or no room for a value", () => {
    const code = withCheckDigit("211234500523");
    expect(parseScaleLabel(code, { ...scale, enabled: false })).toBeNull();
    expect(parseScaleLabel(withCheckDigit("231234500523"), scale)).toBeNull();
    expect(parseScaleLabel(code.slice(0, 12) + ((Number(code[12]) + 1) % 10), scale)).toBeNull();
    expect(parseScaleLabel(code, { ...scale, itemDigits: 10 })).toBeNull();
    expect(parseScaleLabel("21123450052", scale)).toBeNull();
  });

  it("prefers the longest matching prefix", () => {
    const code = withCheckDigit("212345600523");
    expect(parseScaleLabel(code, { ...scale, prefixes: ["2", "212"], itemDigits: 4 })).toMatchObject({ prefix: "212", itemCode: "3456" });
  });
});

function product(over: Partial<Product>): Product {
  return {
    id: "p1", category_id: "c1", name: "Item", name_ur: null, description: null, sku: null, image_key: null, base_price_minor: 10000, tax_rate_id: null,
    is_favourite: false, show_online: true, active: true, sold_by_weight: false, weight_unit: null, allergens: null, dietary_tags: null, station_id: null,
    sort_order: 0, archived_at: null, updated_at: "2026-10-01T00:00:00Z", variants: [], prices: [], modifier_group_ids: [], barcodes: [], ...over,
  };
}

describe("findBarcode", () => {
  const juice = product({
    id: "juice", name: "Juice", base_price_minor: 8000,
    variants: [{ id: "v-s", product_id: "juice", name: "Small", price_minor: 8000, sku: null, sort_order: 0 }, { id: "v-l", product_id: "juice", name: "Large", price_minor: 15000, sku: null, sort_order: 1 }],
    barcodes: [
      { id: "b1", code: "4006381333931", variant_id: "v-l", quantity: "1.0" },
      { id: "b2", code: "96385074", variant_id: null, quantity: "6.0" },
      { id: "b3", code: "036000291452", variant_id: "v-gone", quantity: "1" },
    ],
  });
  const dates = product({ id: "dates", name: "Dates", base_price_minor: 120000, sold_by_weight: true, barcodes: [{ id: "b4", code: "12345", variant_id: null, quantity: "1" }] });
  const nuts = product({ id: "nuts", name: "Nuts", base_price_minor: 200000, sold_by_weight: true, barcodes: [{ id: "b5", code: "2200042", variant_id: null, quantity: "1" }] });
  const tea = product({ id: "tea", name: "Tea", base_price_minor: 5000, barcodes: [{ id: "b6", code: "77", variant_id: null, quantity: "1" }] });
  const gone = product({ id: "gone", name: "Old", archived_at: "2026-01-01T00:00:00Z", barcodes: [{ id: "b7", code: "55555555", variant_id: null, quantity: "1" }] });
  const off = product({ id: "off", name: "Off", active: false, barcodes: [{ id: "b8", code: "OFF-1", variant_id: null, quantity: "1" }] });
  const products = [juice, dates, nuts, tea, gone, off];

  it("finds an exact code with its size and pack quantity", () => {
    const m = findBarcode(products, " 4006381333931 ");
    expect(m).toMatchObject({ product: { id: "juice" }, variant: { id: "v-l" }, quantity: 1, via: "code", scale: null });
    expect(findBarcode(products, "96385074")).toMatchObject({ variant: null, quantity: 6 });
  });

  it("falls back to any size when the code's size no longer exists", () => {
    expect(findBarcode(products, "036000291452")).toMatchObject({ product: { id: "juice" }, variant: null });
  });

  it("finds a UPC-A read as EAN-13 with a leading zero", () => {
    expect(findBarcode(products, "0036000291452")).toMatchObject({ product: { id: "juice" } });
  });

  it("skips archived products but still finds inactive ones", () => {
    expect(findBarcode(products, "55555555")).toBeNull();
    expect(findBarcode(products, "OFF-1")).toMatchObject({ product: { id: "off", active: false } });
  });

  it("returns null for an unknown or blank code", () => {
    expect(findBarcode(products, "0000")).toBeNull();
    expect(findBarcode(products, "   ")).toBeNull();
  });

  it("reads a weight label whose item code is a product barcode", () => {
    const m = findBarcode(products, withCheckDigit("211234500523"), { scale });
    expect(m).toMatchObject({ product: { id: "dates" }, quantity: 0.523, via: "scale", scale: { itemCode: "12345" } });
    // Without scale settings the same code is unknown.
    expect(findBarcode(products, withCheckDigit("211234500523"))).toBeNull();
  });

  it("matches the item code saved with its prefix, or without leading zeros", () => {
    expect(findBarcode(products, withCheckDigit("220004201000"), { scale })).toMatchObject({ product: { id: "nuts" }, quantity: 1 });
    expect(findBarcode(products, withCheckDigit("210007700250"), { scale })).toMatchObject({ product: { id: "tea" }, quantity: 0.25 });
  });

  it("turns a price label into a quantity: price / unit price, 3 decimals", () => {
    const price = { ...scale, value: "price" as const, decimals: 0 };
    // Rs 450 of dates at Rs 1,200 a kg = 0.375 kg
    expect(findBarcode(products, withCheckDigit("211234500450"), { scale: price })).toMatchObject({ product: { id: "dates" }, quantity: 0.375 });
    // Rs 100 at Rs 1,200 a kg = 0.0833... -> 0.083
    expect(findBarcode(products, withCheckDigit("211234500100"), { scale: price })?.quantity).toBe(0.083);
    // The unit price can come from the till's order-type pricing.
    expect(findBarcode(products, withCheckDigit("211234500450"), { scale: price, unitPrice: () => 90000 })?.quantity).toBe(0.5);
  });

  it("does not add a zero quantity", () => {
    expect(findBarcode(products, withCheckDigit("211234500000"), { scale })).toBeNull();
    const price = { ...scale, value: "price" as const, decimals: 0 };
    expect(findBarcode(products, withCheckDigit("211234500450"), { scale: price, unitPrice: () => 0 })).toBeNull();
  });

  it("prefers an exact code over a scale label", () => {
    const code = withCheckDigit("211234500523");
    const exact = product({ id: "exact", barcodes: [{ id: "b9", code, variant_id: null, quantity: "2" }] });
    expect(findBarcode([...products, exact], code, { scale })).toMatchObject({ product: { id: "exact" }, quantity: 2, via: "code" });
  });

  it("packQuantity defaults to one", () => {
    expect(packQuantity({ quantity: "12.0" })).toBe(12);
    expect(packQuantity({ quantity: "0" })).toBe(1);
    expect(packQuantity({ quantity: "" })).toBe(1);
  });
});

/** Strokes for a test capture: keys `gap` ms apart. */
const strokes = (keys: string[], gap = 10, start = 0): KeyStroke[] => keys.map((key, i) => ({ key, time: start + i * gap }));

describe("explainCapture (scanner test)", () => {
  it("accepts a normal scan and reports its keys, gaps and terminator", () => {
    const r = explainCapture(strokes([...chars("4006381333931"), "Enter"], 8), base);
    expect(r).toMatchObject({ raw: "4006381333931", end: "enter", lookupCode: "4006381333931", advice: [] });
    expect(r.keys).toHaveLength(14);
    expect(r.gaps).toEqual(Array(13).fill(8));
    expect(r.result).toMatchObject({ ok: true, code: "4006381333931" });
  });

  it("leaves Shift out of the keys", () => {
    const r = explainCapture(strokes(["Shift", "A", "B", "C", "1", "Enter"]), base);
    expect(r.keys).toEqual(["A", "B", "C", "1", "Enter"]);
    expect(r.result).toMatchObject({ ok: true, code: "ABC1" });
  });

  it("suggests Terminator none when the scanner sends nothing after the code", () => {
    const r = explainCapture(strokes(chars("4006381333931")), base);
    expect(r.end).toBe("none");
    expect(r.result).toMatchObject({ ok: false, reason: "no_terminator" });
    expect(r.advice.join(" ")).toMatch(/Terminator to Nothing/);
    expect(r.lookupCode).toBe("4006381333931");
  });

  it("names the terminator the scanner really sends", () => {
    const r = explainCapture(strokes([...chars("4006381333931"), "Tab"]), base);
    expect(r.end).toBe("tab");
    expect(r.advice.join(" ")).toMatch(/ends codes with Tab. Set Terminator to Tab/);
  });

  it("spots a prefix the settings do not remove, and a missing configured prefix", () => {
    const extra = explainCapture(strokes([...chars("]E04006381333931"), "Enter"]), base);
    expect(extra.result).toMatchObject({ ok: true, code: "]E04006381333931" });
    expect(extra.guess).toEqual({ prefix: "]E0", code: "4006381333931", suffix: "" });
    expect(extra.advice.join(" ")).toMatch(/set Prefix to "\]E0"/);
    const missing = explainCapture(strokes([...chars("4006381333931"), "Enter"]), { ...base, prefix: "*" });
    expect(missing.result).toMatchObject({ ok: false, reason: "missing_prefix" });
    expect(missing.advice.join(" ")).toMatch(/do not start with the prefix "\*". Clear Prefix/);
  });

  it("suggests a longer key interval for a slow scanner", () => {
    const r = explainCapture(strokes([...chars("4006381333931"), "Enter"], 70), base);
    expect(r.result).toBeNull(); // every key is on its own at a 50 ms limit
    expect(r.advice.join(" ")).toMatch(/70 ms apart and the limit is 50 ms. Raise Max key interval to about 100 ms/);
    expect(r.lookupCode).toBe("4006381333931");
  });

  it("explains a code shorter than Min length", () => {
    const r = explainCapture(strokes([...chars("123"), "Enter"]), base);
    expect(r.advice.join(" ")).toMatch(/3 characters and Min length is 4/);
  });

  it("warns about the keyboard layout when characters come through wrong", () => {
    const azerty = explainCapture(strokes([..."&é\"'(-è_çà", "Enter"]), base);
    expect(azerty.advice.join(" ")).toMatch(/keyboard layout to English \(US\)/);
    const dead = explainCapture(strokes(["1", "2", "Dead", "3", "4", "Enter"]), base);
    expect(dead.advice.join(" ")).toMatch(/keyboard layout/);
  });

  it("asks for another try when only one key came", () => {
    expect(explainCapture(strokes(["7"]), base).advice[0]).toMatch(/Only one key/);
  });
});
