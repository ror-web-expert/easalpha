// Bridge for the printer settings window (ui/settings.html).
import { contextBridge, ipcRenderer } from "electron";
import type { PrinterConfig, PrintResult, PrintServerStatus, Settings } from "./types";

contextBridge.exposeInMainWorld("easalphaSettings", {
  load: (): Promise<Settings & { version: string; usbAvailable: boolean }> => ipcRenderer.invoke("settings:load"),
  save: (next: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke("settings:save", next),
  savePrinter: (printer: Partial<PrinterConfig>): Promise<Settings> => ipcRenderer.invoke("settings:savePrinter", printer),
  removePrinter: (id: string): Promise<Settings> => ipcRenderer.invoke("settings:removePrinter", id),
  testPrint: (id: string): Promise<PrintResult> => ipcRenderer.invoke("settings:testPrint", id),
  printServer: (): Promise<PrintServerStatus & { error?: string }> => ipcRenderer.invoke("easalpha:printServer"),
  systemPrinters: (): Promise<{ name: string; displayName: string }[]> => ipcRenderer.invoke("settings:systemPrinters"),
  newId: (): Promise<string> => ipcRenderer.invoke("settings:newId"),
});
