import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import path from "node:path";
import { getSettingsPath, initSettings, loadSettings, newId, saveSettings } from "./settings";
import { listPrinters, print, testPrint } from "./printers";
import { printServerStatus, restartPrintServer, startPrintServer } from "./printServer";
import { listSystemPrinters } from "./transports/system";
import { usbAvailable } from "./transports/usb";
import type { PrintJob, PrinterConfig, Settings } from "./types";
import { checkForUpdatesInteractive, describeUpdateStatus, startUpdater, stopUpdater } from "./updater";

const VERSION: string = app.getVersion();
const UI_DIR = path.join(__dirname, "..", "ui");

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

// One running copy per machine: the print server owns a port and the till is one screen.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Every launch opens /setup: a machine that is already set up is forwarded to its own screen (till, kitchen display,
// token screen...), a new machine asks the owner or manager to sign in once and choose what it is.
function appUrl(): string {
  return loadSettings().webUrl + "/setup";
}

function setupAgainUrl(): string {
  return loadSettings().webUrl + "/setup?again=1";
}

function offlinePageUrl(): string {
  const params = new URLSearchParams({ url: appUrl() });
  return "file://" + path.join(UI_DIR, "offline.html") + "?" + params.toString();
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1366,
    minHeight: 800,
    title: "EasAlpha POS",
    backgroundColor: "#ffffff",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  // Show the plain offline page only when the first load fails; after that the
  // web app's own offline queue takes over and we keep whatever is on screen.
  let loadedOnce = false;
  mainWindow.webContents.on("did-finish-load", () => {
    const url = mainWindow?.webContents.getURL() ?? "";
    if (!url.startsWith("file://")) loadedOnce = true;
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, _desc, validatedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */) return;
    if (!loadedOnce || validatedUrl === appUrl()) {
      void mainWindow?.loadURL(offlinePageUrl());
    }
  });

  // Keep the till inside the POS; open anything else in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(loadSettings().webUrl)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(appUrl());
}

function setUpDeviceAgain(): void {
  void dialog
    .showMessageBox({
      type: "question",
      title: "Set up this device again",
      message: "Change what this machine is?",
      detail: "An owner or manager signs in and chooses the role again (till, kitchen display, token screen...). The current pairing is replaced.",
      buttons: ["Continue", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    })
    .then((r) => {
      if (r.response === 0) void mainWindow?.loadURL(setupAgainUrl());
    });
}

function openPrinterSettings(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    title: "Printers - EasAlpha POS",
    parent: mainWindow ?? undefined,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "settingsPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  void settingsWindow.loadFile(path.join(UI_DIR, "settings.html"));
}

function showPrintServerStatus(): void {
  const s = printServerStatus();
  const detail = s.running
    ? `Running.\n\nTablets print through:\nhttp://${s.host}:${s.port}/print\n\nEnter ${s.host}:${s.port} as the Print Server in the admin panel.`
    : `Not running.\n\n${s.error ?? "Unknown error"}\n\nChange the port in Printers and the server restarts.`;
  void dialog.showMessageBox({
    type: s.running ? "info" : "warning",
    title: "Print server",
    message: "Print server status",
    detail,
    buttons: ["OK"],
  });
}

function showAbout(): void {
  void dialog.showMessageBox({
    type: "info",
    title: "About EasAlpha POS",
    message: `EasAlpha POS ${VERSION}`,
    detail: `Desktop shell for the EasAlpha web POS.\n\nWeb app: ${loadSettings().webUrl}\nSettings file: ${getSettingsPath()}\nUpdates: ${describeUpdateStatus()}\nElectron ${process.versions.electron}, Chromium ${process.versions.chrome}`,
    buttons: ["OK"],
  });
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "EasAlpha",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => void mainWindow?.loadURL(appUrl()) },
        {
          label: "Full screen",
          accelerator: "F11",
          type: "checkbox",
          checked: mainWindow?.isFullScreen() ?? false,
          click: (item) => mainWindow?.setFullScreen(item.checked),
        },
        { type: "separator" },
        { label: "Printers", accelerator: "CmdOrCtrl+Shift+P", click: openPrinterSettings },
        { label: "Print server status", click: showPrintServerStatus },
        { type: "separator" },
        { label: "Set up this device again...", click: setUpDeviceAgain },
        { label: "Check for updates...", click: () => void checkForUpdatesInteractive() },
        { label: "About", click: showAbout },
        { type: "separator" },
        { role: "quit", label: "Quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "zoomIn", label: "Zoom in" },
        { role: "zoomOut", label: "Zoom out" },
        { role: "resetZoom", label: "Reset zoom" },
        { type: "separator" },
        { role: "toggleDevTools", label: "Developer tools" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc(): void {
  // Contract used by window.easalphaDesktop
  ipcMain.handle("easalpha:listPrinters", () => listPrinters());
  ipcMain.handle("easalpha:print", (_e, job: PrintJob) => print(job));
  ipcMain.handle("easalpha:openPrinterSettings", () => openPrinterSettings());
  ipcMain.handle("easalpha:printServer", () => printServerStatus());

  // Settings window
  ipcMain.handle("settings:load", () => ({ ...loadSettings(), version: VERSION, usbAvailable: usbAvailable() }));
  ipcMain.handle("settings:save", async (_e, next: Partial<Settings>) => {
    const before = loadSettings();
    const saved = saveSettings(next);
    if (saved.printServerPort !== before.printServerPort) await restartPrintServer(saved.printServerPort, VERSION);
    if (saved.webUrl !== before.webUrl) void mainWindow?.loadURL(appUrl());
    return saved;
  });
  ipcMain.handle("settings:savePrinter", (_e, printer: Partial<PrinterConfig>) => {
    const s = loadSettings();
    const id = printer.id || newId();
    const next = { ...printer, id } as PrinterConfig;
    const idx = s.printers.findIndex((p) => p.id === id);
    if (idx === -1) s.printers.push(next);
    else s.printers[idx] = next;
    return saveSettings({ printers: s.printers });
  });
  ipcMain.handle("settings:removePrinter", (_e, id: string) => {
    const s = loadSettings();
    return saveSettings({ printers: s.printers.filter((p) => p.id !== id) });
  });
  ipcMain.handle("settings:testPrint", (_e, id: string) => testPrint(id));
  ipcMain.handle("settings:systemPrinters", async () => {
    try {
      return await listSystemPrinters();
    } catch {
      return [];
    }
  });
  ipcMain.handle("settings:newId", () => newId());
}

app.whenReady().then(async () => {
  initSettings(app.getPath("userData"));
  process.env.EASALPHA_DESKTOP_VERSION = VERSION;
  registerIpc();
  buildMenu();
  createMainWindow();
  await startPrintServer(loadSettings().printServerPort, VERSION);
  startUpdater({ updateUrl: loadSettings().updateUrl });
});

app.on("window-all-closed", () => {
  stopUpdater();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
