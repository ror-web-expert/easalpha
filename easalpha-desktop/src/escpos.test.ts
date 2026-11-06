import { test } from "node:test";
import assert from "node:assert/strict";
import { CMD, barcode, barcodeModuleWidth, charsPerLine, code128Modules, divider, encodeLines, encodeText, feedLines, qrCode, renderPlainText } from "./escpos";

const hex = (b: Buffer) => b.toString("hex");
const includes = (hay: Buffer, needle: Buffer) => hay.indexOf(needle) !== -1;

test("job starts with ESC @ (init) and ESC t 0 (CP437)", () => {
  const out = encodeLines([{ text: "Hi" }], 80);
  assert.equal(hex(out.subarray(0, 2)), "1b40");
  assert.equal(hex(out.subarray(2, 5)), "1b7400");
});

test("plain text is ASCII bytes followed by LF", () => {
  const out = encodeLines([{ text: "EasAlpha" }], 80);
  assert.ok(includes(out, Buffer.concat([Buffer.from("EasAlpha", "ascii"), CMD.lf])));
});

test("non-ASCII characters (Urdu) are replaced by ?", () => {
  assert.equal(encodeText("چائے Rs").toString("latin1"), "???? Rs");
  assert.equal(encodeText("a\tb").toString("latin1"), "a b");
});

test("align center and right emit ESC a 1 / ESC a 2 and reset to left", () => {
  const center = encodeLines([{ text: "x", align: "center" }], 58);
  assert.ok(includes(center, CMD.alignCenter));
  assert.ok(center.lastIndexOf(CMD.alignLeft) > center.indexOf(CMD.alignCenter));
  const right = encodeLines([{ text: "x", align: "right" }], 58);
  assert.ok(includes(right, CMD.alignRight));
});

test("bold wraps text in ESC E 1 ... ESC E 0", () => {
  const out = encodeLines([{ text: "Total", bold: true }], 80);
  const on = out.indexOf(CMD.boldOn);
  const txt = out.indexOf(Buffer.from("Total"));
  const off = out.indexOf(CMD.boldOff);
  assert.ok(on !== -1 && txt > on && off > txt);
});

test("size 2 wraps text in GS ! 0x11 ... GS ! 0x00", () => {
  const out = encodeLines([{ text: "BIG", size: 2 }], 80);
  const on = out.indexOf(CMD.sizeDouble);
  const off = out.indexOf(CMD.sizeNormal);
  assert.ok(on !== -1 && off > on);
});

test("divider is 32 dashes for 58 mm and 48 dashes for 80 mm", () => {
  assert.equal(charsPerLine(58), 32);
  assert.equal(charsPerLine(80), 48);
  assert.equal(divider(58).toString("latin1"), "-".repeat(32) + "\n");
  assert.equal(divider(80).toString("latin1"), "-".repeat(48) + "\n");
  const job = encodeLines([{ divider: true }], 58);
  assert.ok(includes(job, Buffer.from("-".repeat(32))));
  assert.ok(!includes(job, Buffer.from("-".repeat(33))));
});

test("long text wraps at the paper width", () => {
  const text = "A".repeat(40);
  const out = encodeLines([{ text }], 58);
  assert.ok(includes(out, Buffer.concat([Buffer.from("A".repeat(32)), CMD.lf, Buffer.from("A".repeat(8)), CMD.lf])));
});

test("QR uses GS ( k with the correct store length and print command", () => {
  const data = "https://easalpha.com/r/123";
  const qr = qrCode(data);
  const len = data.length + 3;
  // model, size, error correction
  assert.ok(includes(qr, Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00])));
  assert.ok(includes(qr, Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06])));
  assert.ok(includes(qr, Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31])));
  // store: pL pH then '1' 'P' '0' then data
  assert.ok(includes(qr, Buffer.concat([Buffer.from([0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30]), Buffer.from(data)])));
  // print
  assert.ok(hex(qr).endsWith("1d286b03003151" + "30"));
  const job = encodeLines([{ qr: data }], 80);
  assert.ok(includes(job, qr));
});

