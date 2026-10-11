// Pure ESC/POS encoder: PrintLine[] -> Buffer. No Electron or Node I/O here so it
// can be unit tested on its own.
import type { PaperWidth, PrintLine } from "./types";

const ESC = 0x1b;
const GS = 0x1d;

/** Characters per line at the common 12x24 font. */
export function charsPerLine(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

/**
 * Text to CP437-compatible bytes. Only the ASCII range is mapped; anything
 * else (Urdu, curly quotes, the rupee sign) becomes "?" for now. Urdu will be
 * rendered as a raster image in a later phase.
 */
export function encodeText(text: string): Buffer {
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code === 0x09) {
      out[n++] = 0x20;
    } else if (code >= 0x20 && code <= 0x7e) {
      out[n++] = code;
    } else if (code === 0x0a || code === 0x0d) {
      // Line breaks inside a text line are handled by splitting; skip here.
      continue;
    } else {
      out[n++] = 0x3f; // "?"
    }
  }
  return out.subarray(0, n);
}

export const CMD = {
  init: Buffer.from([ESC, 0x40]), // ESC @
  alignLeft: Buffer.from([ESC, 0x61, 0x00]), // ESC a 0
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignRight: Buffer.from([ESC, 0x61, 0x02]),
  boldOn: Buffer.from([ESC, 0x45, 0x01]), // ESC E 1
  boldOff: Buffer.from([ESC, 0x45, 0x00]),
  sizeNormal: Buffer.from([GS, 0x21, 0x00]), // GS ! 0
  sizeDouble: Buffer.from([GS, 0x21, 0x11]), // double width and height
  codepageCP437: Buffer.from([ESC, 0x74, 0x00]), // ESC t 0
  lf: Buffer.from([0x0a]),
  partialCut: Buffer.from([GS, 0x56, 0x01]), // GS V 1
  /** ESC p 0 : kick drawer on pin 2, 50 ms on / 250 ms off. */
  drawerKick: Buffer.from([ESC, 0x70, 0x00, 0x19, 0x7d]),
};

/** ESC d n : print and feed n lines. */
export function feedLines(n: number): Buffer {
  const count = Math.max(0, Math.min(255, Math.floor(n)));
  return Buffer.from([ESC, 0x64, count]);
}

/**
 * QR code via GS ( k (model 2, module size, error correction M, store, print).
 */
export function qrCode(data: string, moduleSize = 6): Buffer {
  const payload = Buffer.from(data, "utf8");
  const storeLen = payload.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  return Buffer.concat([
    Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // model 2
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize & 0xff]), // module size
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]), // error correction M
    Buffer.from([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]), // store data
    payload,
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]), // print
  ]);
}

export function divider(width: PaperWidth): Buffer {
  return Buffer.concat([encodeText("-".repeat(charsPerLine(width))), CMD.lf]);
}

function textLine(
  line: { text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 },
  width: PaperWidth,
): Buffer {
  const parts: Buffer[] = [];
  const align =
    line.align === "center" ? CMD.alignCenter : line.align === "right" ? CMD.alignRight : CMD.alignLeft;
  parts.push(align);
  if (line.bold) parts.push(CMD.boldOn);
  if (line.size === 2) parts.push(CMD.sizeDouble);

  const cols = line.size === 2 ? Math.floor(charsPerLine(width) / 2) : charsPerLine(width);
  const rows = line.text.split(/\r?\n/);
  for (const row of rows) {
    // Wrap rows longer than the paper width so nothing is lost off the edge.
    if (row.length === 0) {
      parts.push(CMD.lf);
      continue;
    }
    for (let i = 0; i < row.length; i += cols) {
      parts.push(encodeText(row.slice(i, i + cols)), CMD.lf);
    }
  }

  if (line.size === 2) parts.push(CMD.sizeNormal);
  if (line.bold) parts.push(CMD.boldOff);
  if (line.align && line.align !== "left") parts.push(CMD.alignLeft);
  return Buffer.concat(parts);
}

/**
 * Encode a full job. Starts with ESC @ and the CP437 codepage. Does not add a
 * cut or feed on its own; the caller includes { feed } / { cut } lines.
 */
export function encodeLines(lines: PrintLine[], width: PaperWidth): Buffer {
  const parts: Buffer[] = [CMD.init, CMD.codepageCP437];
  for (const line of lines) {
    if ("text" in line) {
      parts.push(textLine(line, width));
    } else if ("qr" in line) {
      parts.push(CMD.alignCenter, qrCode(line.qr), CMD.alignLeft);
    } else if ("feed" in line) {
      parts.push(feedLines(line.feed));
    } else if ("divider" in line) {
      parts.push(divider(width));
    } else if ("cut" in line) {
      parts.push(CMD.partialCut);
    } else if ("drawer" in line) {
      parts.push(CMD.drawerKick);
    }
  }
  return Buffer.concat(parts);
}

/**
 * Plain-text rendering of the same lines, used by the "system" transport which
 * prints through the OS driver as monospace HTML, and by test prints.
 */
export function renderPlainText(lines: PrintLine[], width: PaperWidth): string[] {
  const cols = charsPerLine(width);
  const out: string[] = [];
  const pad = (s: string, align: "left" | "center" | "right" | undefined, c: number) => {
    if (s.length >= c) return s;
    const space = c - s.length;
    if (align === "center") {
      const left = Math.floor(space / 2);
      return " ".repeat(left) + s;
    }
    if (align === "right") return " ".repeat(space) + s;
    return s;
  };
  for (const line of lines) {
    if ("text" in line) {
      const c = line.size === 2 ? Math.floor(cols / 2) : cols;
      for (const row of line.text.split(/\r?\n/)) {
        if (row.length === 0) {
          out.push("");
          continue;
        }
        for (let i = 0; i < row.length; i += c) out.push(pad(row.slice(i, i + c), line.align, c));
      }
    } else if ("qr" in line) {
      out.push(pad(`[QR] ${line.qr}`, "center", cols));
    } else if ("feed" in line) {
      for (let i = 0; i < Math.min(line.feed, 10); i++) out.push("");
    } else if ("divider" in line) {
      out.push("-".repeat(cols));
    }
    // cut and drawer have no visual output
  }
  return out;
}
