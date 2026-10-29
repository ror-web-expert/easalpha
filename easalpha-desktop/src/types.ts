// Shared types. The PrintLine / PrintJob / EasAlphaDesktop shapes are the contract
// the web POS calls on window.easalphaDesktop; keep names and shapes stable.

export type PrintLine =
  | { text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 }
  | { qr: string }
  | { feed: number }
  | { divider: true }
  | { cut: true }
  | { drawer: true };

export type PrintRole = "receipt" | "kitchen" | "report";
export type PrinterRole = "receipt" | "kitchen";
export type PrinterKind = "network" | "usb" | "system";
export type PaperWidth = 58 | 80;

export type PrintJob = {
  role: PrintRole;
  printerId?: string;
  lines: PrintLine[];
  copies?: number;
};

export type PrintResult = { ok: boolean; error?: string };

/** A printer as stored in settings.json. */
export type PrinterConfig = {
  id: string;
  name: string;
  kind: PrinterKind;
  width: PaperWidth;
  role?: PrinterRole;
  /** network */
  host?: string;
  port?: number;
  /** usb */
  vendorId?: number;
  productId?: number;
  /** system (OS printer queue name) */
  systemName?: string;
};

/** The shape returned to the web POS and the print server. */
export type PrinterInfo = {
  id: string;
  name: string;
  kind: PrinterKind;
  width: PaperWidth;
  role?: PrinterRole;
};

export type Settings = {
  webUrl: string;
  printServerPort: number;
  /** Tablets send this with every print job (Authorization: Bearer); without it anyone on the shop's network could print or open the drawer. */
  printServerToken?: string;
  printers: PrinterConfig[];
  /** Release feed for self-update (a folder holding latest.yml and the installers). Empty = the feed built into the app. */
  updateUrl?: string;
  /** Touch terminals: open full screen at launch. */
  fullScreen?: boolean;
  /** Touch terminals: kiosk mode (full screen, no window controls); Ctrl+Shift+K leaves it. */
  kiosk?: boolean;
};

export type PrintServerStatus = { host: string; port: number; running: boolean; token?: string };

export const DEFAULT_SETTINGS: Settings = {
  webUrl: "https://easalpha.com",
  printServerPort: 9977,
  printers: [],
};
