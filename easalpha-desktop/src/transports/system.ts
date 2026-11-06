// "system" transport: render the lines as monospace HTML in a hidden window and
// send it to a named OS printer through Electron's webContents.print. This is
// the fallback for printers that only have a Windows/CUPS driver.
import { BrowserWindow } from "electron";
import { renderPlainText } from "../escpos";
import type { PaperWidth, PrintLine } from "../types";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function linesToHtml(lines: PrintLine[], width: PaperWidth): string {
  // A blank row is a single space: a text-mode driver (Generic / Text Only) only moves down for text it is given.
  const rows = renderPlainText(lines, width).map((r) => r || " ");
  const paperMm = width === 58 ? 48 : 72; // printable area
  // 1.5 mm a character, the printer's own font A, so charsPerLine(width) columns fill the printable area exactly
  // (12 px Courier is 7.2 px a character: 48 columns ran to 91 mm and the right edge fell off an 80 mm roll).
  const fontPx = 9.5;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Print</title>
<style>
  @page { margin: 0; size: ${width}mm auto; }
  html, body { margin: 0; padding: 0; background: #fff; }
  pre { width: ${paperMm}mm; margin: 0; padding: 2mm 0 0 ${width === 58 ? 2 : 3}mm; font: ${fontPx}px/1.25 "Courier New", Consolas, monospace; white-space: pre; color: #000; }
</style></head><body><pre>${escapeHtml(rows.join("\n"))}</pre></body></html>`;
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
