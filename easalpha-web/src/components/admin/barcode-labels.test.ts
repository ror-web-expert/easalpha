import { describe, expect, it } from "vitest";
import {
  LABEL_PRESETS, PT, approxMeasure, barRuns, barsDrawing, clampSkip, drawingSvg, expandCopies, fitLines, labelBoxes, labelDrawing, labelsPerPage, layoutLabels,
  lineHeight, loadSymbol, pageCount, patternFromEncodings, presetById, qrDrawing, slotPosition, symbolSvg, type Box, type CodeSymbol, type LabelOptions, type Measure,
} from "./barcode-labels";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const inside = (b: Box, w: number, h: number) => {
  expect(b.x).toBeGreaterThanOrEqual(-1e-9);
  expect(b.y).toBeGreaterThanOrEqual(-1e-9);
  expect(b.x + b.w).toBeLessThanOrEqual(w + 1e-9);
  expect(b.y + b.h).toBeLessThanOrEqual(h + 1e-9);
};

describe("presets", () => {
  it("has the four layouts with the right label counts", () => {
    expect(LABEL_PRESETS.map((p) => [p.id, labelsPerPage(p)])).toEqual([["a4-3x8", 24], ["a4-4x10", 40], ["roll-50x25", 1], ["roll-38x25", 1]]);
    expect(presetById("roll-38x25").labelWidth).toBe(38);
    expect(presetById("nope").id).toBe("a4-3x8");
  });

  it("keeps every slot on the page", () => {
    for (const p of LABEL_PRESETS) {
      for (let slot = 0; slot < labelsPerPage(p); slot++) {
        const { x, y } = slotPosition(p, slot);
        inside({ x, y, w: p.labelWidth, h: p.labelHeight }, p.pageWidth, p.pageHeight);
      }
    }
  });

  it("centres the A4 grids on the sheet", () => {
    for (const p of LABEL_PRESETS.filter((x) => x.sheet)) {
      const last = slotPosition(p, labelsPerPage(p) - 1);
      near(p.pageWidth - (last.x + p.labelWidth), p.marginLeft);
      near(p.pageHeight - (last.y + p.labelHeight), p.marginTop);
    }
  });

  it("numbers slots left to right, then down", () => {
    const a = presetById("a4-3x8");
    expect(slotPosition(a, 0)).toEqual({ x: 0, y: 0.5 });
    expect(slotPosition(a, 4)).toEqual({ x: 70, y: 37.5 });
    const b = presetById("a4-4x10");
    const last = slotPosition(b, 39);
    near(last.x, 153.5);
    near(last.y, 250.1);
  });
});

describe("pages", () => {
  const sheet = presetById("a4-3x8");
  const roll = presetById("roll-50x25");

  it("expands copies, ignoring blanks, negatives and fractions", () => {
    expect(expandCopies([{ item: "a", copies: 2 }, { item: "b", copies: 0 }, { item: "c", copies: 1.7 }, { item: "d", copies: -3 }])).toEqual(["a", "a", "c"]);
    expect(expandCopies([{ item: "x", copies: 5000 }])).toHaveLength(999);
  });

  it("fills a sheet and starts the next one", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const pages = layoutLabels(items, sheet);
    expect(pages.map((p) => p.length)).toEqual([24, 6]);
    expect(pages[1][0]).toMatchObject({ item: 24, page: 1, slot: 0, x: 0, y: 0.5, w: 70, h: 37 });
    expect(pageCount(30, sheet)).toBe(2);
    expect(pageCount(24, sheet)).toBe(1);
    expect(pageCount(0, sheet)).toBe(0);
  });

  it("skips the used labels of a part-used sheet", () => {
    const pages = layoutLabels(Array.from({ length: 30 }, (_, i) => i), sheet, 5);
    expect(pages.map((p) => p.length)).toEqual([19, 11]);
    expect(pages[0][0]).toMatchObject({ item: 0, slot: 5, ...slotPosition(sheet, 5) });
    expect(pageCount(30, sheet, 5)).toBe(2);
    expect(pageCount(19, sheet, 5)).toBe(1);
    expect(clampSkip(sheet, 99)).toBe(23);
    expect(clampSkip(sheet, -2)).toBe(0);
  });

  it("puts one label on each page of a roll and never skips", () => {
    const pages = layoutLabels(["a", "b", "c"], roll, 4);
    expect(pages).toHaveLength(3);
    expect(pages.every((p) => p.length === 1 && p[0].x === 0 && p[0].y === 0)).toBe(true);
    expect(clampSkip(roll, 4)).toBe(0);
  });
});

