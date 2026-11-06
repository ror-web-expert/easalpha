// Barcodes on the till: telling a keyboard-wedge scanner from a person typing, EAN/UPC check digits and formats
// (the same rules as Catalog::Barcodes on the API), weighing-scale labels, and finding what a code adds in the local
// catalog. Pure: no React and no DOM, so the till works offline with it and the rules are tested directly.
import type { BarcodeFormat, BusinessSettings, Product, ProductBarcode, Variant } from "@/lib/types";
import { labelWeight } from "@/lib/pricing";

// ---- Settings (pos.barcode_scanning.*) ----

export type ScanTerminator = "enter" | "tab" | "none";
export interface ScaleConfig {
  enabled: boolean;
  /** EAN-13 prefixes that mark a scale label, e.g. ["21", "22"]. */
  prefixes: string[];
  /** Digits after the prefix that name the item (its PLU, saved as a product barcode). */
  itemDigits: number;
  /** What the remaining digits hold. */
  value: "weight" | "price";
  /** Decimals in the value: 3 turns grams into kg; 0 means whole rupees. */
  decimals: number;
}
export interface ScannerConfig {
  enabled: boolean;
  prefix: string;
  suffix: string;
  terminator: ScanTerminator;
  minLength: number;
  maxKeyIntervalMs: number;
  beep: boolean;
  camera: boolean;
  unknownCode: "ask" | "ignore";
  scale: ScaleConfig;
}

const KEY = "pos.barcode_scanning.";
type SettingsLike = BusinessSettings | Record<string, unknown> | null | undefined;

