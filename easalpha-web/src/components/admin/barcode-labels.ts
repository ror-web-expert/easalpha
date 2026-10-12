// Barcode labels: the sheet and roll presets, where each label sits on a page, what goes where inside a label, and
// the bars / QR modules as rectangles in millimetres. The PDF (jsPDF) and the on-screen preview (an SVG) both draw
// from the same rectangles, so the preview is what prints. Everything above "Loading and output" is pure and tested;
// jsbarcode, qrcode and jsPDF are imported only when a code is drawn or a PDF is made.
import type { BarcodeFormat } from "@/lib/types";
import { barcodeFormat } from "@/lib/barcode";

// ---- Presets ----

export type LabelPresetId = "a4-3x8" | "a4-4x10" | "roll-50x25" | "roll-38x25";
export interface LabelPreset {
  id: LabelPresetId;
  name: string;
  /** Page size in mm. */
  pageWidth: number;
  pageHeight: number;
  cols: number;
  rows: number;
  labelWidth: number;
  labelHeight: number;
  /** Offset of the first label from the page's top-left corner, and the space between labels (mm). */
  marginLeft: number;
  marginTop: number;
  gapX: number;
  gapY: number;
  /** A sheet of many labels (true) or one label per page for a roll printer. */
  sheet: boolean;
}

export const LABEL_PRESETS: LabelPreset[] = [
  { id: "a4-3x8", name: "A4 sheet, 3 x 8 (70 x 37 mm)", pageWidth: 210, pageHeight: 297, cols: 3, rows: 8, labelWidth: 70, labelHeight: 37, marginLeft: 0, marginTop: 0.5, gapX: 0, gapY: 0, sheet: true },
  { id: "a4-4x10", name: "A4 sheet, 4 x 10 (48.5 x 25.4 mm)", pageWidth: 210, pageHeight: 297, cols: 4, rows: 10, labelWidth: 48.5, labelHeight: 25.4, marginLeft: 8, marginTop: 21.5, gapX: 0, gapY: 0, sheet: true },
  { id: "roll-50x25", name: "Single label 50 x 25 mm (roll printer)", pageWidth: 50, pageHeight: 25, cols: 1, rows: 1, labelWidth: 50, labelHeight: 25, marginLeft: 0, marginTop: 0, gapX: 0, gapY: 0, sheet: false },
  { id: "roll-38x25", name: "Single label 38 x 25 mm (roll printer)", pageWidth: 38, pageHeight: 25, cols: 1, rows: 1, labelWidth: 38, labelHeight: 25, marginLeft: 0, marginTop: 0, gapX: 0, gapY: 0, sheet: false },
];

export function presetById(id: string): LabelPreset {
  return LABEL_PRESETS.find((p) => p.id === id) ?? LABEL_PRESETS[0];
}

export const labelsPerPage = (p: LabelPreset) => p.cols * p.rows;

// ---- Pages ----

export interface PlacedLabel<T> { item: T; page: number; slot: number; x: number; y: number; w: number; h: number }

/** Top-left corner of a slot (0-based, left to right, then down). */
export function slotPosition(p: LabelPreset, slot: number): { x: number; y: number } {
  const col = slot % p.cols;
  const row = Math.floor(slot / p.cols) % p.rows;
  return { x: p.marginLeft + col * (p.labelWidth + p.gapX), y: p.marginTop + row * (p.labelHeight + p.gapY) };
}

/** Rows with a number of copies -> one entry per label, in order. Copies are whole numbers from 0 to 999. */
export function expandCopies<T>(rows: { item: T; copies: number }[]): T[] {
  return rows.flatMap((r) => Array<T>(Math.max(0, Math.min(999, Math.floor(Number(r.copies) || 0)))).fill(r.item));
}

/** Clamps "skip the first N labels" (a part-used sheet) to the slots on one page; rolls never skip. */
export function clampSkip(p: LabelPreset, skip: number): number {
  return p.sheet ? Math.max(0, Math.min(labelsPerPage(p) - 1, Math.floor(Number(skip) || 0))) : 0;
}

