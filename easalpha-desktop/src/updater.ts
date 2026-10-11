// Self-update from the release feed. electron-builder writes the feed address into the installed app
// (app-update.yml, from "publish" in package.json or the CI override); settings.json "updateUrl" overrides it for
// self-hosted customers. Updates download in the background and install when the app quits, so a shift is never
// interrupted; the cashier can also restart at once from the prompt. Linux .deb and unsigned macOS builds cannot
// self-update (electron-updater supports AppImage, NSIS and signed macOS), so errors are kept quiet and shown in About.
import { app, dialog } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";

export type UpdateState = "idle" | "checking" | "available" | "downloaded" | "up-to-date" | "unsupported" | "error";
export type UpdateStatus = { state: UpdateState; version?: string; error?: string; checkedAt?: string };

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
let status: UpdateStatus = { state: "idle" };
let prompted = false;
let timer: NodeJS.Timeout | null = null;

export function updaterStatus(): UpdateStatus {
  return status;
}

export function describeUpdateStatus(s: UpdateStatus = status): string {
  switch (s.state) {
    case "checking": return "Checking for updates...";
    case "available": return `Downloading version ${s.version ?? ""}...`;
    case "downloaded": return `Version ${s.version ?? ""} is downloaded and installs when the app restarts.`;
    case "up-to-date": return `Up to date (checked ${s.checkedAt ?? ""}).`;
    case "unsupported": return "Updates are not automatic for this build; install the new version by hand.";
    case "error": return `Update check failed: ${s.error ?? "unknown error"}`;
    default: return "Not checked yet.";
  }
}

function promptRestart(info: UpdateInfo): void {
  if (prompted) return;
  prompted = true;
  void dialog
    .showMessageBox({
      type: "info",
      title: "EasAlpha POS update",
      message: `EasAlpha POS ${info.version} is ready`,
      detail: "It installs the next time the app is closed. Restart now, or keep working and it updates after the shift.",
      buttons: ["Restart now", "Later"],
      defaultId: 1,
      cancelId: 1,
    })
    .then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
}

export function startUpdater(opts: { updateUrl?: string }): void {
  if (!app.isPackaged) {
    status = { state: "unsupported", error: "development run" };
    return;
  }
  if (process.platform === "linux" && !process.env.APPIMAGE) {
    status = { state: "unsupported", error: "deb package" };
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  if (opts.updateUrl) autoUpdater.setFeedURL({ provider: "generic", url: opts.updateUrl });
  autoUpdater.on("checking-for-update", () => { status = { state: "checking" }; });
  autoUpdater.on("update-available", (info) => { status = { state: "available", version: info.version }; });
  autoUpdater.on("update-not-available", () => { status = { state: "up-to-date", checkedAt: new Date().toLocaleString() }; });
  autoUpdater.on("update-downloaded", (info) => { status = { state: "downloaded", version: info.version }; promptRestart(info); });
  autoUpdater.on("error", (e) => { status = { state: "error", error: String(e?.message ?? e).slice(0, 200) }; });
  setTimeout(() => void checkForUpdates(), 20_000);
  timer = setInterval(() => void checkForUpdates(), CHECK_EVERY_MS);
}

export function stopUpdater(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (status.state === "unsupported") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    status = { state: "error", error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
  return status;
}

/** Menu action: check now and tell the user what happened. */
export async function checkForUpdatesInteractive(): Promise<void> {
  if (status.state === "downloaded") {
    promptRestartAgain();
    return;
  }
  const s = await checkForUpdates();
  if (s.state === "downloaded") return; // the download prompt is already on screen
  void dialog.showMessageBox({ type: s.state === "error" ? "warning" : "info", title: "EasAlpha POS update", message: describeUpdateStatus(s), buttons: ["OK"] });
}

function promptRestartAgain(): void {
  prompted = false;
  promptRestart({ version: status.version ?? "" } as UpdateInfo);
}
