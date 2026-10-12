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

/** One card per kind of computer on the Download page: what it needs, how to install, what can go wrong. */
export interface PlatformGuide { os: Os; key: string; title: string; subtitle: string; installerIds: string[]; requirements: string[]; install: string[]; issues: { title: string; fix: string }[] }

export const PLATFORM_GUIDES: PlatformGuide[] = [
  {
    os: "windows", key: "windows", title: "Windows", subtitle: "Windows 10 or 11, 64-bit", installerIds: ["win"],
    requirements: ["Windows 10 (version 1809 or later) or Windows 11, 64-bit", "4 GB RAM, 500 MB free disk", "A receipt printer: USB (ESC/POS), network (IP) or the Windows printer queue", "Internet for sign-in and sync; the till keeps selling offline"],
    install: ["Download the installer and open it.", "Windows SmartScreen may say \"Windows protected your PC\": click More info, then Run anyway. The installer is not code-signed yet.", "Choose the folder (or keep the default) and finish. EasAlpha POS appears in the Start menu and on the desktop.", "Open it: the setup screen asks a manager to sign in once and choose what this computer is."],
    issues: [
      { title: "SmartScreen blocks the installer", fix: "More info, then Run anyway. If your IT policy hides that button, right-click the file, Properties, tick Unblock, then run it again." },
      { title: "Receipt printer does not print", fix: "Open EasAlpha menu, Printers (Ctrl+Shift+P). USB printers show by name; for a network printer enter its IP and port 9100. Print the test page. If the printer is a Windows queue, install the vendor driver first." },
      { title: "Tablets cannot reach the print server", fix: "Allow EasAlpha POS through Windows Defender Firewall for private networks (port 9977), and keep the tablet on the same Wi-Fi as this PC." },
      { title: "Updates", fix: "The app checks for a new version after start and every 4 hours, downloads it in the background and installs it when you close the app. A prompt offers Restart now." },
    ],
  },
  {
    os: "mac", key: "mac", title: "macOS", subtitle: "Intel and Apple Silicon (M1 to M4)", installerIds: ["mac-intel", "mac-arm"],
    requirements: ["macOS 12 Monterey or later", "Apple Silicon (M1 or later) uses the Apple Silicon build; older Intel Macs use the Intel build. Apple menu, About This Mac shows which chip you have", "4 GB RAM, 600 MB free disk", "USB or network receipt printer (ESC/POS)"],
    install: ["Download the disk image for your chip and open it.", "Drag EasAlpha POS into the Applications folder.", "First open: macOS Gatekeeper says the app \"cannot be opened because the developer cannot be verified\" (the build is not notarised yet). Right-click the app, choose Open, then Open again. Or: System Settings, Privacy & Security, scroll down, Open Anyway.", "Open it: the setup screen asks a manager to sign in once and choose what this Mac is."],
    issues: [
      { title: "\"EasAlpha POS is damaged and can't be opened\"", fix: "Open Terminal and run: xattr -dr com.apple.quarantine \"/Applications/EasAlpha POS.app\" then open the app again. This happens on some Macs when a download is quarantined." },
      { title: "Wrong chip", fix: "The Intel build runs slowly on Apple Silicon through Rosetta; download the Apple Silicon disk image instead. The Apple Silicon build does not open on an Intel Mac." },
      { title: "Printer not listed", fix: "Add the printer in System Settings, Printers & Scanners first, then pick it in EasAlpha menu, Printers. Network printers also work by IP on port 9100 without a driver." },
      { title: "Updates", fix: "Unsigned Mac builds cannot update themselves. The app tells you when a new version is out; download it from this page and drag it over the old one." },
    ],
  },
  {
    os: "linux", key: "linux", title: "Ubuntu, Debian and other Linux", subtitle: "64-bit, AppImage or .deb", installerIds: ["appimage", "deb"],
    requirements: ["Ubuntu 20.04 or later, Debian 11 or later, or any 64-bit distribution from 2020 on (glibc 2.31)", "4 GB RAM, 500 MB free disk", "USB printers need the user in the lp group: sudo usermod -aG lp $USER, then log out and in", "The AppImage needs FUSE on Ubuntu 22.04 and later: sudo apt install libfuse2"],
    install: ["Ubuntu or Debian: download the .deb and run sudo apt install ./easalpha-desktop_VERSION_amd64.deb (or open it in the software centre). EasAlpha POS appears in the application menu.", "Any other distribution: download the AppImage, make it executable (right-click, Properties, Permissions, Allow executing, or chmod +x) and run it.", "Open it: the setup screen asks a manager to sign in once and choose what this computer is."],
    issues: [
      { title: "apt says \"trying to overwrite ... also in package servio-desktop\"", fix: "An old build is installed under its previous name. Run sudo apt remove -y servio-desktop, then install the new .deb. Builds from 0.3.1 on replace it automatically." },
      { title: "AppImage does nothing when opened", fix: "It is not executable yet (chmod +x the file) or FUSE is missing (sudo apt install libfuse2). From a terminal, ./EasAlpha\\ POS-VERSION.AppImage prints the reason." },
      { title: "USB printer not found", fix: "Add yourself to the lp group (see requirements) and reconnect the printer. ls /dev/usb/lp* should list it. Network printers work by IP on port 9100 without any setup." },
      { title: "Updates", fix: "The AppImage updates itself. The .deb does not: download the new .deb from this page and install it over the old one; your settings are kept." },
    ],
  },
];

