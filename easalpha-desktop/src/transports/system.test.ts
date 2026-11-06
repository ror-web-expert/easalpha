import { test } from "node:test";
import assert from "node:assert/strict";
// Importing system.ts outside Electron is fine: `electron` resolves to the binary's path and BrowserWindow is only
// touched inside the functions that print.
import { barcodeModuleMm, barcodeSvg, linesToHtml, printableMm } from "./system";

// The length of a 14-character Code 128 in code set B (11 * 16 + 13); the pattern itself does not matter to the layout.
const bars = "10".repeat(94) + "1";
const widthMm = (svg: string) => Number(/width="([\d.]+)mm"/.exec(svg)![1]);

test("barcode SVG keeps 0.33 mm modules on 80 mm paper and shrinks to fit the 48 mm body of 58 mm paper", () => {
  assert.equal(bars.length, 189);
  assert.equal(widthMm(barcodeSvg(bars, printableMm(80))), 62.37);
  const narrow = widthMm(barcodeSvg(bars, printableMm(58)));
  assert.ok(narrow > 43 && narrow < 44, `narrow ${narrow}`);
  // Symbol plus a 10-module quiet zone each side is the whole body, never more.
  assert.ok(Math.abs((189 + 20) * barcodeModuleMm(189, 48) - 48) < 1e-9);
  // A much longer symbol still stays inside the body on either paper.
  const long = "10".repeat(300) + "1";
  assert.ok(widthMm(barcodeSvg(long, 72)) < 72);
  assert.ok(widthMm(barcodeSvg(long, 48)) < 48);
});

test("barcodeModuleMm caps at 0.33 mm and only shrinks when the symbol would not fit", () => {
  assert.equal(barcodeModuleMm(100, 72), 0.33);
  assert.equal(barcodeModuleMm(189, 72), 0.33);
  assert.equal(barcodeModuleMm(189, 48), 48 / 209);
});

test("system print page draws the bars in .bc capped at the body width, the number under them, and text only when the mode is off", () => {
  const html = linesToHtml([{ text: "Hi" }, { barcode: "261030-MAIN-42", bars }, { text: "Bye" }], 58);
  assert.ok(html.includes(".bc svg { display: inline-block; max-width: 100%; height: auto; }"));
  assert.ok(html.includes('<div class="bc"><svg'));
  assert.ok(html.indexOf("Hi") < html.indexOf("<svg") && html.indexOf("<svg") < html.indexOf("261030-MAIN-42"));
  const off = linesToHtml([{ barcode: "261030-MAIN-42", bars }], 58, { barcode: "off" });
  assert.ok(!off.includes("<svg"));
  assert.ok(off.includes("261030-MAIN-42"));
  // A job without bars (not from the web app) prints the number as a text row.
  const noBars = linesToHtml([{ barcode: "261030-MAIN-42" }], 80);
  assert.ok(!noBars.includes("<svg") && noBars.includes("[BARCODE] 261030-MAIN-42"));
});
