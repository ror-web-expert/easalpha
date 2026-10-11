// Exposed to the web POS as window.easalphaDesktop (contextIsolation on).
import { contextBridge, ipcRenderer } from "electron";
import type { PrintJob, PrintResult, PrinterInfo, PrintServerStatus } from "./types";

const api = {
  version: process.env.EASALPHA_DESKTOP_VERSION ?? "0.0.0",
  listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke("easalpha:listPrinters"),
  print: (job: PrintJob): Promise<PrintResult> => ipcRenderer.invoke("easalpha:print", job),
  openPrinterSettings: (): void => {
    void ipcRenderer.invoke("easalpha:openPrinterSettings");
  },
  printServer: (): Promise<PrintServerStatus> => ipcRenderer.invoke("easalpha:printServer"),
};

contextBridge.exposeInMainWorld("easalphaDesktop", api);
