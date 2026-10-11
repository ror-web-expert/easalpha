# EasAlpha POS desktop

The desktop shell for the EasAlpha till. It wraps the web POS (the Next.js app, `/pos`) in an Electron window and adds the two things a browser cannot do:

- direct ESC/POS printing to receipt and kitchen printers over the network, USB or the operating system's printer driver, exposed to the web POS as `window.easalphaDesktop`;
- the print server from the SPEC ("Kitchen display, printing and devices"): a small HTTP service on this computer that order-taker tablets print through. The admin panel stores this computer's IP as the Print Server and tablets connect to it automatically.

Everything else (orders, offline queue, sync, permissions) lives in the web app. If the web app cannot be reached on first load the shell shows a plain "Cannot reach the server" page with a Retry button; after the first successful load the web app's own offline queue takes over.

## Run in development

Requirements: Node 20, pnpm, and the web app running on http://localhost:3000.

```sh
cd easalpha-desktop
pnpm install
pnpm start          # compiles TypeScript to dist/ and launches Electron
pnpm test           # encoder and settings unit tests (node:test)
```

The window loads `${webUrl}/setup`: a machine that is already set up is forwarded to its own screen (till, kitchen display, token screen...); a new machine asks the owner or manager to sign in once and choose what it is (see `docs/SETUP.md` section 3). "Set up this device again" in the EasAlpha menu re-runs that choice. `webUrl` defaults to http://localhost:3000 and is read from `settings.json` in the Electron user-data folder (Linux `~/.config/easalpha-desktop/settings.json`, Windows `%APPDATA%\easalpha-desktop\settings.json`). It can be changed from EasAlpha > Printers in the app menu.

If `pnpm start` prints `bad option: --...` the shell has `ELECTRON_RUN_AS_NODE=1` set (some editor terminals do this); run `env -u ELECTRON_RUN_AS_NODE pnpm start`.

## Build installers

```sh
pnpm dist:win       # Windows NSIS installer, x64 -> release/
pnpm dist:linux     # Linux AppImage and .deb -> release/
pnpm dist:mac       # macOS .dmg and .zip, Intel and Apple Silicon -> release/ (run on a Mac)
pnpm dist:dir       # unpacked folder only, for a quick check
```

Building the Windows installer on Linux needs Wine for the NSIS step; electron-builder prints what is missing. The `desktop` GitHub Actions workflow (`.github/workflows/desktop.yml`) builds all three on every change to this folder and attaches them to a GitHub Release on a `v*` tag; see `docs/SETUP.md` section 3 and 4. The app icon is `build/icon.png` (copied from `easalpha-web/public/icon-512.png`). App id `com.easalpha.pos`, product name "EasAlpha POS".

## Self-update

