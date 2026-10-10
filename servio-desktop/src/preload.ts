// Exposed to the web POS as window.servioDesktop (contextIsolation on).
import { contextBridge, ipcRenderer } from "electron";
import type { PrintJob, PrintResult, PrinterInfo, PrintServerStatus } from "./types";

const api = {
  version: process.env.SERVIO_DESKTOP_VERSION ?? "0.0.0",
  listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke("servio:listPrinters"),
  print: (job: PrintJob): Promise<PrintResult> => ipcRenderer.invoke("servio:print", job),
  openPrinterSettings: (): void => {
    void ipcRenderer.invoke("servio:openPrinterSettings");
  },
  printServer: (): Promise<PrintServerStatus> => ipcRenderer.invoke("servio:printServer"),
};

contextBridge.exposeInMainWorld("servioDesktop", api);