/** Places every label on its page and slot. The first `skip` slots of the first page stay empty. */
export function layoutLabels<T>(items: T[], p: LabelPreset, skip = 0): PlacedLabel<T>[][] {
  const per = labelsPerPage(p);
  const start = clampSkip(p, skip);
  const pages: PlacedLabel<T>[][] = [];
  items.forEach((item, i) => {
    const n = start + i;
    const page = Math.floor(n / per);
    const slot = n % per;
    (pages[page] ??= []).push({ item, page, slot, ...slotPosition(p, slot), w: p.labelWidth, h: p.labelHeight });
  });
  return pages;
}

export function pageCount(count: number, p: LabelPreset, skip = 0): number {
  return count > 0 ? Math.ceil((clampSkip(p, skip) + count) / labelsPerPage(p)) : 0;
}

// ---- Inside a label ----

export interface LabelOptions { showName: boolean; showPrice: boolean; showBusiness: boolean; qr: boolean }
export interface Box { x: number; y: number; w: number; h: number }
/** A text area: y is the top of the first line; size in points. */
export interface TextBox { x: number; y: number; w: number; size: number; bold: boolean; align: "left" | "center"; lines: number; mono: boolean }
export interface LabelBoxes { pad: number; business: TextBox | null; name: TextBox | null; price: TextBox | null; codeText: TextBox | null; code: Box; digitsSize: number }

/** Millimetres per typographic point. */
export const PT = 25.4 / 72;
export const lineHeight = (sizePt: number) => sizePt * PT * 1.2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Where things go on one label (mm from its top-left corner). Barcode: business, name, bars with digits, price,
 * stacked. QR: the square on the left and the text in a column on its right. Type scales with the label height.
 */
export function labelBoxes(w: number, h: number, opts: LabelOptions): LabelBoxes {
  const k = clamp(h / 25, 0.8, 1.4);
  const pad = round1(clamp(Math.min(w, h) * 0.06, 1, 3));
  const size = { business: round1(5.5 * k), name: round1(7.5 * k), price: round1(9 * k), digits: round1(6 * k) };
  const gap = 0.6;
  const text = (x: number, y: number, width: number, s: number, bold: boolean, align: "left" | "center", lines = 1, mono = false): TextBox => ({ x, y, w: width, size: s, bold, align, lines, mono });
  if (!opts.qr) {
    let top = pad;
    let bottom = h - pad;
    const business = opts.showBusiness ? text(pad, top, w - 2 * pad, size.business, false, "center") : null;
    if (business) top += lineHeight(business.size);
    const name = opts.showName ? text(pad, top, w - 2 * pad, size.name, true, "center") : null;
    if (name) top += lineHeight(name.size);
    const price = opts.showPrice ? text(pad, bottom - lineHeight(size.price), w - 2 * pad, size.price, true, "center") : null;
    if (price) bottom -= lineHeight(price.size);
    if (business || name) top += gap;
    if (price) bottom -= gap;
    return { pad, business, name, price, codeText: null, code: { x: pad, y: top, w: w - 2 * pad, h: bottom - top }, digitsSize: size.digits };
  }
  const side = Math.min(h - 2 * pad, (w - 2 * pad) * 0.55);
  const code = { x: pad, y: (h - side) / 2, w: side, h: side };
  const colX = pad + side + 1.5;
  const colW = w - pad - colX;
  let top = pad;
  let bottom = h - pad;
  const business = opts.showBusiness ? text(colX, top, colW, size.business, false, "left") : null;
  if (business) top += lineHeight(business.size);
  const codeText = text(colX, bottom - lineHeight(size.digits), colW, size.digits, false, "left", 1, true);
  bottom -= lineHeight(size.digits);
  const price = opts.showPrice ? text(colX, bottom - lineHeight(size.price), colW, size.price, true, "left") : null;
  if (price) bottom -= lineHeight(price.size);
  const nameLines = Math.max(1, Math.min(2, Math.floor((bottom - top) / lineHeight(size.name))));
  const name = opts.showName ? text(colX, top, colW, size.name, true, "left", nameLines) : null;
  return { pad, business, name, price, codeText, code, digitsSize: size.digits };
}