function raw(settings: SettingsLike, name: string): unknown {
  return (settings as Record<string, unknown> | null | undefined)?.[KEY + name];
}
function bool(settings: SettingsLike, name: string, fallback: boolean): boolean {
  const v = raw(settings, name);
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return fallback;
}
function int(settings: SettingsLike, name: string, fallback: number, min: number, max: number): number {
  const v = raw(settings, name);
  const n = v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
function str(settings: SettingsLike, name: string, fallback: string): string {
  const v = raw(settings, name);
  return v === null || v === undefined ? fallback : String(v);
}

/** The scanner settings from the till's synced settings object, with the registry defaults and sane limits. */
export function scannerConfig(settings: SettingsLike): ScannerConfig {
  const terminator = str(settings, "terminator", "enter");
  return {
    enabled: bool(settings, "enabled", false),
    prefix: str(settings, "prefix", ""),
    suffix: str(settings, "suffix", ""),
    terminator: terminator === "tab" || terminator === "none" ? terminator : "enter",
    minLength: int(settings, "min_length", 4, 1, 64),
    maxKeyIntervalMs: int(settings, "max_key_interval_ms", 50, 5, 1000),
    beep: bool(settings, "beep", true),
    camera: bool(settings, "camera", true),
    unknownCode: str(settings, "unknown_code", "ask") === "ignore" ? "ignore" : "ask",
    scale: {
      enabled: bool(settings, "scale_barcodes", false),
      prefixes: str(settings, "scale_prefixes", "21,22").split(/[\s,]+/).map((p) => p.trim()).filter((p) => /^\d{1,5}$/.test(p)),
      itemDigits: int(settings, "scale_item_digits", 5, 1, 10),
      value: str(settings, "scale_value", "weight") === "price" ? "price" : "weight",
      decimals: int(settings, "scale_decimals", 3, 0, 6),
    },
  };
}

// ---- Keyboard-wedge scan detection ----
// A USB or Bluetooth scanner types the code as key presses, much faster than a person, usually followed by Enter.
// The detector is fed every keydown ({ key, time }) and groups keys that arrive within maxKeyIntervalMs of each
// other into a burst. A burst ends with a terminator key (Enter or Tab), with any other key, or with a pause.

export interface KeyStroke { key: string; time: number }
export type BurstEnd = "enter" | "tab" | "pause";
export interface Burst {
  /** The characters the scanner typed, prefix and suffix included, terminator excluded. */
  raw: string;
  keys: number;
  /** Milliseconds between consecutive characters (keys - 1 entries). */
  gaps: number[];
  end: BurstEnd;
  startedAt: number;
  endedAt: number;
}
export type ScanReject = "too_short" | "missing_prefix" | "missing_suffix" | "wrong_terminator" | "no_terminator";
/** ok: a scan; code has the prefix and suffix removed. Not ok: a fast burst the current settings do not accept (code is the best guess). */
export type ScanResult = { ok: true; code: string; burst: Burst } | { ok: false; reason: ScanReject; code: string; burst: Burst };
export type DetectorConfig = Pick<ScannerConfig, "prefix" | "suffix" | "terminator" | "minLength" | "maxKeyIntervalMs">;

/** Keys a scanner may press between characters (Shift for capitals); they neither add to nor break a burst. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock", "ScrollLock", "OS", "Fn", "FnLock", "Hyper", "Super", "Symbol", "SymbolLock"]);

export function isPrintableKey(key: string): boolean {
  return [...key].length === 1;
}

/**
 * Whether a finished burst is a scan under these settings. The terminator must be the configured one ("none" takes
 * a pause, and also an Enter or Tab if the scanner sends one anyway); the configured prefix and suffix must be there
 * and are removed; what is left must be at least minLength characters.
 */
export function judgeBurst(burst: Burst, config: DetectorConfig): ScanResult {
  let body = burst.raw;
  const prefixOk = !config.prefix || body.startsWith(config.prefix);
  if (config.prefix && prefixOk) body = body.slice(config.prefix.length);
  const suffixOk = !config.suffix || body.endsWith(config.suffix);
  if (config.suffix && suffixOk) body = body.slice(0, body.length - config.suffix.length);
  const code = body.trim();
  const reject = (reason: ScanReject): ScanResult => ({ ok: false, reason, code, burst });
  if (config.terminator !== "none") {
    if (burst.end === "pause") return reject("no_terminator");
    if (burst.end !== config.terminator) return reject("wrong_terminator");
  }
  if (!prefixOk) return reject("missing_prefix");
  if (!suffixOk) return reject("missing_suffix");
  if (code.length < config.minLength) return reject("too_short");
  return { ok: true, code, burst };
}

export interface ScanDetector {
  /**
   * Feed one keydown. Returns a result when this key finishes a burst of two or more fast characters: either the
   * key is the terminator (burst.end "enter" / "tab": the caller should swallow the key when the result is ok) or the
   * key came after a pause (burst.end "pause": the key itself starts something new and is not swallowed).
   */
  feed(stroke: KeyStroke): ScanResult | null;
  /** Call once no key has come for longer than maxKeyIntervalMs; finishes a burst that ended without a terminator. */
  flush(now: number): ScanResult | null;
  reset(): void;
  /** Characters in the burst being collected. */
  readonly length: number;
}

export function createScanDetector(config: DetectorConfig): ScanDetector {
  let chars: string[] = [];
  let gaps: number[] = [];
  let first = 0;
  let last = 0;
  const clear = () => { chars = []; gaps = []; };
  const finish = (end: BurstEnd, endedAt: number): ScanResult | null => {
    const burst: Burst = { raw: chars.join(""), keys: chars.length, gaps, end, startedAt: first, endedAt };
    clear();
    // One character is a person typing, never a scan.
    return burst.keys < 2 ? null : judgeBurst(burst, config);
  };
  return {
    get length() { return chars.length; },
    reset: clear,
    feed({ key, time }) {
      if (MODIFIER_KEYS.has(key)) return null;
      const quick = chars.length > 0 && time - last <= config.maxKeyIntervalMs;
      const end: BurstEnd | null = key === "Enter" ? "enter" : key === "Tab" ? "tab" : null;
      if (end) {
        if (!chars.length) return null;
        return quick ? finish(end, time) : finish("pause", last);
      }
      const done = chars.length && !quick ? finish("pause", last) : null;
      if (!isPrintableKey(key)) { clear(); return done; }
      if (chars.length) gaps.push(time - last);
      else first = time;
      chars.push(key);
      last = time;
      return done;
    },
    flush(now) {
      if (!chars.length || now - last <= config.maxKeyIntervalMs) return null;
      return finish("pause", last);
    },
  };
}

/** When a key was pressed, on the performance.now() clock: event.timeStamp where it is that clock (jsdom's is epoch time). */
export function keyTime(e: { timeStamp: number }): number {
  return e.timeStamp > 1e12 || !e.timeStamp ? performance.now() : e.timeStamp;
}

/**
 * Review 6 Nov 2026, R27: a code scanned while a money field has the focus types itself in as an amount (Rs 40 billion
 * tendered from an EAN-13). A burst of at least six characters, each within 50 ms of the last, is a scanner: no person
 * types that fast, and every code worth scanning (EAN-8 and longer) is that long. Ends on Enter, Tab or a pause.
 */
export const MONEY_SCAN_GUARD: DetectorConfig = { prefix: "", suffix: "", terminator: "none", minLength: 6, maxKeyIntervalMs: 50 };

export interface ScanGuard {
  /**
   * Feed a keydown on the field with the value it holds now (before the key's character goes in). "restore" says a
   * scan just ended: put the field back to `value`, and swallow this key when `swallow` (the scanner's Enter or Tab).
   */
  key(stroke: KeyStroke, current: number): { restore: number; swallow: boolean } | null;
  /** After a pause (call once no key came for longer than the interval): the value to put back, or null. */
  flush(now: number): number | null;
  readonly pending: boolean;
}

export function createScanGuard(config: DetectorConfig = MONEY_SCAN_GUARD): ScanGuard {
  const detector = createScanDetector(config);
  let before = 0;
  return {
    get pending() { return detector.length > 0; },
    key(stroke, current) {
      const start = before;
      const r = detector.feed(stroke);
      const restore = r?.ok ? { restore: start, swallow: r.burst.end !== "pause" } : null;
      // The first character of a burst: what the field held before it (the restored value when a scan just ended).
      if (detector.length === 1) before = restore ? start : current;
      return restore;
    },
    flush(now) {
      const r = detector.flush(now);
      return r?.ok ? before : null;
    },
  };
}

/**
 * Best guess at the prefix and suffix around a code, for the scanner test: an AIM symbology identifier ("]E0"), the
 * characters around an EAN/UPC whose check digit is right, or symbols at either end.
 */
export function guessAffixes(raw: string): { prefix: string; code: string; suffix: string } {
  let prefix = "";
  let body = raw;
  let suffix = "";
  const aim = /^\][A-Za-z][0-9A-Za-z]/.exec(body);
  if (aim) { prefix = aim[0]; body = body.slice(aim[0].length); }
  const ean = [...body.matchAll(/\d+/g)].find((m) => [8, 12, 13].includes(m[0].length) && isValidEan(m[0]));
  if (ean && ean.index !== undefined) {
    return { prefix: prefix + body.slice(0, ean.index), code: ean[0], suffix: body.slice(ean.index + ean[0].length) };
  }
  const lead = /^[^0-9A-Za-z]+/.exec(body);
  if (lead) { prefix += lead[0]; body = body.slice(lead[0].length); }
  const trail = /[^0-9A-Za-z]+$/.exec(body);
  if (trail) { suffix = trail[0]; body = body.slice(0, body.length - trail[0].length); }
  return { prefix, code: body, suffix };
}