`src/updater.ts` (electron-updater) checks the release feed 20 s after start and every 4 hours, downloads in the background and installs on quit, with a "Restart now / Later" prompt so a shift is never cut. The feed is `publish.url` in `package.json` as baked in at build time (the GitHub workflow sets it to the repository's latest release) or `updateUrl` in `settings.json`. Supported: Windows NSIS and Linux AppImage; the .deb and unsigned macOS builds report "not automatic" under About. "Check for updates" is in the EasAlpha menu.

## Project layout

```
src/main.ts              Electron main process: window, menu, IPC, startup
src/updater.ts           self-update from the release feed (electron-updater)
src/preload.ts           exposes window.easalphaDesktop to the web POS
src/settingsPreload.ts   bridge for the printer settings window
src/settings.ts          settings.json read/write and sanitising
src/escpos.ts            pure ESC/POS encoder (PrintLine[] -> Buffer), plain-text renderer
src/printers.ts          printer selection, print dispatch, test print
src/printServer.ts       HTTP print server for tablets
src/transports/          network (TCP 9100), system (OS driver), usb (optional)
src/lanIp.ts             finds this machine's LAN IPv4
ui/settings.html         printer settings window (plain HTML, no framework)
ui/offline.html          "Cannot reach the server" page
```

## The contract the web POS uses

`window.easalphaDesktop` is exposed by a preload script with context isolation on.

```ts
type PrintLine =
  | { text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 }
  | { qr: string } | { feed: number } | { divider: true } | { cut: true } | { drawer: true };
type PrintJob = { role: "receipt" | "kitchen" | "report"; printerId?: string; lines: PrintLine[]; copies?: number };

interface EasAlphaDesktop {
  version: string;
  listPrinters(): Promise<{ id: string; name: string; kind: "network" | "usb" | "system"; width: 58 | 80; role?: "receipt" | "kitchen" }[]>;
  print(job: PrintJob): Promise<{ ok: boolean; error?: string }>;
  openPrinterSettings(): void;
  printServer(): Promise<{ host: string; port: number; running: boolean }>;
}
```

`print` picks the printer by `printerId`, otherwise the printer whose role matches the job role (reports fall back to the receipt printer), otherwise the first configured printer. `copies` prints the job that many times (capped at 10). The web app detects the desktop with `if (window.easalphaDesktop)` and otherwise uses the browser print dialog.

## Printers

Open EasAlpha > Printers (Ctrl+Shift+P) or call `openPrinterSettings()`. Each printer has a name, kind, paper width (58 mm = 32 characters, 80 mm = 48 characters) and an optional role (receipt or kitchen).

| Kind | What to fill in | How it prints |
| --- | --- | --- |
| Network | IP address and port (default 9100) | Raw ESC/POS over TCP, 5 second timeout. Works with any Ethernet or Wi-Fi thermal printer. |
| System | An OS printer from the list | The lines are rendered as monospace HTML and sent through the operating system driver with Electron's `webContents.print`. Use this when the printer only has a Windows or CUPS driver, or for USB printers until the native USB module is bundled. |
| USB | Vendor ID and product ID (hex) | Raw ESC/POS write through the optional `usb` native module. If the module is not installed the job fails with "USB support not installed". |

"Test print" sends a page with alignment, bold, double size, a QR code and a cut so you can check the width setting.

Printers are stored in `settings.json`:

```json
{
  "webUrl": "http://localhost:3000",
  "printServerPort": 9977,
  "updateUrl": "",
  "printers": [
    { "id": "p_1", "name": "Counter", "kind": "network", "host": "192.168.1.50", "port": 9100, "width": 80, "role": "receipt" },
    { "id": "p_2", "name": "Kitchen", "kind": "network", "host": "192.168.1.51", "port": 9100, "width": 80, "role": "kitchen" },
    { "id": "p_3", "name": "Office", "kind": "system", "systemName": "HP_LaserJet", "width": 80 }
  ]
}
```

### ESC/POS encoder

`src/escpos.ts` is a small, dependency-free encoder: `ESC @` init, codepage CP437 (`ESC t 0`), `ESC a` alignment, `ESC E` bold, `GS !` double size, `ESC d` feed, `GS V 1` partial cut, `ESC p 0` drawer kick and the `GS ( k` QR sequence (model 2, module size 6, error correction M). Dividers are dashes across the full line width and long text wraps at the paper width. Only ASCII is encoded; any other character prints as `?` for now (see "Not done yet").

## Print server for tablets

The server starts with the app on `0.0.0.0`, port 9977 by default (change it in Printers; the server restarts). CORS is open (`*`) so the tablet web app can call it directly.

| Route | Body | Response |
| --- | --- | --- |
| `GET /health` | | `{ "ok": true, "version": "0.1.0" }` |
| `GET /printers` | | the same list as `listPrinters()` |
| `POST /print` | a `PrintJob` as JSON | `{ "ok": true }` or `{ "ok": false, "error": "..." }` (HTTP 422 on a failed print) |

The Printers window shows "Tablets print through http://LAN-IP:PORT/print". Enter that IP and port as the Print Server in the admin panel's device settings; the tablets pick it up on their next sync. Give the till computer a fixed IP on the router so the address does not change. Allow the port through the Windows firewall on first run if prompted.

Example from a tablet or a shell:

```sh
curl -X POST http://192.168.1.10:9977/print -H 'Content-Type: application/json' \
  -d '{"role":"kitchen","lines":[{"text":"Table 4","bold":true,"size":2},{"divider":true},{"text":"2 x Chicken Karahi"},{"feed":3},{"cut":true}]}'
```

## Not done yet

- **USB native module.** The `usb` package is loaded lazily and is not a dependency, so the build never depends on a native compile. Until it is bundled, USB printers should be installed as an OS printer and used with kind "System". Adding it: `pnpm add usb` and rebuild for Electron with `electron-builder install-app-deps`.
- **Urdu on receipts.** Non-ASCII text prints as `?`. The plan is to render Urdu lines as a raster image (`GS v 0`) with a bundled Nastaliq font in a later phase; the `text` line shape does not need to change.
- **Logo image** at the top of the receipt (also a raster job, same phase as Urdu).
- **Code signing.** Updates and first-open warnings: the Windows and macOS builds are unsigned until certificates are bought (`CSC_LINK`, `CSC_KEY_PASSWORD` in CI); unsigned macOS builds cannot self-update.
- **Authentication on the print server.** It is open on the LAN by design (tablets do not configure anything); a shared token header can be added when the admin panel stores one.