/** Phones and tablets run the web app; one entry per kind with its own add-to-home-screen steps. */
export interface MobileGuide { os: Os; key: string; title: string; subtitle: string; requirements: string[]; install: string[]; issues: { title: string; fix: string }[] }

export const MOBILE_GUIDES: MobileGuide[] = [
  {
    os: "ios", key: "ios", title: "iPhone and iPad", subtitle: "Order-taker tablet, rider phone, kitchen or queue screen", requirements: ["iOS or iPadOS 15 or later, Safari (Chrome on iOS cannot install web apps)", "Same Wi-Fi as the counter PC to print through its print server"],
    install: ["Open easalpha.com/setup in Safari.", "A manager signs in once and chooses what this device is: order-taker tablet, kitchen display, token or queue screen, or rider phone.", "Tap the Share button, then Add to Home Screen. The icon opens straight to that screen, full-screen, from now on."],
    issues: [
      { title: "No Add to Home Screen option", fix: "You are in Chrome or inside another app's browser. Open the address in Safari itself." },
      { title: "Notifications do not arrive", fix: "Web push on iOS works only from the home-screen icon on iOS 16.4 or later, and only after you allow notifications when the app asks." },
      { title: "Tablet cannot print", fix: "Printing goes through the counter PC's print server (port 9977). Keep both on the same Wi-Fi and check the address in EasAlpha menu, Printers on the PC." },
    ],
  },
  {
    os: "android", key: "android", title: "Android phone or tablet", subtitle: "Order-taker tablet, rider phone, kitchen or queue screen", requirements: ["Android 9 or later with Chrome", "Same Wi-Fi as the counter PC to print through its print server"],
    install: ["Open easalpha.com/setup in Chrome.", "A manager signs in once and chooses what this device is.", "Chrome offers Install app (or menu, Add to Home screen). The icon opens straight to that screen from now on."],
    issues: [
      { title: "Install app is missing", fix: "Reload the page once while online; Chrome shows the option after the first visit. Samsung Internet and Firefox use Add page to, Home screen." },
      { title: "Screen goes to sleep on a kitchen or queen screen", fix: "Settings, Display, set the screen timeout to Never, or keep the tablet on a charger with Stay awake on in developer options." },
      { title: "Rider app loses location", fix: "Allow Location \"all the time\" for Chrome and turn battery optimisation off for it, or deliveries stop updating when the screen is off." },
    ],
  },
];

/** The same three steps for every computer, once the app opens. */
export const AFTER_INSTALL: string[] = [
  "Open EasAlpha POS. It shows the setup screen; a manager signs in once and chooses what this machine is: till, kitchen display, token screen or queue screen. The login is used only for setup and is not kept on the machine.",
  "Printers: EasAlpha menu, Printers (Ctrl+Shift+P, Cmd+Shift+P on a Mac). Pick the receipt and kitchen printers and print a test page. The same window shows this computer's address, which order-taker tablets print through.",
  "Running your own server? Set its address in the same Printers window; the app opens it on every start. Otherwise leave it: the app opens easalpha.com.",
  "Wrong choice later? EasAlpha menu, Set up this device again.",
];
