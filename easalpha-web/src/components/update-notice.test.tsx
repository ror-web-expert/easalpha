import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_KEY } from "@/lib/chunk-reload";

// Review R30: a till left open across a deploy asked for a chunk of the old build that is gone and stopped where it was.
const nav = vi.hoisted(() => ({ pathname: "/pos" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { UpdateNotice } from "./update-notice";

const chunkError = () => Object.assign(new Error("Loading chunk 8165 failed.\n(error: /_next/static/chunks/8165-1a2b.js)"), { name: "ChunkLoadError" });
const pill = () => screen.queryByText("A new version of EasAlpha is ready.");
let builds: string[];

beforeEach(() => {
  nav.pathname = "/pos";
  sessionStorage.clear();
  builds = ["build-1"];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ build: builds.length > 1 ? builds.shift() : builds[0] }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("a chunk that no longer loads", () => {
  it("reloads the page once, and shows the new-version pill the next time instead of reloading again", () => {
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    act(() => { window.dispatchEvent(new ErrorEvent("error", { error: chunkError(), message: chunkError().message })); });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull();
    act(() => { window.dispatchEvent(new ErrorEvent("error", { error: chunkError(), message: chunkError().message })); });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(pill()).toBeInTheDocument();
  });

  it("reloads for a lazily loaded part whose import nobody caught", () => {
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    act(() => { window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new TypeError("Failed to fetch dynamically imported module: /_next/static/chunks/zxing.js") })); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads for a build script that failed to load", () => {
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    const script = document.createElement("script");
    script.src = "/_next/static/chunks/app/pos/shift/page-3f2a.js";
    document.head.appendChild(script);
    act(() => { script.dispatchEvent(new Event("error")); });
    expect(reload).toHaveBeenCalledTimes(1);
    script.remove();
  });

  it("leaves the page alone for any other error", () => {
    const reload = vi.fn();
    render(<UpdateNotice reload={reload} />);
    act(() => { window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("x is undefined"), message: "x is undefined" })); });
    const img = document.createElement("img");
    img.src = "https://cdn.example.com/logo.png";
    document.body.appendChild(img);
    act(() => { img.dispatchEvent(new Event("error")); });
    expect(reload).not.toHaveBeenCalled();
    expect(pill()).toBeNull();
    img.remove();
  });
});

describe("the new-version pill", () => {
  it("waits for the next page after Later, rather than reloading on the press", async () => {
    builds = ["build-1", "build-2"];
    const reload = vi.fn();
    const { rerender } = render(<UpdateNotice reload={reload} />);
    await act(async () => {}); // first check: build-1
    await act(async () => { window.dispatchEvent(new Event("focus")); }); // second check: build-2
    expect(pill()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(pill()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    nav.pathname = "/pos/orders";
    rerender(<UpdateNotice reload={reload} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
