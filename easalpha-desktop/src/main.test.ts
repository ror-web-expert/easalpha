import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// main.ts runs inside Electron. These tests load it in plain Node with small stand-ins for the Electron API, the print
// server and the updater, then drive the window and the menu the way a cashier would.

type Item = { id?: string; label?: string; type?: string; checked?: boolean; click?: (item: Item) => void; submenu?: Item[] };
type FakeMenu = { items: Item[]; getMenuItemById(id: string): Item | null };

class FakeWindow {
  static last: FakeWindow | null = null;
  fullScreen: boolean;
  fullScreenable: boolean;
  kiosk: boolean;
  handlers: Record<string, Array<() => void>> = {};
  webContents = { on() {}, setWindowOpenHandler() {}, getURL: () => "", setVisualZoomLevelLimits: async () => {} };

  constructor(public options: Record<string, unknown>) {
    // As on macOS: an explicit "fullscreen: false" makes the window unable to go full screen.
    this.fullScreenable = options.fullscreen !== false;
    this.kiosk = options.kiosk === true;
    // Electron enters full screen while it builds the window, before main.ts can listen for the event.
    this.fullScreen = options.fullscreen === true || this.kiosk;
    FakeWindow.last = this;
  }

  on(event: string, fn: () => void): this {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }

  isFullScreen(): boolean {
    return this.fullScreen;
  }

  setFullScreen(on: boolean): void {
    if (on === this.fullScreen || !this.fullScreenable) return;
    this.fullScreen = on;
    for (const fn of this.handlers[on ? "enter-full-screen" : "leave-full-screen"] ?? []) fn();
  }

  setKiosk(on: boolean): void {
    this.kiosk = on;
    this.setFullScreen(on);
  }

  maximize(): void {}

  loadURL(): Promise<void> {
    return Promise.resolve();
  }
}

let appMenu: FakeMenu | null = null;

function find(items: Item[], match: (i: Item) => boolean): Item | null {
  for (const i of items) {
    if (match(i)) return i;
    const inner = i.submenu ? find(i.submenu, match) : null;
    if (inner) return inner;
  }
  return null;
}

function menuItem(label: string): Item {
  const item = appMenu && find(appMenu.items, (i) => i.label === label);
  assert.ok(item, `menu item ${label}`);
  return item;
}

// Electron flips a checkbox's tick before it calls the click handler.
function click(label: string): void {
  const item = menuItem(label);
  if (item.type === "checkbox") item.checked = !item.checked;
  item.click?.(item);
}

function stub(request: string, exports: unknown): void {
  const file = require.resolve(request);
  require.cache[file] = { id: file, filename: file, loaded: true, exports } as unknown as NodeModule;
}

async function launch(saved: Record<string, unknown>): Promise<{ win: FakeWindow; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-main-"));
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(saved));
  appMenu = null;
  FakeWindow.last = null;
  stub("electron", {
    app: {
      commandLine: { appendSwitch() {} },
      requestSingleInstanceLock: () => true,
      on() {},
      quit() {},
      getVersion: () => "0.0.0",
      getPath: () => dir,
      whenReady: () => Promise.resolve(),
    },
    BrowserWindow: Object.assign(FakeWindow, { getAllWindows: () => [] }),
    Menu: {
      buildFromTemplate: (items: Item[]): FakeMenu => ({ items, getMenuItemById: (id) => find(items, (i) => i.id === id) }),
      setApplicationMenu: (m: FakeMenu) => {
        appMenu = m;
      },
      getApplicationMenu: () => appMenu,
    },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1366, height: 800 } }) },
    ipcMain: { handle() {} },
    dialog: {},
    shell: {},
  });
  stub("./printServer", { startPrintServer: async () => {}, restartPrintServer: async () => {}, printServerStatus: () => ({ running: false }) });
  stub("./updater", { startUpdater() {}, stopUpdater() {}, checkForUpdatesInteractive: async () => {}, describeUpdateStatus: () => "" });
  delete require.cache[require.resolve("./main")];
  require("./main");
  await new Promise((resolve) => setImmediate(resolve)); // app.whenReady() has run
  assert.ok(FakeWindow.last, "main window opened");
  return { win: FakeWindow.last, dir };
}

test("window options carry full screen and kiosk only when they are on", async () => {
  const plain = await launch({});
  assert.equal("fullscreen" in plain.win.options, false);
  assert.equal("kiosk" in plain.win.options, false);

  const full = await launch({ fullScreen: true });
  assert.equal(full.win.options.fullscreen, true);
  assert.equal("kiosk" in full.win.options, false);

  const kiosk = await launch({ fullScreen: true, kiosk: true });
  assert.equal(kiosk.win.options.kiosk, true);
  assert.equal("fullscreen" in kiosk.win.options, false);
  for (const d of [plain.dir, full.dir, kiosk.dir]) fs.rmSync(d, { recursive: true, force: true });
});

test("F11 goes full screen from default settings and back", async () => {
  const { win, dir } = await launch({});
  assert.equal(menuItem("Full screen").checked, false);
  click("Full screen");
  assert.equal(win.isFullScreen(), true);
  assert.equal(menuItem("Full screen").checked, true);
  click("Full screen");
  assert.equal(win.isFullScreen(), false);
  assert.equal(menuItem("Full screen").checked, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a window that opened full screen shows the tick and leaves on the first F11", async () => {
  const { win, dir } = await launch({ fullScreen: true });
  assert.equal(win.isFullScreen(), true);
  assert.equal(menuItem("Full screen").checked, true);
  click("Full screen");
  assert.equal(win.isFullScreen(), false);
  assert.equal(menuItem("Full screen").checked, false);
  // Full screen changed outside the menu (the macOS green button, Esc) still moves the tick.
  win.setFullScreen(true);
  assert.equal(menuItem("Full screen").checked, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("kiosk mode on and off keeps the Full screen tick in sync", async () => {
  const { win, dir } = await launch({});
  click("Kiosk mode (touch terminal)");
  assert.equal(win.kiosk, true);
  assert.equal(win.isFullScreen(), true);
  assert.equal(menuItem("Full screen").checked, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8")).kiosk, true);
  click("Kiosk mode (touch terminal)");
  assert.equal(win.isFullScreen(), false);
  assert.equal(menuItem("Full screen").checked, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a kiosk window opens with the Full screen tick on", async () => {
  const { win, dir } = await launch({ kiosk: true });
  assert.equal(win.isFullScreen(), true);
  assert.equal(menuItem("Full screen").checked, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
