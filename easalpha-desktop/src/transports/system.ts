// "system" transport: render the lines as monospace HTML in a hidden window and
// send it to a named OS printer through Electron's webContents.print. This is
// the fallback for printers that only have a Windows/CUPS driver.
import { BrowserWindow } from "electron";
import { renderPlainText } from "../escpos";
import type { PaperWidth, PrintLine } from "../types";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The bars of a Code 128 pattern ("1" bar, "0" space) as an SVG the driver prints as a graphic, 0.33 mm a module. */
export function barcodeSvg(bars: string, heightMm = 12): string {
  const rects: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] !== "1") continue;
    const start = i;
    while (bars[i + 1] === "1") i++;
    rects.push(`<rect x="${(start * 0.33).toFixed(2)}" y="0" width="${((i - start + 1) * 0.33).toFixed(2)}" height="${heightMm}"/>`);
  }
  const w = (bars.length * 0.33).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${heightMm}mm" viewBox="0 0 ${w} ${heightMm}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

export function linesToHtml(lines: PrintLine[], width: PaperWidth): string {
  const paperMm = width === 58 ? 48 : 72; // printable area
  // 1.5 mm a character, the printer's own font A, so charsPerLine(width) columns fill the printable area exactly
  // (12 px Courier is 7.2 px a character: 48 columns ran to 91 mm and the right edge fell off an 80 mm roll).
  const fontPx = 9.5;
  // Text rows go in <pre> blocks; a barcode whose bars the web app sent is drawn between them as a graphic.
  // A blank row is a single space: a text-mode driver (Generic / Text Only) only moves down for text it is given.
  const blocks: string[] = [];
  let pending: PrintLine[] = [];
  const flush = () => {
    if (!pending.length) return;
    blocks.push(`<pre>${escapeHtml(renderPlainText(pending, width).map((r) => r || " ").join("\n"))}</pre>`);
    pending = [];
  };
  for (const line of lines) {
    if ("barcode" in line && line.bars) {
      flush();
      blocks.push(`<div class="bc">${barcodeSvg(line.bars)}</div>`);
      pending.push({ text: line.barcode, align: "center" });
    } else pending.push(line);
  }
  flush();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Print</title>
<style>
  @page { margin: 0; size: ${width}mm auto; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${paperMm}mm; padding: 2mm 0 0 ${width === 58 ? 2 : 3}mm; }
  pre { margin: 0; font: ${fontPx}px/1.25 "Courier New", Consolas, monospace; white-space: pre; color: #000; }
  .bc { text-align: center; padding: 1mm 0; }
  .bc svg { display: inline-block; }
</style></head><body>${blocks.join("")}</body></html>`;
}

export async function listSystemPrinters(): Promise<{ name: string; displayName: string }[]> {
  const win = BrowserWindow.getAllWindows()[0] ?? new BrowserWindow({ show: false });
  const list = await win.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
}

export function sendToSystemPrinter(systemName: string | undefined, lines: PrintLine[], width: PaperWidth): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    const html = linesToHtml(lines, width);
    const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    const timer = setTimeout(() => {
      win.destroy();
      reject(new Error("System print did not finish within 30 s"));
    }, 30000);
    win.webContents.once("did-finish-load", () => {
      win.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: systemName || undefined,
          margins: { marginType: "none" },
        },
        (success, failureReason) => {
          clearTimeout(timer);
          win.destroy();
          success ? resolve() : reject(new Error(failureReason || "System print failed"));
        },
      );
    });
    win.webContents.once("did-fail-load", (_e, _code, desc) => {
      clearTimeout(timer);
      win.destroy();
      reject(new Error(`Could not render print page: ${desc}`));
    });
    void win.loadURL(url);
  });
}
