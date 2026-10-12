import { describe, expect, it } from "vitest";
import { buildChanged, reloadsSilently } from "./update-check";

describe("update check", () => {
  it("reloads display screens silently and asks everywhere else", () => {
    expect(reloadsSilently("/kitchen")).toBe(true);
    expect(reloadsSilently("/token")).toBe(true);
    expect(reloadsSilently("/queue/")).toBe(true);
    expect(reloadsSilently("/pos")).toBe(false);
    expect(reloadsSilently("/admin/orders")).toBe(false);
    expect(reloadsSilently("/")).toBe(false);
  });
  it("detects a deploy only after a baseline and never in development", () => {
    expect(buildChanged(null, "abc")).toBe(false);
    expect(buildChanged("abc", "abc")).toBe(false);
    expect(buildChanged("abc", "def")).toBe(true);
    expect(buildChanged("abc", "dev")).toBe(false);
    expect(buildChanged("abc", null)).toBe(false);
  });
});