/** How one key shows in the scanner test: control characters and named keys made visible. */
export function visibleKey(key: string): { text: string; control: boolean } {
  if (key === "Enter") return { text: "⏎ Enter", control: true };
  if (key === "Tab") return { text: "⇥ Tab", control: true };
  if (key === " ") return { text: "␠", control: true };
  if (isPrintableKey(key)) {
    const c = key.codePointAt(0)!;
    if (c < 0x20) return { text: String.fromCodePoint(0x2400 + c), control: true };
    if (c === 0x7f) return { text: "␡", control: true };
    return { text: key, control: false };
  }
  return { text: key, control: true };
}

/** A string with its control characters swapped for visible symbols (␂, ␃, ␝ ...). */
export function visibleText(text: string): string {
  return [...text].map((ch) => visibleKey(ch).text).join("");
}

// ---- Scanner test (admin settings) ----

export interface CaptureReport {
  /** Every key the scanner sent, modifiers left out, terminator included. */
  keys: string[];
  /** The printable characters. */
  raw: string;
  /** Milliseconds between consecutive keys. */
  gaps: number[];
  /** The key the capture ended with. */
  end: "enter" | "tab" | "none";
  /** What these settings make of it: a scan, a rejected burst, or nothing (too slow to be a scanner). */
  result: ScanResult | null;
  guess: { prefix: string; code: string; suffix: string };
  /** What the till would look up: the accepted code, otherwise the best guess. */
  lookupCode: string;
  /** Plain-English fixes for the settings or the device. */
  advice: string[];
}

const END_NAMES = { enter: "Enter", tab: "Tab" } as const;

