import { describe, expect, it } from "vitest";
import { installMode } from "./install-prompt";

const ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("installMode", () => {
  it("offers nothing inside the installed app", () => { expect(installMode(ANDROID, true, true)).toBe("installed"); expect(installMode(IPHONE, false, false, true)).toBe("installed"); });
  it("uses the browser prompt when Chrome has one", () => { expect(installMode(ANDROID, false, true)).toBe("prompt"); expect(installMode(DESKTOP, false, true)).toBe("prompt"); });
  it("shows the Share steps on an iPhone", () => { expect(installMode(IPHONE, false, false)).toBe("ios"); });
  it("points Android users to the menu when there is no prompt yet, and stays quiet on a desktop", () => {
    expect(installMode(ANDROID, false, false)).toBe("android-manual");
    expect(installMode(DESKTOP, false, false)).toBe("none");
  });
});
