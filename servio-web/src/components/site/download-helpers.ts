// The Download page: which installer fits this machine, and the links electron-builder's file names produce.
// Pure, so the OS detection and the link building are unit-tested.

export type Os = "windows" | "linux" | "mac" | "android" | "ios" | "other";

export interface Installer { os: Os; id: string; title: string; file: string; note: string; arch?: string }

/** From the browser's user agent (and userAgentData platform when present). */
export function detectOs(userAgent: string, platform?: string | null): Os {
  const ua = `${platform ?? ""} ${userAgent}`.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/windows|win32|win64/.test(ua)) return "windows";
  if (/macintosh|mac os|macos|darwin/.test(ua)) return "mac";
  if (/linux|x11|cros/.test(ua)) return "linux";
  return "other";
}

/** Apple Silicon cannot be told from the user agent; the page offers both Mac builds and marks the Intel one first. */
export function installers(version: string): Installer[] {
  const v = version.trim() || "0.0.0";
  return [
    { os: "windows", id: "win", title: "Windows 10 or 11 (64-bit)", file: `EasAlpha POS Setup ${v}.exe`, note: "Installer. Choose the folder, then open EasAlpha POS from the Start menu." },
    { os: "linux", id: "appimage", title: "Linux (AppImage, any distribution)", file: `EasAlpha POS-${v}.AppImage`, note: "Make it executable and run it. Updates itself." },
    { os: "linux", id: "deb", title: "Ubuntu and Debian (.deb)", file: `servio-desktop_${v}_amd64.deb`, note: "Install with the software centre or sudo apt install ./file.deb." },
    { os: "mac", id: "mac-intel", title: "macOS, Intel", file: `EasAlpha POS-${v}.dmg`, note: "Open the disk image and drag EasAlpha POS to Applications.", arch: "x64" },
    { os: "mac", id: "mac-arm", title: "macOS, Apple Silicon (M1 and later)", file: `EasAlpha POS-${v}-arm64.dmg`, note: "Open the disk image and drag EasAlpha POS to Applications.", arch: "arm64" },
  ];
}

export function installerUrl(baseUrl: string, file: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(file)}`;
}

/** The installers for an OS, with the rest after them. Phones and tablets get none: they install the web app. */
export function ordered(os: Os, list: Installer[]): { mine: Installer[]; others: Installer[] } {
  return { mine: list.filter((i) => i.os === os), others: list.filter((i) => i.os !== os) };
}

export const OS_LABEL: Record<Os, string> = { windows: "Windows", linux: "Linux", mac: "macOS", android: "Android", ios: "iPhone or iPad", other: "your computer" };

/** The installer folder: the owner's explicit URL, else this site's own /downloads next to the page (localhost in
 *  development, the live domain once deployed). `origin` is the request's scheme and host. */
export function downloadsBase(setting: string | null | undefined, origin: string): string {
  const explicit = (setting ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${origin.replace(/\/+$/, "")}/downloads`;
}

/** Scheme and host from request headers, honouring a reverse proxy's forwarded values. */
export function originFromHeaders(get: (name: string) => string | null, fallback: string): string {
  const host = get("x-forwarded-host") || get("host");
  if (!host) return fallback.replace(/\/+$/, "");
  const proto = get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** With a manifest from the downloads folder: its version wins and only files that are really there are offered. */
export function applyManifest(list: Installer[], manifest: { version: string; files: { file: string }[] } | null): { version: string | null; list: Installer[] } {
  if (!manifest) return { version: null, list };
  const have = new Set(manifest.files.map((f) => f.file));
  const fresh = installers(manifest.version);
  return { version: manifest.version, list: fresh.filter((i) => have.has(i.file)) };
}