/** Replays the keys of one test scan through the detector with these settings and explains the outcome. */
export function explainCapture(strokes: KeyStroke[], config: DetectorConfig): CaptureReport {
  const keyed = strokes.filter((s) => !MODIFIER_KEYS.has(s.key));
  const keys = keyed.map((s) => s.key);
  const gaps = keyed.slice(1).map((s, i) => s.time - keyed[i].time);
  const last = keys[keys.length - 1];
  const end = last === "Enter" ? "enter" : last === "Tab" ? "tab" : "none";
  const raw = keys.filter(isPrintableKey).join("");
  const detector = createScanDetector(config);
  const results: ScanResult[] = [];
  for (const s of keyed) { const r = detector.feed(s); if (r) results.push(r); }
  const tail = detector.flush((keyed[keyed.length - 1]?.time ?? 0) + config.maxKeyIntervalMs + 1);
  if (tail) results.push(tail);
  const result = results.find((r) => r.ok) ?? [...results].sort((a, b) => b.burst.keys - a.burst.keys)[0] ?? null;
  const guess = guessAffixes(raw);
  const lookupCode = result ? result.code : guess.code;
  const advice: string[] = [];
  const slowest = gaps.length ? Math.max(...gaps) : 0;
  if (keys.length < 2) advice.push("Only one key arrived. Click the box and scan again.");
  else if (slowest > config.maxKeyIntervalMs) {
    advice.push(`Keys came up to ${Math.round(slowest)} ms apart and the limit is ${config.maxKeyIntervalMs} ms. Raise Max key interval to about ${Math.ceil((slowest * 1.3) / 10) * 10} ms.`);
  }
  if (result && !result.ok) {
    if (result.reason === "no_terminator") advice.push("The scanner sends nothing after the code. Set Terminator to Nothing (timing only), or set the scanner to add Enter.");
    if (result.reason === "wrong_terminator" && result.burst.end !== "pause") advice.push(`The scanner ends codes with ${END_NAMES[result.burst.end]}. Set Terminator to ${END_NAMES[result.burst.end]}.`);
    if (result.reason === "missing_prefix") advice.push(`Codes do not start with the prefix "${config.prefix}". Clear Prefix${guess.prefix ? ` or set it to "${guess.prefix}"` : ""}.`);
    if (result.reason === "missing_suffix") advice.push(`Codes do not end with the suffix "${config.suffix}". Clear Suffix${guess.suffix ? ` or set it to "${guess.suffix}"` : ""}.`);
    if (result.reason === "too_short") advice.push(`The code has ${result.code.length} characters and Min length is ${config.minLength}. Lower Min length if your codes are this short.`);
  }
  if (result?.ok) {
    if (guess.prefix && !config.prefix) advice.push(`The code seems to start with "${guess.prefix}". If products are not found, set Prefix to "${guess.prefix}".`);
    if (guess.suffix && !config.suffix) advice.push(`The code seems to end with "${guess.suffix}". If products are not found, set Suffix to "${guess.suffix}".`);
  }
  if (keys.some((k) => k === "Unidentified" || k === "Dead") || /[^\x00-\x7F]/.test(raw)) {
    advice.push("Some characters did not come through as typed. Set this device's keyboard layout to English (US), the layout most scanners use.");
  }
  return { keys, raw, gaps, end, result, guess, lookupCode, advice };
}

// ---- Formats and check digits (as Catalog::Barcodes on the API) ----

/** EAN/UPC check digit for the digits before it: from the right, weights 3, 1, 3, 1 ... */
export function eanCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Appends the check digit: "200000000001" -> "2000000000015". */
export function withCheckDigit(body: string): string {
  return body + eanCheckDigit(body);
}

/** An 8, 12 or 13 digit code whose last digit is the right check digit. */
export function isValidEan(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
  return eanCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Digits only and EAN/UPC length, but the check digit is wrong: almost always a typing mistake. */
export function looksLikeBadEan(code: string): boolean {
  return /^\d+$/.test(code) && [8, 12, 13].includes(code.length) && !isValidEan(code);
}

/** The format a code prints in: ean13, upca, ean8, qr (long, a link, or non-printing characters) or code128. */
export function barcodeFormat(code: string): BarcodeFormat {
  const length = [...code].length;
  if (length === 13 && isValidEan(code)) return "ean13";
  if (length === 12 && isValidEan(code)) return "upca";
  if (length === 8 && isValidEan(code)) return "ean8";
  if (length > 40 || /^\w+:\/\//.test(code) || /[^\x20-\x7E]/.test(code)) return "qr";
  return "code128";
}

export const FORMAT_LABELS: Record<BarcodeFormat, string> = { ean13: "EAN-13", upca: "UPC-A", ean8: "EAN-8", code128: "Code 128", qr: "QR code" };

/**
 * A UPC-E (number system 0 or 1, six digits, check digit) as the 12-digit UPC-A it is short for, or null when the
 * code is not a valid UPC-E: "04252614" is "042100005264". Small packs carry UPC-E; the supplier's list has UPC-A.
 */
export function upcEToUpcA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7);
  const body = d6 <= "2" ? `${d1}${d2}${d6}0000${d3}${d4}${d5}` : d6 === "3" ? `${d1}${d2}${d3}00000${d4}${d5}` : d6 === "4" ? `${d1}${d2}${d3}${d4}00000${d5}` : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const upcA = `${code[0]}${body}`;
  return eanCheckDigit(upcA) === Number(code[7]) ? `${upcA}${code[7]}` : null;
}