const ALL_OPTIONS: LabelOptions[] = [];
for (const showName of [true, false]) for (const showPrice of [true, false]) for (const showBusiness of [true, false]) for (const qr of [true, false]) ALL_OPTIONS.push({ showName, showPrice, showBusiness, qr });

describe("label layout", () => {
  it("keeps every box inside the label and leaves room for the code, for every preset and option", () => {
    for (const p of LABEL_PRESETS) {
      for (const o of ALL_OPTIONS) {
        const b = labelBoxes(p.labelWidth, p.labelHeight, o);
        inside(b.code, p.labelWidth, p.labelHeight);
        expect(b.code.h).toBeGreaterThan(o.qr ? 12 : 8);
        for (const t of [b.business, b.name, b.price, b.codeText]) {
          if (!t) continue;
          inside({ x: t.x, y: t.y, w: t.w, h: lineHeight(t.size) * t.lines }, p.labelWidth, p.labelHeight);
        }
      }
    }
  });

  it("stacks business, name, code and price without overlap (barcode)", () => {
    const b = labelBoxes(38, 25, { showName: true, showPrice: true, showBusiness: true, qr: false });
    expect(b.business!.y + lineHeight(b.business!.size)).toBeLessThanOrEqual(b.name!.y + 1e-9);
    expect(b.name!.y + lineHeight(b.name!.size)).toBeLessThanOrEqual(b.code.y + 1e-9);
    expect(b.code.y + b.code.h).toBeLessThanOrEqual(b.price!.y + 1e-9);
    expect(b.codeText).toBeNull();
    expect(b.name!.bold).toBe(true);
    expect(b.name!.align).toBe("center");
  });

  it("gives the bars the whole label when no text is shown", () => {
    const b = labelBoxes(50, 25, { showName: false, showPrice: false, showBusiness: false, qr: false });
    expect(b.code).toEqual({ x: b.pad, y: b.pad, w: 50 - 2 * b.pad, h: 25 - 2 * b.pad });
  });

  it("puts the QR square left and the text in a column on its right", () => {
    const b = labelBoxes(50, 25, { showName: true, showPrice: true, showBusiness: true, qr: true });
    expect(b.code.w).toBe(b.code.h);
    for (const t of [b.business!, b.name!, b.price!, b.codeText!]) {
      expect(t.x).toBeGreaterThan(b.code.x + b.code.w);
      expect(t.align).toBe("left");
    }
    expect(b.codeText!.mono).toBe(true);
    expect(b.name!.lines).toBe(2);
    // Bottom up: code text at the bottom, price above it, the name above the price.
    expect(b.price!.y + lineHeight(b.price!.size)).toBeLessThanOrEqual(b.codeText!.y + 1e-9);
    expect(b.name!.y + lineHeight(b.name!.size) * b.name!.lines).toBeLessThanOrEqual(b.price!.y + 1e-9);
  });

  it("scales type with the label height", () => {
    expect(labelBoxes(70, 37, ALL_OPTIONS[0]).name!.size).toBeGreaterThan(labelBoxes(38, 25, ALL_OPTIONS[0]).name!.size);
  });
});