/** Width of a text in mm at a size in points. The PDF measures with jsPDF; the preview estimates. */
export type Measure = (text: string, sizePt: number, bold: boolean) => number;
export const approxMeasure: Measure = (text, size, bold) => [...text].length * size * PT * (bold ? 0.58 : 0.53);

/** Word-wraps into at most maxLines lines of the width; what does not fit ends in "...". */
export function fitLines(text: string, width: number, maxLines: number, size: number, bold: boolean, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines < 1) return [];
  const fits = (s: string) => measure(s, size, bold) <= width;
  const cut = (s: string) => {
    let t = s;
    while (t.length > 1 && !fits(`${t}...`)) t = t.slice(0, -1);
    return `${t.trimEnd()}...`;
  };
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && fits(`${line} ${words[i]}`)) line += ` ${words[i++]}`;
    lines.push(line);
  }
  const last = lines.length - 1;
  lines.forEach((line, j) => {
    if (j === last && i < words.length) lines[j] = cut(`${line} ${words.slice(i).join(" ")}`);
    else if (!fits(line)) lines[j] = cut(line);
  });
  return lines;
}

// ---- Bars and QR modules ----

/** One part of a linear barcode as jsbarcode encodes it: "1" a bar module, "0" a space; guard parts run longer. */
export interface BarSegment { x: number; data: string; text: string; align: "left" | "center" | "right"; guard: boolean }
export interface BarPattern { modules: number; quietLeft: number; quietRight: number; segments: BarSegment[] }
export interface JsBarcodeEncoding { data: string; text?: string; options?: { textAlign?: string; height?: number } }

/** Light margins either side so scanners find the start; the EAN-13 left margin is in jsbarcode's first part. */
export const QUIET_ZONES: Record<Exclude<BarcodeFormat, "qr">, [number, number]> = { ean13: [0, 7], upca: [1, 1], ean8: [7, 7], code128: [10, 10] };

export function patternFromEncodings(encodings: JsBarcodeEncoding[], quiet: [number, number]): BarPattern {
  let x = 0;
  const segments = encodings.map((e) => {
    const align: BarSegment["align"] = e.options?.textAlign === "left" ? "left" : e.options?.textAlign === "right" ? "right" : "center";
    const seg: BarSegment = { x, data: e.data, text: e.text ?? "", align, guard: e.options?.height !== undefined && !e.text };
    x += e.data.length;
    return seg;
  });
  return { modules: x, quietLeft: quiet[0], quietRight: quiet[1], segments };
}

/** Runs of consecutive bar modules: "1101110" -> [{0,2},{3,3}]. */
export function barRuns(data: string): { start: number; width: number }[] {
  const runs: { start: number; width: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== "1") continue;
    const start = i;
    while (data[i + 1] === "1") i++;
    runs.push({ start, width: i - start + 1 });
  }
  return runs;
}

export interface Rect { x: number; y: number; w: number; h: number }
/** y is the baseline; size in points. */
export interface TextItem { x: number; y: number; text: string; size: number; bold: boolean; align: "left" | "center" | "right"; mono: boolean }
export interface Drawing { rects: Rect[]; texts: TextItem[] }

/** Bars (and the digits under them) fitted to a box, centred, a module at most maxModule mm wide. */
export function barsDrawing(pattern: BarPattern, box: Box, digitsSize: number, maxModule = 0.5): Drawing {
  const total = pattern.quietLeft + pattern.modules + pattern.quietRight;
  const m = Math.min(box.w / total, maxModule);
  const left = box.x + (box.w - total * m) / 2 + pattern.quietLeft * m;
  const hasText = pattern.segments.some((s) => s.text);
  const textH = hasText ? lineHeight(digitsSize) : 0;
  const barH = Math.max(0, box.h - textH);
  const out: Drawing = { rects: [], texts: [] };
  for (const s of pattern.segments) {
    const h = barH + (s.guard ? textH / 2 : 0);
    for (const r of barRuns(s.data)) out.rects.push({ x: left + (s.x + r.start) * m, y: box.y, w: r.width * m, h });
    if (!s.text) continue;
    const x = s.align === "left" ? left + s.x * m : s.align === "right" ? left + (s.x + s.data.length) * m : left + (s.x + s.data.length / 2) * m;
    out.texts.push({ x, y: box.y + barH + textH * 0.8, text: s.text, size: digitsSize, bold: false, align: s.align, mono: false });
  }
  return out;
}

