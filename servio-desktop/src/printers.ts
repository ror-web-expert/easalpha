// Printer selection and dispatch. Used by both the renderer bridge (IPC) and
// the LAN print server, so the two paths behave identically.
import { encodeLines } from "./escpos";
import { loadSettings } from "./settings";
import { sendToNetworkPrinter } from "./transports/network";
import { sendToSystemPrinter } from "./transports/system";
import { sendToUsbPrinter } from "./transports/usb";
import type { PrintJob, PrintLine, PrintResult, PrinterConfig, PrinterInfo } from "./types";

export function listPrinters(): PrinterInfo[] {
  return loadSettings().printers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, width: p.width, role: p.role }));
}

/** printerId, else a printer whose role matches the job role, else the first printer. */
export function choosePrinter(job: Pick<PrintJob, "role" | "printerId">, printers: PrinterConfig[]): PrinterConfig | undefined {
  if (job.printerId) {
    const byId = printers.find((p) => p.id === job.printerId);
    if (byId) return byId;
  }
  const byRole = printers.find((p) => p.role === job.role);
  if (byRole) return byRole;
  if (job.role === "report") {
    // Reports go to the receipt printer when one is marked.
    const receipt = printers.find((p) => p.role === "receipt");
    if (receipt) return receipt;
  }
  return printers[0];
}

function validLines(lines: unknown): lines is PrintLine[] {
  if (!Array.isArray(lines)) return false;
  return lines.every((l) => l && typeof l === "object");
}

export async function printToPrinter(printer: PrinterConfig, lines: PrintLine[]): Promise<void> {
  switch (printer.kind) {
    case "network": {
      await sendToNetworkPrinter(printer.host ?? "", printer.port ?? 9100, encodeLines(lines, printer.width));
      return;
    }
    case "usb": {
      await sendToUsbPrinter(printer.vendorId, printer.productId, encodeLines(lines, printer.width));
      return;
    }
    case "system": {
      await sendToSystemPrinter(printer.systemName, lines, printer.width);
      return;
    }
  }
}

export async function print(job: PrintJob): Promise<PrintResult> {
  try {
    if (!job || typeof job !== "object") return { ok: false, error: "Print job is missing" };
    if (!validLines(job.lines)) return { ok: false, error: "Print job has no lines" };
    const printers = loadSettings().printers;
    if (printers.length === 0) {
      return { ok: false, error: "No printers are set up. Open Printers from the app menu to add one." };
    }
    const printer = choosePrinter(job, printers);
    if (!printer) return { ok: false, error: "No printer matched this job" };
    const copies = Math.min(10, Math.max(1, Math.floor(Number(job.copies) || 1)));
    for (let i = 0; i < copies; i++) {
      await printToPrinter(printer, job.lines);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function testPrintLines(printer: PrinterConfig, extra: string): PrintLine[] {
  return [
    { text: "Servio POS", align: "center", bold: true, size: 2 },
    { text: "Test print", align: "center" },
    { divider: true },
    { text: `Printer: ${printer.name}` },
    { text: `Kind: ${printer.kind}   Width: ${printer.width} mm` },
    { text: `Role: ${printer.role ?? "none"}` },
    { text: extra },
    { divider: true },
    { text: "Left" },
    { text: "Centre", align: "center" },
    { text: "Right", align: "right" },
    { text: "Bold", bold: true },
    { text: "Large", size: 2 },
    { qr: "https://servio.pk" },
    { text: "Non-ASCII prints as ? for now: ?????", align: "center" },
    { feed: 3 },
    { cut: true },
  ];
}

export async function testPrint(printerId: string): Promise<PrintResult> {
  const printer = loadSettings().printers.find((p) => p.id === printerId);
  if (!printer) return { ok: false, error: "Printer not found" };
  try {
    await printToPrinter(printer, testPrintLines(printer, new Date().toLocaleString()));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