/** A UPC-A that has a UPC-E form (number system 0 or 1 and the zeros it drops) as that 8-digit UPC-E; null otherwise. */
export function upcAToUpcE(code: string): string | null {
  if (!/^[01]\d{11}$/.test(code) || !isValidEan(code)) return null;
  const maker = code.slice(1, 6);
  const item = code.slice(6, 11);
  let e: string | null = null;
  if (/^\d\d[0-2]00$/.test(maker) && /^00\d{3}$/.test(item)) e = `${maker.slice(0, 2)}${item.slice(2)}${maker[2]}`;
  else if (/^\d\d[3-9]00$/.test(maker) && /^000\d\d$/.test(item)) e = `${maker.slice(0, 3)}${item.slice(3)}3`;
  else if (/^\d{4}0$/.test(maker) && /^0000\d$/.test(item)) e = `${maker.slice(0, 4)}${item[4]}4`;
  else if (/^\d{4}[1-9]$/.test(maker) && /^0000[5-9]$/.test(item)) e = `${maker}${item[4]}`;
  return e ? `${code[0]}${e}${code[11]}` : null;
}

/**
 * The same product code written another way, tried after the code itself (review 6 Nov 2026, R27): a UPC-A read as
 * EAN-13 gets a leading 0, and back; a UPC-E is the UPC-A it is short for (in both spellings), and a UPC-A its UPC-E;
 * an EAN-8 that a scanner padded to 13 digits with five zeros is the EAN-8, and back.
 */
export function equivalentCodes(code: string): string[] {
  const out: string[] = [];
  const add = (c: string | null) => { if (c && c !== code && !out.includes(c)) out.push(c); };
  const upcA = /^\d{12}$/.test(code) ? code : /^0\d{12}$/.test(code) ? code.slice(1) : null;
  if (upcA) { add(upcA); add(`0${upcA}`); add(upcAToUpcE(upcA)); }
  const expanded = upcEToUpcA(code);
  if (expanded) { add(expanded); add(`0${expanded}`); }
  if (/^0{5}\d{8}$/.test(code) && isValidEan(code.slice(5))) add(code.slice(5));
  if (/^\d{8}$/.test(code) && isValidEan(code)) add(`00000${code}`);
  return out;
}

// ---- Weighing-scale labels ----
// A scale prints an EAN-13: prefix (e.g. 21) + item code (scale_item_digits) + value + check digit. The value is the
// weight or the price, with scale_decimals decimals. Weight: value / 10^decimals kg (3 decimals: grams -> kg).
// Price: value / 10^decimals rupees, so price_minor = round(value * 100 / 10^decimals); 0 decimals = whole rupees
// (value * 100 paisa), 2 decimals = paisa as printed.