/** QR modules (size x size, row by row) as rectangles in a square centred in the box, one module of margin. */
export function qrDrawing(size: number, cells: ArrayLike<number | boolean>, box: Box): Drawing {
  const side = Math.min(box.w, box.h);
  const m = side / (size + 2);
  const x0 = box.x + (box.w - side) / 2 + m;
  const y0 = box.y + (box.h - side) / 2 + m;
  const rects: Rect[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!cells[row * size + col]) continue;
      const start = col;
      while (col + 1 < size && cells[row * size + col + 1]) col++;
      rects.push({ x: x0 + start * m, y: y0 + row * m, w: (col - start + 1) * m, h: m });
    }
  }
  return { rects, texts: [] };
}

export type CodeSymbol = { kind: "bars"; format: Exclude<BarcodeFormat, "qr">; pattern: BarPattern } | { kind: "qr"; size: number; cells: ArrayLike<number | boolean> };
export interface LabelData { code: string; name: string; price: string; business: string }

/** Everything on one label, relative to its top-left corner. A QR code (chosen, or a code that only fits a QR) uses the QR layout. */
export function labelDrawing(data: LabelData, symbol: CodeSymbol, w: number, h: number, opts: LabelOptions, measure: Measure = approxMeasure): Drawing {
  const boxes = labelBoxes(w, h, { ...opts, qr: symbol.kind === "qr" });
  const code = symbol.kind === "qr" ? qrDrawing(symbol.size, symbol.cells, boxes.code) : barsDrawing(symbol.pattern, boxes.code, boxes.digitsSize);
  const texts = [...code.texts];
  const put = (box: TextBox | null, text: string) => {
    if (!box || !text) return;
    fitLines(text, box.w, box.lines, box.size, box.bold, measure).forEach((line, i) => {
      texts.push({ x: box.align === "center" ? box.x + box.w / 2 : box.x, y: box.y + lineHeight(box.size) * (i + 0.8), text: line, size: box.size, bold: box.bold, align: box.align, mono: box.mono });
    });
  };
  put(boxes.business, data.business);
  put(boxes.name, data.name);
  put(boxes.price, data.price);
  put(boxes.codeText, data.code);
  return { rects: code.rects, texts };
}

// ---- SVG (preview and product form thumbnails) ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v: number) => String(Math.round(v * 1000) / 1000);

