// settings.json in app.getPath("userData"). Read on every access so edits made
// from the settings window and from the main process never go stale.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type PrinterConfig, type Settings } from "./types";

let settingsPath = "";

export function initSettings(userDataDir: string): void {
  settingsPath = path.join(userDataDir, "settings.json");
  // Write the defaults on first run so the owner can find and edit the file.
  try {
    if (!fs.existsSync(settingsPath)) {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n", "utf8");
    }
  } catch {
    // Read-only location: the app still runs with defaults in memory.
  }
  // Every install gets a print server token once; installs from before 0.4.0 get theirs on the first start after updating.
  if (!loadSettings().printServerToken) saveSettings({ printServerToken: newToken() });
}

/** Eight characters a manager can read off the screen and type into Admin, Settings, Print Server. No 0/O or 1/I. */
export function newToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

export function getSettingsPath(): string {
  return settingsPath;
}

function sanitizePrinter(p: Partial<PrinterConfig>): PrinterConfig | null {
  if (!p || typeof p !== "object") return null;
  const kind = p.kind === "network" || p.kind === "usb" || p.kind === "system" ? p.kind : "network";
  const width: 58 | 80 = Number(p.width) === 58 ? 58 : 80;
  const role = p.role === "receipt" || p.role === "kitchen" ? p.role : undefined;
  const id = typeof p.id === "string" && p.id ? p.id : newId();
  const out: PrinterConfig = {
    id,
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Printer",
    kind,
    width,
    role,
  };
  if (kind === "network") {
    out.host = typeof p.host === "string" ? p.host.trim() : "";
    const port = Number(p.port);
    out.port = Number.isInteger(port) && port > 0 && port < 65536 ? port : 9100;
  } else if (kind === "usb") {
    if (p.vendorId !== undefined && p.vendorId !== null && String(p.vendorId) !== "") out.vendorId = Number(p.vendorId);
    if (p.productId !== undefined && p.productId !== null && String(p.productId) !== "") out.productId = Number(p.productId);
  } else if (kind === "system") {
    out.systemName = typeof p.systemName === "string" ? p.systemName.trim() : "";
  }
  return out;
}

export function loadSettings(): Settings {
  let raw: Partial<Settings> = {};
  try {
    if (settingsPath && fs.existsSync(settingsPath)) {
      raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch {
    raw = {};
  }
  const port = Number(raw.printServerPort);
  const updateUrl = typeof raw.updateUrl === "string" && /^https?:\/\//.test(raw.updateUrl.trim()) ? raw.updateUrl.trim().replace(/\/+$/, "") : "";
  return {
    // "http://localhost:3000" was the default written by builds before 0.3.0; treat it as unset so those installs move
    // to the hosted service. A developer server is still reachable as http://127.0.0.1:3000.
    webUrl:
      typeof raw.webUrl === "string" && raw.webUrl.trim() && raw.webUrl.trim().replace(/\/+$/, "") !== "http://localhost:3000"
        ? raw.webUrl.trim().replace(/\/+$/, "")
        : DEFAULT_SETTINGS.webUrl,
    printServerPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_SETTINGS.printServerPort,
    ...(typeof raw.printServerToken === "string" && raw.printServerToken.trim() ? { printServerToken: raw.printServerToken.trim() } : {}),
    printers: Array.isArray(raw.printers)
      ? (raw.printers.map(sanitizePrinter).filter(Boolean) as PrinterConfig[])
      : [],
    ...(updateUrl ? { updateUrl } : {}),
    ...(raw.fullScreen === true ? { fullScreen: true } : {}),
    ...(raw.kiosk === true ? { kiosk: true } : {}),
  };
}

export function saveSettings(next: Partial<Settings>): Settings {
  const merged: Settings = { ...loadSettings(), ...next };
  merged.printers = merged.printers.map(sanitizePrinter).filter(Boolean) as PrinterConfig[];
  if (settingsPath) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  }
  return merged;
}

export function newId(): string {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