test("QR store length high byte is set for data over 255 bytes", () => {
  const data = "x".repeat(300);
  const qr = qrCode(data);
  const len = 303;
  assert.ok(includes(qr, Buffer.from([0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30])));
});

test("feed emits ESC d n and clamps to 0..255", () => {
  assert.equal(hex(feedLines(3)), "1b6403");
  assert.equal(hex(feedLines(999)), "1b64ff");
  assert.equal(hex(feedLines(-1)), "1b6400");
  assert.ok(includes(encodeLines([{ feed: 4 }], 80), Buffer.from([0x1b, 0x64, 0x04])));
});

test("cut emits partial cut GS V 1", () => {
  const out = encodeLines([{ text: "end" }, { cut: true }], 80);
  assert.equal(hex(out.subarray(out.length - 3)), "1d5601");
});

test("drawer emits ESC p 0 kick", () => {
  const out = encodeLines([{ drawer: true }], 80);
  assert.ok(includes(out, Buffer.from([0x1b, 0x70, 0x00])));
  assert.equal(hex(out.subarray(out.length - 5)), "1b70001" + "97d");
});

test("full receipt encodes in order: header, items, QR, feed, cut", () => {
  const out = encodeLines(
    [
      { text: "EasAlpha Cafe", align: "center", bold: true, size: 2 },
      { divider: true },
      { text: "1 x Chai            Rs 150" },
      { qr: "https://easalpha.com/menu" },
      { feed: 3 },
      { cut: true },
    ],
    80,
  );
  const iCafe = out.indexOf(Buffer.from("EasAlpha Cafe"));
  const iDiv = out.indexOf(Buffer.from("-".repeat(48)));
  const iItem = out.indexOf(Buffer.from("1 x Chai"));
  const iQr = out.indexOf(Buffer.from("https://easalpha.com/menu"));
  const iFeed = out.indexOf(Buffer.from([0x1b, 0x64, 0x03]));
  const iCut = out.indexOf(CMD.partialCut);
  assert.ok(iCafe < iDiv && iDiv < iItem && iItem < iQr && iQr < iFeed && iFeed < iCut);
});

test("renderPlainText centres, right-aligns and wraps for the system transport", () => {
  const rows = renderPlainText(
    [{ text: "Hi", align: "center" }, { text: "9.00", align: "right" }, { divider: true }, { text: "B".repeat(35) }],
    58,
  );
  assert.equal(rows[0], " ".repeat(15) + "Hi");
  assert.equal(rows[1], " ".repeat(28) + "9.00");
  assert.equal(rows[2], "-".repeat(32));
  assert.equal(rows[3], "B".repeat(32));
  assert.equal(rows[4], "B".repeat(3));
});

test("barcode is GS k 73 CODE128 in code set B with HRI below, centred, and skips an empty or non-ASCII value", () => {
  const out = encodeLines([{ barcode: "261030-MAIN-42" }], 80);
  assert.ok(includes(out, Buffer.from([0x1d, 0x48, 0x02]))); // HRI below
  assert.ok(includes(out, Buffer.from([0x1d, 0x68, 64]))); // height
  assert.ok(includes(out, Buffer.from([0x1d, 0x77, 0x02]))); // module width
  const payload = Buffer.from("{B261030-MAIN-42", "ascii");
  assert.ok(includes(out, Buffer.concat([Buffer.from([0x1d, 0x6b, 0x49, payload.length]), payload])));
  assert.ok(out.indexOf(CMD.alignCenter) < out.indexOf(payload));
  assert.equal(barcode("", 80).length, 0);
  assert.equal(barcode("چائے", 80).length, 0);
  assert.equal(encodeLines([{ barcode: "" }], 80).length, encodeLines([], 80).length);
  assert.deepEqual(renderPlainText([{ barcode: "261030-MAIN-42" }], 58), ["    [BARCODE] 261030-MAIN-42"]); // centred on 32 columns
});