/** One drawing (or several, each moved by dx/dy) as an SVG in mm, black on white, label outlines dashed. */
export function drawingSvg(width: number, height: number, parts: { dx: number; dy: number; drawing: Drawing; outline?: { w: number; h: number } }[]): string {
  const body = parts.map(({ dx, dy, drawing, outline }) => {
    const rects = drawing.rects.map((r) => `<rect x="${n2(r.x)}" y="${n2(r.y)}" width="${n2(r.w)}" height="${n2(r.h)}"/>`).join("");
    const texts = drawing.texts.map((t) => {
      const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
      return `<text x="${n2(t.x)}" y="${n2(t.y)}" font-size="${n2(t.size * PT)}" text-anchor="${anchor}"${t.bold ? ' font-weight="bold"' : ""}${t.mono ? ' font-family="monospace"' : ""}>${esc(t.text)}</text>`;
    }).join("");
    const box = outline ? `<rect x="0" y="0" width="${n2(outline.w)}" height="${n2(outline.h)}" fill="none" stroke="#bdbdbd" stroke-width="0.2" stroke-dasharray="1 1"/>` : "";
    return `<g transform="translate(${n2(dx)} ${n2(dy)})">${box}${rects}${texts}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(width)} ${n2(height)}" width="${n2(width)}mm" height="${n2(height)}mm" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${body}</g></svg>`;
}

/** A code on its own (product form preview): bars at 0.33 mm a module with digits, or a 20 mm QR code. */
export function symbolSvg(symbol: CodeSymbol): string {
  if (symbol.kind === "qr") return drawingSvg(20, 20, [{ dx: 0, dy: 0, drawing: qrDrawing(symbol.size, symbol.cells, { x: 0, y: 0, w: 20, h: 20 }) }]);
  const total = symbol.pattern.quietLeft + symbol.pattern.modules + symbol.pattern.quietRight;
  const w = total * 0.33;
  return drawingSvg(w, 14, [{ dx: 0, dy: 0, drawing: barsDrawing(symbol.pattern, { x: 0, y: 1, w, h: 12.5 }, 7, 0.33) }]);
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// ---- Loading and output (not pure: imports jsbarcode, qrcode and jsPDF when first used) ----

const JS_FORMATS: Record<Exclude<BarcodeFormat, "qr">, string> = { ean13: "EAN13", upca: "UPC", ean8: "EAN8", code128: "CODE128" };
const symbols = new Map<string, Promise<CodeSymbol>>();

function interop<T>(mod: T): T {
  return (mod as unknown as { default?: T }).default ?? mod;
}

async function qrSymbol(code: string): Promise<CodeSymbol> {
  const qr = interop(await import("qrcode"));
  const m = qr.create(code, { errorCorrectionLevel: "M" }).modules;
  return { kind: "qr", size: m.size, cells: m.data };
}

/** The bars of a code in its own format (EAN-13, UPC-A, EAN-8, Code 128), or a QR code when asked or when it only fits a QR. Cached. */
export function loadSymbol(code: string, qr = false): Promise<CodeSymbol> {
  const key = `${qr ? "qr" : "bars"}:${code}`;
  let p = symbols.get(key);
  if (!p) {
    p = (async (): Promise<CodeSymbol> => {
      const format = barcodeFormat(code);
      if (qr || format === "qr") return qrSymbol(code);
      const JsBarcode = (await import("jsbarcode")).default;
      const target: { encodings?: JsBarcodeEncoding[] } = {};
      let valid = true;
      JsBarcode(target, code, { format: JS_FORMATS[format], displayValue: true, valid: (v: boolean) => { valid = v; } });
      if (!valid || !target.encodings?.length) return qrSymbol(code);
      return { kind: "bars", format, pattern: patternFromEncodings(target.encodings, QUIET_ZONES[format]) };
    })();
    p.catch(() => symbols.delete(key));
    symbols.set(key, p);
  }
  return p;
}

export async function loadSymbols(codes: string[], qr: boolean): Promise<Map<string, CodeSymbol>> {
  const unique = [...new Set(codes)];
  const loaded = await Promise.all(unique.map((c) => loadSymbol(c, qr)));
  return new Map(unique.map((c, i) => [c, loaded[i]]));
}

/** Builds the label PDF (vector bars and text, so it prints sharp at any size) and downloads it. */
export async function downloadLabelsPdf(items: LabelData[], preset: LabelPreset, opts: LabelOptions, skip: number, filename: string): Promise<void> {
  const [{ jsPDF }, found] = await Promise.all([import("jspdf"), loadSymbols(items.map((i) => i.code), opts.qr)]);
  const orientation = preset.pageWidth > preset.pageHeight ? "landscape" : "portrait";
  const format: string | number[] = preset.sheet ? "a4" : [preset.pageWidth, preset.pageHeight];
  const doc = new jsPDF({ unit: "mm", format, orientation });
  const measure: Measure = (text, size, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); return doc.getTextWidth(text); };
  const drawings = new Map<LabelData, Drawing>();
  doc.setFillColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  layoutLabels(items, preset, skip).forEach((page, i) => {
    if (i > 0) doc.addPage(format, orientation);
    for (const spot of page) {
      let d = drawings.get(spot.item);
      if (!d) { d = labelDrawing(spot.item, found.get(spot.item.code)!, spot.w, spot.h, opts, measure); drawings.set(spot.item, d); }
      for (const r of d.rects) doc.rect(spot.x + r.x, spot.y + r.y, r.w, r.h, "F");
      for (const t of d.texts) {
        doc.setFont(t.mono ? "courier" : "helvetica", t.bold ? "bold" : "normal");
        doc.setFontSize(t.size);
        doc.text(t.text, spot.x + t.x, spot.y + t.y, { align: t.align });
      }
    }
  });
  doc.save(filename);
}
