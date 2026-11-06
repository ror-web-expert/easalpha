import { describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_GUARD_MS, CHUNK_RELOAD_KEY, isChunkLoadError, reloadForChunkError } from "./chunk-reload";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe("isChunkLoadError", () => {
  it("knows webpack's, the CSS loader's and the browsers' wording for a chunk that did not load", () => {
    expect(isChunkLoadError(Object.assign(new Error("Loading chunk 8165 failed.\n(error: https://easalpha.com/_next/static/chunks/8165-1a2b.js)"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 377 failed. (/_next/static/css/abc.css)"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://easalpha.com/_next/static/chunks/zxing.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError("error loading dynamically imported module")).toBe(true);
  });

  it("leaves every other error alone", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'lines')"))).toBe(false);
    expect(isChunkLoadError(new Error("Request timed out"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});

describe("reloadForChunkError", () => {
  it("reloads once, then not again within the guard, then again after it", () => {
    const storage = memory();
    const reload = vi.fn();
    const t0 = 1_700_000_000_000;
    expect(reloadForChunkError({ storage, now: t0, online: true, reload })).toBe(true);
    expect(storage.m.get(CHUNK_RELOAD_KEY)).toBe(String(t0));
    expect(reloadForChunkError({ storage, now: t0 + 20_000, online: true, reload })).toBe(false);
    expect(reloadForChunkError({ storage, now: t0 + CHUNK_RELOAD_GUARD_MS + 1, online: true, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload with no signal, nor without sessionStorage to guard the loop", () => {
    const reload = vi.fn();
    expect(reloadForChunkError({ storage: memory(), online: false, reload })).toBe(false);
    expect(reloadForChunkError({ storage: { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} }, online: true, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