export interface ScaleLabel {
  code: string;
  prefix: string;
  itemCode: string;
  valueDigits: string;
  kind: "weight" | "price";
  /** kg, rounded to 3 decimals (weight labels). */
  weightKg: number | null;
  /** paisa (price labels). */
  priceMinor: number | null;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function parseScaleLabel(code: string, scale: ScaleConfig): ScaleLabel | null {
  if (!scale.enabled || !/^\d{13}$/.test(code) || !isValidEan(code)) return null;
  const prefix = [...scale.prefixes].sort((a, b) => b.length - a.length).find((p) => p && code.startsWith(p));
  if (!prefix) return null;
  const itemEnd = prefix.length + scale.itemDigits;
  if (itemEnd >= 12) return null; // no digits left for the value
  const itemCode = code.slice(prefix.length, itemEnd);
  const valueDigits = code.slice(itemEnd, 12);
  const value = Number(valueDigits);
  const divisor = 10 ** scale.decimals;
  if (scale.value === "weight") return { code, prefix, itemCode, valueDigits, kind: "weight", weightKg: round3(value / divisor), priceMinor: null };
  return { code, prefix, itemCode, valueDigits, kind: "price", weightKg: null, priceMinor: Math.round((value * 100) / divisor) };
}

// ---- Lookup over the local catalog ----

export interface BarcodeMatch {
  product: Product;
  /** The size the code names; null for "any size" (the till asks) or a product without sizes. */
  variant: Variant | null;
  barcode: ProductBarcode;
  /** Pack size from the code, or the weight / price-derived quantity of a scale label. */
  quantity: number;
  via: "code" | "scale";
  scale: ScaleLabel | null;
  /**
   * What the line charges, exactly: the printed price of a price label on a product sold by weight (quantity is then
   * the weight it buys, labelWeight). Null for everything else, priced by unit price times quantity.
   */
  labelPriceMinor: number | null;
}
export interface LookupOptions {
  scale?: ScaleConfig | null;
  /** Price of one unit (one kg for weighed items), used to turn a price label into a quantity. */
  unitPrice?: (product: Product, variant: Variant | null) => number;
}

/** Pack size of a code: its quantity, or 1 when missing or not positive. */
export function packQuantity(b: Pick<ProductBarcode, "quantity">): number {
  const q = Number(b.quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

function variantOf(product: Product, b: ProductBarcode): Variant | null {
  return b.variant_id ? product.variants?.find((v) => v.id === b.variant_id) ?? null : null;
}

function findCode(products: Product[], test: (b: ProductBarcode) => boolean): { product: Product; barcode: ProductBarcode } | null {
  for (const product of products) {
    if (product.archived_at) continue;
    const barcode = product.barcodes?.find(test);
    if (barcode) return { product, barcode };
  }
  return null;
}

/**
 * What a scanned code adds: an exact product code first (with its size and pack quantity), then the same code written
 * another way (equivalentCodes: UPC-A / EAN-13, UPC-E, a padded EAN-8), then any of those in other letter case (a
 * scanner on a Caps Lock keyboard sends "box-6" for BOX-6), then a scale label whose item code is saved as a product
 * barcode (as the bare item code, the prefix plus item code, or the same number without leading zeros). Archived
 * products never match; inactive ones do, so the till can say the item is switched off.
 */
export function findBarcode(products: Product[], scanned: string, opts: LookupOptions = {}): BarcodeMatch | null {
  const code = scanned.trim();
  if (!code) return null;
  const candidates = [code, ...equivalentCodes(code)];
  const folded = candidates.map((c) => c.toLowerCase());
  const tests = [...candidates.map((c) => (b: ProductBarcode) => b.code === c), (b: ProductBarcode) => folded.includes(b.code.toLowerCase())];
  for (const test of tests) {
    const hit = findCode(products, test);
    if (hit) return { ...hit, variant: variantOf(hit.product, hit.barcode), quantity: packQuantity(hit.barcode), via: "code", scale: null, labelPriceMinor: null };
  }
  const label = opts.scale ? parseScaleLabel(code, opts.scale) : null;
  if (!label) return null;
  const item = label.itemCode;
  const hit = findCode(products, (b) => b.code === item || b.code === label.prefix + item || (/^\d+$/.test(b.code) && b.code.length <= item.length && Number(b.code) === Number(item)));
  if (!hit) return null;
  const variant = variantOf(hit.product, hit.barcode);
  let quantity: number;
  let labelPriceMinor: number | null = null;
  if (label.kind === "weight") quantity = label.weightKg ?? 0;
  else {
    const unit = opts.unitPrice ? opts.unitPrice(hit.product, variant) : variant?.price_minor ?? hit.product.base_price_minor;
    const price = label.priceMinor ?? 0;
    quantity = labelWeight(price, unit);
    // Review 6 Nov 2026, R1: Rs 50 of Rs 1,200/kg is 0.042 kg, which is Rs 50.40 by weight. A product sold by weight
    // charges the printed price itself, as Orders::Builder does; the weight is what the stock and the receipt show.
    if (hit.product.sold_by_weight && quantity > 0) labelPriceMinor = price;
  }
  if (!(quantity > 0)) return null;
  return { ...hit, variant, quantity, via: "scale", scale: label, labelPriceMinor };
}