test("barcode module width follows the paper: 2 dots when the symbol and quiet zones fit, else 1 dot with taller bars, else none", () => {
  // Code set B: 11 modules a character plus start, check and stop; 10 modules of quiet zone each side.
  assert.equal(code128Modules(14), 189);
  assert.equal(barcodeModuleWidth(14, 80), 2); // (189 + 20) * 2 = 418 of 576 dots
  assert.equal(barcodeModuleWidth(14, 58), 1); // 418 > 384; 209 fits
  assert.equal(barcodeModuleWidth(21, 80), 2);
  assert.equal(barcodeModuleWidth(22, 80), 1);
  assert.equal(barcodeModuleWidth(47, 80), 1);
  assert.equal(barcodeModuleWidth(48, 80), 0);
  assert.equal(barcodeModuleWidth(12, 58), 2);
  assert.equal(barcodeModuleWidth(13, 58), 1);
  assert.equal(barcodeModuleWidth(29, 58), 1);
  assert.equal(barcodeModuleWidth(30, 58), 0);
  const narrow = barcode("261030-MAIN-42", 58);
  assert.ok(includes(narrow, Buffer.from([0x1d, 0x77, 0x01]))); // GS w 1
  assert.ok(includes(narrow, Buffer.from([0x1d, 0x68, 80]))); // taller bars for thin modules
  assert.ok(!includes(narrow, Buffer.from([0x1d, 0x77, 0x02])));
  const wide = barcode("261030-MAIN-42", 80);
  assert.ok(includes(wide, Buffer.from([0x1d, 0x77, 0x02])) && includes(wide, Buffer.from([0x1d, 0x68, 64])));
});

test("a value too wide for the paper prints as a centred text line instead of a barcode the firmware would drop", () => {
  const value = "261030-SOMELONGBRANCHNAME-000123"; // 32 characters: 11 * 34 + 13 + 20 = 407 modules, over 384 dots
  assert.equal(value.length, 32);
  assert.equal(barcode(value, 58).length, 0);
  const out = encodeLines([{ barcode: value }], 58);
  assert.ok(!includes(out, Buffer.from([0x1d, 0x6b, 0x49]))); // no GS k 73
  assert.ok(includes(out, Buffer.concat([CMD.alignCenter, Buffer.from(value, "ascii"), CMD.lf])));
  // The same value still fits 80 mm paper at 1-dot modules.
  const wide = encodeLines([{ barcode: value }], 80);
  assert.ok(includes(wide, Buffer.from([0x1d, 0x77, 0x01])));
  assert.ok(includes(wide, Buffer.from("{B" + value, "ascii")));
});

test("barcode mode plain sends GS k 73 with the data alone (no {B prefix); mode off prints the number as text", () => {
  const data = Buffer.from("261030-MAIN-42", "ascii");
  for (const width of [58, 80] as const) {
    const plain = encodeLines([{ barcode: "261030-MAIN-42" }], width, { barcode: "plain" });
    assert.ok(includes(plain, Buffer.concat([Buffer.from([0x1d, 0x6b, 0x49, data.length]), data])));
    assert.ok(!includes(plain, Buffer.from("{B", "ascii")));
    assert.ok(includes(plain, Buffer.from([0x1d, 0x77, width === 80 ? 2 : 1]))); // still sized for the paper
    const off = encodeLines([{ barcode: "261030-MAIN-42" }], width, { barcode: "off" });
    assert.ok(!includes(off, Buffer.from([0x1d, 0x6b])));
    assert.ok(includes(off, Buffer.concat([CMD.alignCenter, data, CMD.lf, CMD.alignLeft])));
  }
  // An empty or non-ASCII value prints nothing in any mode.
  assert.equal(encodeLines([{ barcode: "چائے" }], 58, { barcode: "off" }).length, encodeLines([], 58).length);
});