describe("fitLines", () => {
  const mm: Measure = (t) => t.length; // 1 mm a character

  it("keeps a short text on one line", () => {
    expect(fitLines("Lays Masala", 20, 1, 8, false, mm)).toEqual(["Lays Masala"]);
  });

  it("wraps words onto the allowed lines", () => {
    expect(fitLines("Nestle Pure Life Water", 12, 2, 8, false, mm)).toEqual(["Nestle Pure", "Life Water"]);
  });

  it("ends the last line in ... when the text is longer", () => {
    expect(fitLines("Nestle Pure Life Water 1.5 litre", 12, 2, 8, false, mm)).toEqual(["Nestle Pure", "Life Wate..."]);
    expect(fitLines("Nestle Pure Life Water", 12, 1, 8, false, mm)).toEqual(["Nestle Pu..."]);
  });

  it("cuts a single word that is too wide", () => {
    expect(fitLines("Supercalifragilistic", 8, 2, 8, false, mm)).toEqual(["Super..."]);
  });

  it("returns nothing for blank text", () => {
    expect(fitLines("   ", 20, 2, 8, false, mm)).toEqual([]);
  });

  it("estimates wider text for bold and bigger sizes", () => {
    expect(approxMeasure("ABC", 10, true)).toBeGreaterThan(approxMeasure("ABC", 10, false));
    expect(approxMeasure("ABC", 12, false)).toBeGreaterThan(approxMeasure("ABC", 10, false));
  });
});

describe("bars", () => {
  // Shaped like jsbarcode's EAN-8 output: guard, 4 digits, middle guard, 4 digits, guard.
  const encodings = [
    { data: "101", options: { height: 112 } },
    { data: "0001101", text: "9638", options: { textAlign: "center" } },
    { data: "01010", options: { height: 112 } },
    { data: "1110010", text: "5074", options: { textAlign: "center" } },
    { data: "101", options: { height: 112 } },
  ];
  const pattern = patternFromEncodings(encodings, [7, 7]);

  it("finds runs of bar modules", () => {
    expect(barRuns("1101110")).toEqual([{ start: 0, width: 2 }, { start: 3, width: 3 }]);
    expect(barRuns("000")).toEqual([]);
    expect(barRuns("1")).toEqual([{ start: 0, width: 1 }]);
  });

  it("lays the segments end to end and marks the guards", () => {
    expect(pattern.modules).toBe(25);
    expect(pattern.segments.map((s) => [s.x, s.guard, s.text])).toEqual([[0, true, ""], [3, false, "9638"], [10, true, ""], [15, false, "5074"], [22, true, ""]]);
  });

  it("fits the bars to the box, caps the module width and centres them", () => {
    const d = barsDrawing(pattern, { x: 0, y: 0, w: 100, h: 10 }, 6, 0.5);
    // 7 + 25 + 7 = 39 modules at 0.5 mm = 19.5 mm, centred in 100 mm.
    near(d.rects[0].x, (100 - 19.5) / 2 + 7 * 0.5);
    near(d.rects[0].w, 0.5);
    const narrow = barsDrawing(pattern, { x: 0, y: 0, w: 19.5, h: 10 }, 6, 0.5);
    near(narrow.rects[0].x, 3.5);
  });

  it("runs the guard bars down into the digits", () => {
    const d = barsDrawing(pattern, { x: 0, y: 0, w: 39, h: 10 }, 6, 0.5);
    const textH = lineHeight(6);
    const guard = d.rects[0];
    const digit = d.rects.find((r) => r.x > guard.x + 2)!;
    near(digit.h, 10 - textH);
    near(guard.h, 10 - textH + textH / 2);
    expect(d.texts.map((t) => t.text)).toEqual(["9638", "5074"]);
    // 39 modules at 0.5 mm in a 39 mm box: the symbol starts at 9.75 mm, the bars 7 modules later; the first digit
    // group (modules 3 to 10) is centred at module 6.5.
    near(d.texts[0].x, 9.75 + 3.5 + 6.5 * 0.5);
    expect(d.texts[0].align).toBe("center");
  });

  it("draws QR modules as merged rows, square and centred", () => {
    const cells = [1, 1, 0, 0, 1, 1, 1, 0, 1];
    const d = qrDrawing(3, cells, { x: 0, y: 0, w: 10, h: 5 });
    const m = 5 / 5;
    expect(d.rects).toEqual([
      { x: 2.5 + m, y: m, w: 2 * m, h: m },
      { x: 2.5 + m + m, y: 2 * m, w: 2 * m, h: m },
      { x: 2.5 + m, y: 3 * m, w: m, h: m },
      { x: 2.5 + m + 2 * m, y: 3 * m, w: m, h: m },
    ]);
  });
});

