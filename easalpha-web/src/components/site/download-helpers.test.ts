import { describe, expect, it } from "vitest";
import { AFTER_INSTALL, applyManifest, detectOs, downloadsBase, installers, installerUrl, MOBILE_GUIDES, ordered, originFromHeaders, PLATFORM_GUIDES } from "./download-helpers";

describe("download page", () => {
  it("detects the operating system from the user agent", () => {
    expect(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("windows");
    expect(detectOs("Mozilla/5.0 (X11; Linux x86_64) Firefox/131")).toBe("linux");
    expect(detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605")).toBe("mac");
    expect(detectOs("Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/130")).toBe("android");
    expect(detectOs("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Safari")).toBe("ios");
    expect(detectOs("curl/8")).toBe("other");
    expect(detectOs("Mozilla/5.0 (X11; Linux x86_64)", "Windows")).toBe("windows"); // userAgentData wins
  });
  it("builds the electron-builder file names for a version and encodes the URL", () => {
    const list = installers("0.2.0");
    expect(list.map((i) => i.file)).toEqual(["EasAlpha POS Setup 0.2.0.exe", "EasAlpha POS-0.2.0.AppImage", "easalpha-desktop_0.2.0_amd64.deb", "EasAlpha POS-0.2.0.dmg", "EasAlpha POS-0.2.0-arm64.dmg"]);
    expect(installerUrl("https://updates.easalpha.com/desktop/", "EasAlpha POS Setup 0.2.0.exe")).toBe("https://updates.easalpha.com/desktop/EasAlpha%20POS%20Setup%200.2.0.exe");
  });
  it("puts this machine's installers first and gives phones none", () => {
    const list = installers("0.2.0");
    expect(ordered("linux", list).mine.map((i) => i.id)).toEqual(["appimage", "deb"]);
    expect(ordered("linux", list).others).toHaveLength(3);
    expect(ordered("android", list).mine).toEqual([]);
  });
  it("links to this site's own /downloads unless the owner set a folder", () => {
    expect(downloadsBase(null, "http://localhost:3000")).toBe("http://localhost:3000/downloads");
    expect(downloadsBase("  ", "https://easalpha.com/")).toBe("https://easalpha.com/downloads");
    expect(downloadsBase("https://updates.easalpha.com/desktop/", "https://easalpha.com")).toBe("https://updates.easalpha.com/desktop");
  });
  it("reads the origin from the request, behind a proxy too", () => {
    const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
    expect(originFromHeaders(h({ host: "localhost:3000" }), "https://easalpha.com")).toBe("http://localhost:3000");
    expect(originFromHeaders(h({ host: "easalpha.com" }), "https://x")).toBe("https://easalpha.com");
    expect(originFromHeaders(h({ host: "web:3000", "x-forwarded-host": "pos.easalpha.com", "x-forwarded-proto": "https" }), "https://x")).toBe("https://pos.easalpha.com");
    expect(originFromHeaders(h({}), "https://easalpha.com/")).toBe("https://easalpha.com");
  });
  it("keeps every installer and marks which ones the manifest says are uploaded, at the manifest's version", () => {
    const base = installers("0.1.0");
    expect(applyManifest(base, null).list.every((i) => i.available)).toBe(true);
    const r = applyManifest(base, { version: "0.3.0", files: [{ file: "EasAlpha POS-0.3.0.AppImage" }, { file: "EasAlpha POS Setup 0.3.0.exe" }] });
    expect(r.version).toBe("0.3.0");
    expect(r.list.map((i) => [i.id, i.available])).toEqual([["win", true], ["appimage", true], ["deb", false], ["mac-intel", false], ["mac-arm", false]]);
  });
  it("has a guide with requirements, steps and known issues for every kind of computer and phone", () => {
    expect(PLATFORM_GUIDES.map((g) => g.os)).toEqual(["windows", "mac", "linux"]);
    const ids = new Set(installers("1.0.0").map((i) => i.id));
    for (const g of PLATFORM_GUIDES) {
      expect(g.installerIds.every((id) => ids.has(id))).toBe(true);
      expect(g.requirements.length).toBeGreaterThan(1);
      expect(g.install.length).toBeGreaterThan(1);
      expect(g.issues.length).toBeGreaterThan(1);
    }
    expect(MOBILE_GUIDES.map((g) => g.os)).toEqual(["ios", "android"]);
    expect(AFTER_INSTALL.length).toBeGreaterThan(2);
  });
});
