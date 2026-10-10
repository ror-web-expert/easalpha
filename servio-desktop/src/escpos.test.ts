import { test } from "node:test";
import assert from "node:assert/strict";
import { CMD, charsPerLine, divider, encodeLines, encodeText, feedLines, qrCode, renderPlainText } from "./escpos";

const hex = (b: Buffer) => b.toString("hex");
const includes = (hay: Buffer, needle: Buffer) => hay.indexOf(needle) !== -1;

test("job starts with ESC @ (init) and ESC t 0 (CP437)", () => {
  const out = encodeLines([{ text: "Hi" }], 80);
  assert.equal(hex(out.subarray(0, 2)), "1b40");
  assert.equal(hex(out.subarray(2, 5)), "1b7400");
});

test("plain text is ASCII bytes followed by LF", () => {
  const out = encodeLines([{ text: "Servio" }], 80);
  assert.ok(includes(out, Buffer.concat([Buffer.from("Servio", "ascii"), CMD.lf])));
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
  const data = "https://servio.pk/r/123";
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
      { text: "Servio Cafe", align: "center", bold: true, size: 2 },
      { divider: true },
      { text: "1 x Chai            Rs 150" },
      { qr: "https://servio.pk/menu" },
      { feed: 3 },
      { cut: true },
    ],
    80,
  );
  const iCafe = out.indexOf(Buffer.from("Servio Cafe"));
  const iDiv = out.indexOf(Buffer.from("-".repeat(48)));
  const iItem = out.indexOf(Buffer.from("1 x Chai"));
  const iQr = out.indexOf(Buffer.from("https://servio.pk/menu"));
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