describe("label drawing and SVG", () => {
  const bars: CodeSymbol = { kind: "bars", format: "ean8", pattern: patternFromEncodings([{ data: "101", options: { height: 1 } }, { data: "0110", text: "12", options: {} }], [7, 7]) };
  const qr: CodeSymbol = { kind: "qr", size: 3, cells: [1, 0, 1, 0, 1, 0, 1, 0, 1] };
  const data = { code: "96385074", name: "Lays Masala", price: "Rs 50", business: "Demo Cafe" };
  const all = { showName: true, showPrice: true, showBusiness: true, qr: false };

  it("puts the name, price and business on a barcode label", () => {
    const d = labelDrawing(data, bars, 50, 25, all);
    expect(d.texts.map((t) => t.text)).toEqual(["12", "Demo Cafe", "Lays Masala", "Rs 50"]);
    expect(d.rects.length).toBeGreaterThan(0);
    for (const r of d.rects) inside(r, 50, 25);
  });

  it("leaves out what is switched off", () => {
    const d = labelDrawing(data, bars, 50, 25, { ...all, showBusiness: false, showPrice: false });
    expect(d.texts.map((t) => t.text)).toEqual(["12", "Lays Masala"]);
  });

  it("uses the QR layout for a QR symbol and prints the code beside it", () => {
    const d = labelDrawing(data, qr, 50, 25, all);
    expect(d.texts.map((t) => t.text)).toEqual(["Demo Cafe", "Lays Masala", "Rs 50", "96385074"]);
    expect(d.texts.find((t) => t.text === "96385074")!.mono).toBe(true);
  });

  it("writes an SVG in mm with the text escaped", () => {
    const svg = drawingSvg(50, 25, [{ dx: 0, dy: 0, drawing: labelDrawing({ ...data, name: "Fish & <Chips>" }, bars, 50, 25, all), outline: { w: 50, h: 25 } }]);
    expect(svg).toContain('viewBox="0 0 50 25"');
    expect(svg).toContain('width="50mm"');
    expect(svg).toContain("Fish &amp; &lt;Chips&gt;");
    expect(svg).toContain('stroke-dasharray="1 1"');
    // Font sizes are in mm: 7.5 pt (the name on a 25 mm label) is 2.646 mm.
    expect(svg).toContain(`font-size="${Math.round(7.5 * PT * 1000) / 1000}"`);
  });
});

describe("loadSymbol (jsbarcode and qrcode)", () => {
  it("encodes EAN-13, UPC-A, EAN-8 and Code 128 with their quiet zones", async () => {
    const ean13 = await loadSymbol("4006381333931");
    expect(ean13).toMatchObject({ kind: "bars", format: "ean13", pattern: { modules: 107, quietLeft: 0, quietRight: 7 } });
    const upc = await loadSymbol("036000291452");
    expect(upc).toMatchObject({ kind: "bars", format: "upca", pattern: { modules: 111 } });
    const ean8 = await loadSymbol("96385074");
    expect(ean8).toMatchObject({ kind: "bars", format: "ean8", pattern: { modules: 67, quietLeft: 7, quietRight: 7 } });
    const c128 = await loadSymbol("ABC-123");
    expect(c128).toMatchObject({ kind: "bars", format: "code128", pattern: { modules: 112 } });
    expect(c128.kind === "bars" && c128.pattern.segments[0].text).toBe("ABC-123");
  });

  it("makes a QR code when asked, or when the code only fits a QR", async () => {
    const asked = await loadSymbol("4006381333931", true);
    expect(asked.kind).toBe("qr");
    const link = await loadSymbol("https://easalpha.com/p/42");
    expect(link).toMatchObject({ kind: "qr" });
    expect(link.kind === "qr" && link.size).toBeGreaterThanOrEqual(21);
  });

  it("caches each code", async () => {
    expect(loadSymbol("96385074")).toBe(loadSymbol("96385074"));
  });

  it("draws a thumbnail SVG of a code", async () => {
    const svg = symbolSvg(await loadSymbol("4006381333931"));
    expect(svg.startsWith("<svg")).toBe(true);
    // EAN-13 prints its first digit outside the bars, then two groups of six.
    expect(svg).toContain(">4</text>");
    expect(svg).toContain(">006381</text>");
    expect(svg).toContain(">333931</text>");
    expect(symbolSvg(await loadSymbol("x", true))).toContain('viewBox="0 0 20 20"');
  });
});
