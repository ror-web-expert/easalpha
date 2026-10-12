// The Download page: which installer fits this machine, and the links electron-builder's file names produce.
// Pure, so the OS detection and the link building are unit-tested.

export type Os = "windows" | "linux" | "mac" | "android" | "ios" | "other";

export interface Installer { os: Os; id: string; title: string; file: string; note: string; arch?: string; /** false when the manifest says this file is not uploaded yet */ available?: boolean }

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
    { os: "linux", id: "deb", title: "Ubuntu and Debian (.deb)", file: `easalpha-desktop_${v}_amd64.deb`, note: "Install with the software centre or sudo apt install ./file.deb." },
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

/** With a manifest from the downloads folder: its version wins, and every installer is kept but marked available only
 *  when its file is really there, so the page can still show the guide for a build that comes with the next release. */
export function applyManifest(list: Installer[], manifest: { version: string; files: { file: string }[] } | null): { version: string | null; list: Installer[] } {
  if (!manifest) return { version: null, list: list.map((i) => ({ ...i, available: true })) };
  const have = new Set(manifest.files.map((f) => f.file));
  return { version: manifest.version, list: installers(manifest.version).map((i) => ({ ...i, available: have.has(i.file) })) };
}

/** One card per kind of computer on the Download page: one line of what it needs, three install steps, and the fixes
 *  for what usually goes wrong, folded away until needed. */
export interface PlatformGuide { os: Os; key: string; title: string; needs: string; installerIds: string[]; install: string[]; issues: { title: string; fix: string }[] }

export const PLATFORM_GUIDES: PlatformGuide[] = [
  {
    os: "windows", key: "windows", title: "Windows", needs: "Windows 10 or 11, 64-bit", installerIds: ["win"],
    install: ["Download and open the installer.", "If Windows says \"protected your PC\": More info, then Run anyway.", "Open EasAlpha POS from the Start menu and sign in once as a manager."],
    issues: [
      { title: "SmartScreen hides Run anyway", fix: "Right-click the file, Properties, tick Unblock, run it again." },
      { title: "Printer does not print", fix: "EasAlpha menu, Printers (Ctrl+Shift+P): pick the USB printer, or enter a network printer's IP with port 9100, then print the test page." },
      { title: "Tablets cannot print through this PC", fix: "Allow EasAlpha POS in Windows Firewall for private networks (port 9977) and keep the tablet on the same Wi-Fi." },
      { title: "Updates", fix: "Downloaded in the background and installed when you close the app." },
    ],
  },
  {
    os: "mac", key: "mac", title: "macOS", needs: "macOS 12 or later; pick Intel or Apple Silicon (Apple menu, About This Mac)", installerIds: ["mac-intel", "mac-arm"],
    install: ["Download the disk image for your chip and open it.", "Drag EasAlpha POS into Applications.", "First open: right-click the app, Open, then Open again (the build is not notarised yet). Sign in once as a manager."],
    issues: [
      { title: "\"Cannot be opened because the developer cannot be verified\"", fix: "System Settings, Privacy & Security, scroll down, Open Anyway." },
      { title: "\"EasAlpha POS is damaged\"", fix: "In Terminal: xattr -dr com.apple.quarantine \"/Applications/EasAlpha POS.app\", then open it again." },
      { title: "Printer not listed", fix: "Add it in System Settings, Printers & Scanners first, or use a network printer by IP on port 9100." },
      { title: "Updates", fix: "The app tells you when a new version is out; download it here and drag it over the old one." },
    ],
  },
  {
    os: "linux", key: "linux", title: "Linux", needs: "Ubuntu 20.04+, Debian 11+ or any 64-bit distribution; .deb for Ubuntu and Debian, AppImage for the rest", installerIds: ["appimage", "deb"],
    install: ["Ubuntu or Debian: open the .deb (or sudo apt install ./easalpha-desktop_VERSION_amd64.deb).", "Other distributions: make the AppImage executable (chmod +x) and run it.", "Open EasAlpha POS and sign in once as a manager."],
    issues: [
      { title: "apt: \"trying to overwrite ... also in package servio-desktop\"", fix: "sudo apt remove -y servio-desktop, then install the new .deb." },
      { title: "AppImage does nothing", fix: "chmod +x the file; on Ubuntu 22.04 and later also sudo apt install libfuse2." },
      { title: "USB printer not found", fix: "sudo usermod -aG lp $USER, log out and in, reconnect the printer." },
      { title: "Updates", fix: "The AppImage updates itself; for the .deb, install the new file over the old one." },
    ],
  },
];

/** Phones and tablets run the web app from the home screen; one short guide per kind. */
export interface MobileGuide { os: Os; key: string; title: string; needs: string; install: string[]; issues: { title: string; fix: string }[] }

export const MOBILE_GUIDES: MobileGuide[] = [
  {
    os: "ios", key: "ios", title: "iPhone and iPad", needs: "iOS or iPadOS 15 or later, in Safari",
    install: ["Open easalpha.com/setup in Safari and sign in once as a manager.", "Choose what this device is: order-taker tablet, rider phone, kitchen, token or queue screen.", "Tap Share, then Add to Home Screen. The icon opens straight to that screen."],
    issues: [
      { title: "No Add to Home Screen", fix: "You are in Chrome or another app's browser; open the address in Safari itself." },
      { title: "Cannot print", fix: "Tablets print through the counter PC's print server; keep both on the same Wi-Fi." },
      { title: "No notifications", fix: "Only from the home-screen icon on iOS 16.4 or later, after allowing them when asked." },
    ],
  },
  {
    os: "android", key: "android", title: "Android", needs: "Android 9 or later, in Chrome",
    install: ["Open easalpha.com/setup in Chrome and sign in once as a manager.", "Choose what this device is.", "Tap Install app (or menu, Add to Home screen). The icon opens straight to that screen."],
    issues: [
      { title: "Install app is missing", fix: "Reload the page once while online; other browsers use Add page to Home screen." },
      { title: "Cannot print", fix: "Tablets print through the counter PC's print server; keep both on the same Wi-Fi." },
      { title: "Rider location stops", fix: "Allow Location \"all the time\" for Chrome and turn off battery optimisation for it." },
    ],
  },
];

/** The same three steps for every computer, once the app opens. */
export const AFTER_INSTALL: string[] = [
  "Sign in once as a manager on the setup screen and choose what this machine is: till, kitchen display, token or queue screen.",
  "EasAlpha menu, Printers: pick the receipt and kitchen printers and print a test page. Tablets print through this computer.",
  "Chose wrong? EasAlpha menu, Set up this device again. Own server? Set its address in the same Printers window.",
];
